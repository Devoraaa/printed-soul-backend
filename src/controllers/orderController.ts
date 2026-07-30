import { Request, Response, NextFunction } from "express"
import { Order } from "../models/Order"
import { Cart } from "../models/Cart"
import { Product } from "../models/Product"
import { Address } from "../models/Address"
import { ApiError } from "../api/ApiError"
import { ApiResponse } from "../api/ApiResponse"
import { asyncHandler } from "../api/asyncHandler"
import { QueryFeatures } from "../api/QueryFeatures"
import { razorpayService } from "../services/razorpayService"
import { emailService } from "../services/emailService"
import { OrderStatus } from "../models/Order"

// ── Customer: Create Order ─────────────────────────────────────────────────
import { payuService } from "../services/payuService"

// ── Customer: Create Order (Prepaid via PayU) ──────────────────────────────
export const createOrder = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
  const { shippingAddressId, notes } = req.body

  // Get cart
  const cart = await Cart.findOne({ user: req.user.id }).populate("items.product")
  if (!cart || cart.items.length === 0) return next(new ApiError(400, "Cart is empty"))

  // Get address
  const address = await Address.findOne({ _id: shippingAddressId, user: req.user.id })
  if (!address) return next(new ApiError(404, "Shipping address not found"))

  // Build order items + validate stock
  const items: any[] = []
  for (const cartItem of cart.items) {
    const product = cartItem.product as any
    if (product.stock < cartItem.quantity) {
      return next(new ApiError(400, `Insufficient stock for ${product.name}`))
    }
    items.push({
      product: product._id,
      name: product.name,
      price: product.price,
      quantity: cartItem.quantity,
    })
  }

  const itemsTotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const shippingCharge = itemsTotal >= 499 ? 0 : 49 // Free shipping above ₹499
  const totalAmount = itemsTotal + shippingCharge

  const shippingAddress = {
    label: address.label,
    fullName: address.fullName,
    phone: address.phone,
    street: address.street,
    city: address.city,
    state: address.state,
    pincode: address.pincode,
    country: address.country,
    isDefault: address.isDefault,
  }

  const order = await Order.create({
    user: req.user.id,
    items,
    shippingAddress,
    paymentMethod: "payu",
    paymentStatus: "pending",
    itemsTotal,
    shippingCharge,
    totalAmount,
    notes,
    status: "pending",
  })

  // Deduct stock
  for (const cartItem of cart.items) {
    await Product.findByIdAndUpdate((cartItem.product as any)._id, {
      $inc: { stock: -cartItem.quantity },
    })
  }

  // Clear cart
  cart.items = []
  await cart.save()

  // Generate PayU payment parameters
  const clientOrigin = process.env.CLIENT_URL || "http://localhost:5173"
  const apiOrigin = process.env.API_URL || "http://localhost:5000"
  const payuParams = {
    txnid: order.orderNumber,
    amount: totalAmount,
    productinfo: `Printed Soul Order #${order.orderNumber}`,
    firstname: address.fullName.split(" ")[0],
    email: req.user.email || "customer@printedsoul.in",
    phone: address.phone,
    surl: `${apiOrigin}/api/orders/payu/callback`,
    furl: `${apiOrigin}/api/orders/payu/callback`,
  }

  const payuData = payuService.generatePaymentHash(payuParams)
  order.payuTxnId = order.orderNumber
  await order.save()

  res.status(201).json(
    ApiResponse.success(
      {
        order,
        payu: {
          key: payuData.key,
          txnid: payuParams.txnid,
          amount: payuParams.amount,
          productinfo: payuParams.productinfo,
          firstname: payuParams.firstname,
          email: payuParams.email,
          phone: payuParams.phone,
          surl: payuParams.surl,
          furl: payuParams.furl,
          hash: payuData.hash,
          actionUrl: payuData.actionUrl,
        },
      },
      "Prepaid order created — proceed to PayU payment"
    )
  )
})

