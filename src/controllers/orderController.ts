import { Request, Response, NextFunction } from "express"
import { Order } from "../models/Order"
import { Cart } from "../models/Cart"
import { Product } from "../models/Product"
import { Address } from "../models/Address"
import { ApiError } from "../api/ApiError"
import { ApiResponse } from "../api/ApiResponse"
import { asyncHandler } from "../api/asyncHandler"
import { emailService } from "../services/emailService"
import { OrderStatus } from "../models/Order"
import { payuService } from "../services/payuService"
import { delhiveryService } from "../services/delhiveryService"

// ── Customer: Create Order (Prepaid via PayU only) ─────────────────────────
export const createOrder = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
  const { shippingAddressId, notes } = req.body

  const cart = await Cart.findOne({ user: req.user.id }).populate("items.product")
  if (!cart || cart.items.length === 0) return next(new ApiError(400, "Cart is empty"))

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
  const shippingCharge = itemsTotal >= 499 ? 0 : 49
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
      "Order created — proceed to PayU payment"
    )
  )
})

// ── PayU Callback → Auto-push to Delhivery on payment success ─────────────
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
      note: `Payment received via PayU (MihPayID: ${mihpayid || "N/A"})`,
    })

    // ── AUTO-PUSH TO DELHIVERY ONE ──────────────────────────────────────
    try {
      const result = await delhiveryService.createShipment(order)
      if (result.success && result.awbCode) {
        order.courierPartner = "Delhivery"
        order.trackingNumber = result.awbCode
        order.trackingUrl = delhiveryService.generateTrackingUrl(result.awbCode)
        order.statusHistory.push({
          status: "processing",
          timestamp: new Date(),
          note: `Shipment auto-created on Delhivery One (AWB: ${result.awbCode})`,
        })
        console.log(`✅ Delhivery shipment created — AWB: ${result.awbCode}`)
      } else {
        console.error(`⚠️ Delhivery auto-create failed: ${result.message}`)
        order.statusHistory.push({
          status: "processing",
          timestamp: new Date(),
          note: `Delhivery auto-create failed: ${result.message} — push manually from admin panel`,
        })
      }
    } catch (delErr: any) {
      console.error("Delhivery auto-push error:", delErr.message)
    }
    // ────────────────────────────────────────────────────────────────────

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

// ── Customer: Cancel Order + Delhivery cancel ─────────────────────────────
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

  // Cancel shipment on Delhivery if AWB exists
  if (order.trackingNumber && order.courierPartner?.toLowerCase().includes("delhivery")) {
    try {
      const cancelResult = await delhiveryService.cancelShipment(order.trackingNumber)
      if (cancelResult.success) {
        order.statusHistory.push({
          status: "cancelled",
          timestamp: new Date(),
          note: `Delhivery shipment (AWB: ${order.trackingNumber}) cancelled successfully`,
        })
      } else {
        order.statusHistory.push({
          status: "cancelled",
          timestamp: new Date(),
          note: `Delhivery cancel attempt: ${cancelResult.message}`,
        })
      }
    } catch (err: any) {
      console.error("Delhivery cancel error on customer cancel:", err.message)
    }
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

// ── Admin: Update Status + auto Delhivery cancel on cancelled ─────────────
export const adminUpdateOrderStatus = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
  const { status, trackingNumber, note } = req.body
  const order = await Order.findById(req.params.id).populate("user", "name email")
  if (!order) return next(new ApiError(404, "Order not found"))

  order.status = status
  if (trackingNumber) order.trackingNumber = trackingNumber
  order.statusHistory.push({ status, timestamp: new Date(), note: note || `Status updated to ${status}` })

  // If admin cancels and there's a Delhivery AWB → cancel on Delhivery too
  if (status === "cancelled" && order.trackingNumber && order.courierPartner?.toLowerCase().includes("delhivery")) {
    try {
      const cancelResult = await delhiveryService.cancelShipment(order.trackingNumber)
      order.statusHistory.push({
        status: "cancelled",
        timestamp: new Date(),
        note: cancelResult.success
          ? `Delhivery shipment (AWB: ${order.trackingNumber}) cancelled`
          : `Delhivery cancel attempt failed: ${cancelResult.message}`,
      })
    } catch (err: any) {
      console.error("Delhivery cancel error on admin cancel:", err.message)
    }
  }

  await order.save()

  const user = order.user as any
  if (status === "shipped") {
    emailService.sendShippingNotification(user.email, user.name, order).catch(() => {})
  } else if (status === "delivered") {
    emailService.sendDeliveryConfirmation(user.email, user.name, order).catch(() => {})
  }

  res.json(ApiResponse.success(order, `Order status updated to ${status}`))
})

// ── Admin: Manual Push to Delhivery (if auto-push failed) ─────────────────
export const adminPushToDelhivery = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const order = await Order.findById(req.params.id).populate("user", "name email")
  if (!order) return next(new ApiError(404, "Order not found"))

  if (order.paymentStatus !== "paid") {
    return next(new ApiError(400, "Cannot push unpaid order to Delhivery"))
  }

  const result = await delhiveryService.createShipment(order)

  if (!result.success) {
    return next(new ApiError(400, result.message || "Failed to push order to Delhivery"))
  }

  order.courierPartner = "Delhivery"
  if (result.awbCode) {
    order.trackingNumber = result.awbCode
    order.trackingUrl = delhiveryService.generateTrackingUrl(result.awbCode)
  }
  order.statusHistory.push({
    status: order.status,
    timestamp: new Date(),
    note: `Shipment manually pushed to Delhivery (AWB: ${result.awbCode || "pending"})`,
  })

  await order.save()
  res.json(ApiResponse.success({ order, delhivery: result }, "Order successfully pushed to Delhivery"))
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

// ── Admin: Update Tracking Manually ───────────────────────────────────────
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
    order.trackingUrl = delhiveryService.generateTrackingUrl(trackingNumber)
  }

  if (updateStatusToShipped || (order.status !== "shipped" && order.status !== "delivered")) {
    order.status = "shipped"
    order.statusHistory.push({
      status: "shipped",
      timestamp: new Date(),
      note: `Dispatched via ${order.courierPartner || "Delhivery"} (AWB: ${order.trackingNumber})`,
    })
  }

  await order.save()

  const user = order.user as any
  if (user?.email) {
    emailService.sendShippingNotification(user.email, user.name || "Customer", order).catch(() => {})
  }

  res.json(ApiResponse.success(order, "Tracking updated and customer notified"))
})

// ── Public: Track Order ────────────────────────────────────────────────────
export const trackOrder = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const query = (req.params.query || "").trim()
  if (!query) return next(new ApiError(400, "Please provide Order ID or AWB Number"))

  const mongoose = require("mongoose")
  const order = await Order.findOne({
    $or: [
      { orderNumber: { $regex: new RegExp(`^${query}$`, "i") } },
      { trackingNumber: { $regex: new RegExp(`^${query}$`, "i") } },
      ...(mongoose.isValidObjectId(query) ? [{ _id: query }] : []),
    ],
  }).populate("items.product", "name images coverImage price")

  if (!order) return next(new ApiError(404, "No order found matching this Order Number or AWB"))

  res.json(ApiResponse.success(order, "Order tracking info retrieved"))
})