// ── PayU Response Callback & Auto Shiprocket Sync ────────────────────────
export const handlePayuCallback = asyncHandler(async (req: Request, res: Response) => {
  const payload = req.body
  const isValidHash = payuService.verifyResponseHash(payload)

  const { status, txnid, mihpayid } = payload
  const order = await Order.findOne({ orderNumber: txnid }).populate("user", "name email")

  const clientOrigin = process.env.CLIENT_URL || "http://localhost:5173"

  if (!order) {
    return res.redirect(`${clientOrigin}/track?error=OrderNotFound`)
  }

  if (status === "success" && (isValidHash || process.env.PAYU_ENV === "sandbox" || !process.env.PAYU_MERCHANT_SALT)) {
    order.paymentStatus = "paid"
    order.status = "processing"
    order.payuTxnId = txnid
    order.payuMihpayId = mihpayid
    order.statusHistory.push({
      status: "processing",
      timestamp: new Date(),
      note: `Prepaid Payment received via PayU (MihPayID: ${mihpayid || "N/A"})`,
    })

    // AUTO PUSH TO SHIPROCKET UPON SUCCESSFUL PREPAID PAYMENT!
    try {
      const { trackingService } = require("../services/trackingService")
      const shiprocketResult = await trackingService.createShiprocketOrder(order)
      if (shiprocketResult.success) {
        order.courierPartner = "Shiprocket"
        if (shiprocketResult.awbCode) {
          order.trackingNumber = shiprocketResult.awbCode
          order.trackingUrl = trackingService.generateTrackingUrl("Shiprocket", shiprocketResult.awbCode)
        }
        order.statusHistory.push({
          status: "processing",
          timestamp: new Date(),
          note: `Auto-created shipment in Shiprocket (Order ID: ${shiprocketResult.shiprocketOrderId || "N/A"})`,
        })
      }
    } catch (shipErr: any) {
      console.error("Auto Shiprocket sync error on payment success:", shipErr.message)
    }

    await order.save()

    const user = order.user as any
    if (user?.email) {
      emailService.sendOrderConfirmation(user.email, user.name || "Customer", order).catch(() => {})
    }

    return res.redirect(`${clientOrigin}/order-success/${order._id}`)
  } else {
    order.paymentStatus = "failed"
    order.statusHistory.push({
      status: "pending",
      timestamp: new Date(),
      note: "PayU Payment failed or cancelled",
    })
    await order.save()

    return res.redirect(`${clientOrigin}/track?query=${order.orderNumber}&payment=failed`)
  }
})

// ── Customer: Verify Razorpay Payment ─────────────────────────────────────
export const verifyPayment = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
  const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body

  const order = await Order.findOne({ _id: orderId, user: req.user.id })
  if (!order) return next(new ApiError(404, "Order not found"))

  const isValid = razorpayService.verifyPayment(razorpayOrderId, razorpayPaymentId, razorpaySignature)
  if (!isValid) {
    order.paymentStatus = "failed"
    await order.save()
    return next(new ApiError(400, "Payment verification failed"))
  }

  order.paymentStatus = "paid"
  order.razorpayPaymentId = razorpayPaymentId
  order.razorpaySignature = razorpaySignature
  order.status = "processing"
  order.statusHistory.push({ status: "processing", timestamp: new Date(), note: "Payment received" })
  await order.save()

  emailService.sendOrderConfirmation(req.user.email, req.user.name, order).catch(() => {})

  res.json(ApiResponse.success(order, "Payment verified — order confirmed"))
})

// ── Customer: My Orders ────────────────────────────────────────────────────
export const getMyOrders = asyncHandler(async (req: any, res: Response) => {
  const page = parseInt(req.query.page as string) || 1
  const limit = parseInt(req.query.limit as string) || 10
  const skip = (page - 1) * limit

  const [orders, total] = await Promise.all([
    Order.find({ user: req.user.id }).sort("-createdAt").skip(skip).limit(limit),
    Order.countDocuments({ user: req.user.id }),
  ])

  res.json(ApiResponse.success(orders, "Orders retrieved", { total, page, limit }))
})

export const getMyOrderById = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
  const order = await Order.findOne({ _id: req.params.id, user: req.user.id })
  if (!order) return next(new ApiError(404, "Order not found"))
  res.json(ApiResponse.success(order, "Order retrieved"))
})

export const cancelOrder = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
  const order = await Order.findOne({ _id: req.params.id, user: req.user.id })
  if (!order) return next(new ApiError(404, "Order not found"))

  const cancellable: OrderStatus[] = ["pending", "processing"]
  if (!cancellable.includes(order.status)) {
    return next(new ApiError(400, `Order cannot be cancelled at '${order.status}' stage`))
  }

  order.status = "cancelled"
  order.cancelReason = req.body.reason || "Cancelled by customer"
  order.statusHistory.push({ status: "cancelled", timestamp: new Date(), note: order.cancelReason })

  // Restore stock
  for (const item of order.items) {
    await Product.findByIdAndUpdate(item.product, { $inc: { stock: item.quantity } })
  }

  await order.save()
  res.json(ApiResponse.success(order, "Order cancelled"))
})

// ── Admin: All Orders ──────────────────────────────────────────────────────
export const adminGetOrders = asyncHandler(async (req: Request, res: Response) => {
  const { status, page = 1, limit = 20 } = req.query
  const filter: any = {}
  if (status) filter.status = status

  const skip = (parseInt(page as string) - 1) * parseInt(limit as string)
  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate("user", "name email phone")
      .sort("-createdAt")
      .skip(skip)
      .limit(parseInt(limit as string)),
    Order.countDocuments(filter),
  ])

  res.json(ApiResponse.success(orders, "All orders", { total, page: parseInt(page as string), limit: parseInt(limit as string) }))
})

export const adminGetOrderById = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const order = await Order.findById(req.params.id).populate("user", "name email phone")
  if (!order) return next(new ApiError(404, "Order not found"))
  res.json(ApiResponse.success(order, "Order retrieved"))
})

export const adminUpdateOrderStatus = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
  const { status, trackingNumber, note } = req.body
  const order = await Order.findById(req.params.id).populate("user", "name email")
  if (!order) return next(new ApiError(404, "Order not found"))

  order.status = status
  if (trackingNumber) order.trackingNumber = trackingNumber
  order.statusHistory.push({ status, timestamp: new Date(), note: note || `Status updated to ${status}` })
  await order.save()

  const user = order.user as any

  // Send email notifications on key status changes
  if (status === "shipped") {
    emailService.sendShippingNotification(user.email, user.name, order).catch(() => {})
  } else if (status === "delivered") {
    emailService.sendDeliveryConfirmation(user.email, user.name, order).catch(() => {})
  }

  res.json(ApiResponse.success(order, `Order status updated to ${status}`))
})

// ── Admin: Dashboard Stats ─────────────────────────────────────────────────
export const getOrderStats = asyncHandler(async (req: Request, res: Response) => {
  const [totalOrders, pendingOrders, totalRevenue, todayOrders] = await Promise.all([
    Order.countDocuments(),
    Order.countDocuments({ status: "pending" }),
    Order.aggregate([
      { $match: { paymentStatus: "paid" } },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } },
    ]),
    Order.countDocuments({
      createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
    }),
  ])

  res.json(ApiResponse.success({
    totalOrders,
    pendingOrders,
    totalRevenue: totalRevenue[0]?.total || 0,
    todayOrders,
  }, "Order stats retrieved"))
})

// ── Admin: Update Tracking & Logistics ─────────────────────────────────────
export const adminUpdateTracking = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { trackingNumber, courierPartner, estimatedDelivery, trackingUrl, updateStatusToShipped } = req.body
  const order = await Order.findById(req.params.id).populate("user", "name email")
  if (!order) return next(new ApiError(404, "Order not found"))

  if (trackingNumber) order.trackingNumber = trackingNumber
  if (courierPartner) order.courierPartner = courierPartner
  if (estimatedDelivery) order.estimatedDelivery = new Date(estimatedDelivery)

  if (trackingUrl) {
    order.trackingUrl = trackingUrl
  } else if (trackingNumber) {
    const { trackingService } = require("../services/trackingService")
    order.trackingUrl = trackingService.generateTrackingUrl(courierPartner || order.courierPartner || "Shiprocket", trackingNumber)
  }

  if (updateStatusToShipped || (order.status !== "shipped" && order.status !== "delivered")) {
    order.status = "shipped"
    order.statusHistory.push({
      status: "shipped",
      timestamp: new Date(),
      note: `Dispatched via ${order.courierPartner || "Courier"} (AWB: ${order.trackingNumber})`
    })
  }

  await order.save()

  const user = order.user as any
  if (user?.email) {
    emailService.sendShippingNotification(user.email, user.name || "Valued Customer", order).catch(() => {})
  }

  res.json(ApiResponse.success(order, "Tracking information updated and customer notified"))
})

// ── Public: Track Order by Number or AWB ─────────────────────────────────
export const trackOrder = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const query = (req.params.query || "").trim()
  if (!query) return next(new ApiError(400, "Please provide Order ID or AWB Number"))

  const mongoose = require("mongoose")
  const order = await Order.findOne({
    $or: [
      { orderNumber: { $regex: new RegExp(`^${query}$`, "i") } },
      { trackingNumber: { $regex: new RegExp(`^${query}$`, "i") } },
      ...(mongoose.isValidObjectId(query) ? [{ _id: query }] : [])
    ]
  }).populate("items.product", "name images coverImage price")

  if (!order) return next(new ApiError(404, "No order found matching this Order Number or AWB"))

  res.json(ApiResponse.success(order, "Order tracking info retrieved"))
})

// ── Admin: Push Order to Shiprocket ─────────────────────────────────────────
export const adminPushToShiprocket = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const order = await Order.findById(req.params.id).populate("user", "name email")
  if (!order) return next(new ApiError(404, "Order not found"))

  const { trackingService } = require("../services/trackingService")
  const result = await trackingService.createShiprocketOrder(order)

  if (!result.success) {
    return next(new ApiError(400, result.message || "Failed to push order to Shiprocket"))
  }

  order.courierPartner = "Shiprocket"
  if (result.awbCode) {
    order.trackingNumber = result.awbCode
    order.trackingUrl = trackingService.generateTrackingUrl("Shiprocket", result.awbCode)
  }
  order.statusHistory.push({
    status: order.status,
    timestamp: new Date(),
    note: `Shipment created in Shiprocket (Order ID: ${result.shiprocketOrderId || "N/A"})`
  })

  await order.save()
  res.json(ApiResponse.success({ order, shiprocket: result }, "Order successfully pushed to Shiprocket"))
})
