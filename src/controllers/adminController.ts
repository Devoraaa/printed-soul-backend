import { Request, Response, NextFunction } from "express"
import { User } from "../models/User"
import { Order } from "../models/Order"
import { Product } from "../models/Product"
import { Review } from "../models/Review"
import { ApiError } from "../api/ApiError"
import { ApiResponse } from "../api/ApiResponse"
import { asyncHandler } from "../api/asyncHandler"
import { QueryFeatures } from "../api/QueryFeatures"

// Dashboard Overview Stats
export const getDashboardStats = asyncHandler(async (req: Request, res: Response) => {
  const [
    totalUsers, totalProducts, totalOrders, pendingOrders,
    totalRevenue, lowStockProducts, todayOrders,
    recentOrders,
  ] = await Promise.all([
    User.countDocuments({ role: "user" }),
    Product.countDocuments({ isActive: true }),
    Order.countDocuments(),
    Order.countDocuments({ status: "pending" }),
    Order.aggregate([{ $match: { paymentStatus: "paid" } }, { $group: { _id: null, total: { $sum: "$totalAmount" } } }]),
    Product.countDocuments({ stock: { $lte: 5 }, isActive: true }),
    Order.countDocuments({ createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } }),
    Order.find().sort("-createdAt").limit(5).populate("user", "name email"),
  ])

  res.json(ApiResponse.success({
    totalUsers,
    totalProducts,
    totalOrders,
    pendingOrders,
    totalRevenue: totalRevenue[0]?.total || 0,
    lowStockProducts,
    todayOrders,
    recentOrders,
  }, "Dashboard stats"))
})

// Analytics — Revenue over last 30 days
export const getRevenueAnalytics = asyncHandler(async (req: Request, res: Response) => {
  const days = parseInt(req.query.days as string) || 30
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  const revenue = await Order.aggregate([
    { $match: { createdAt: { $gte: startDate }, paymentStatus: "paid" } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        revenue: { $sum: "$totalAmount" },
        orders: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ])

  res.json(ApiResponse.success(revenue, "Revenue analytics"))
})

// Analytics — Orders by status
export const getOrdersByStatus = asyncHandler(async (req: Request, res: Response) => {
  const data = await Order.aggregate([
    { $group: { _id: "$status", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ])
  res.json(ApiResponse.success(data, "Orders by status"))
})

// Analytics — Top selling products
export const getTopProducts = asyncHandler(async (req: Request, res: Response) => {
  const data = await Order.aggregate([
    { $unwind: "$items" },
    { $group: { _id: "$items.product", name: { $first: "$items.name" }, totalSold: { $sum: "$items.quantity" }, revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } } } },
    { $sort: { totalSold: -1 } },
    { $limit: 10 },
  ])
  res.json(ApiResponse.success(data, "Top products"))
})

// Admin: All customers
export const getCustomers = asyncHandler(async (req: Request, res: Response) => {
  const features = new QueryFeatures(
    User.find({ role: "user" }).select("-password") as any,
    req.query
  )
  features.filter().search(["name", "email", "phone"]).sort().paginate()

  const [users, total] = await Promise.all([features.query, User.countDocuments({ role: "user" })])
  res.json(ApiResponse.success(users, "Customers retrieved", { total }))
})

export const getCustomerById = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const user = await User.findById(req.params.id).select("-password")
  if (!user) return next(new ApiError(404, "Customer not found"))

  const orders = await Order.find({ user: req.params.id }).sort("-createdAt").limit(10)
  res.json(ApiResponse.success({ user, orders }, "Customer profile"))
})

// Inventory management
export const getLowStockProducts = asyncHandler(async (req: Request, res: Response) => {
  const products = await Product.find({
    $expr: { $lte: ["$stock", "$lowStockThreshold"] },
    isActive: true,
  })
    .select("name sku stock lowStockThreshold images coverImage")
    .sort("stock")
  res.json(ApiResponse.success(products, "Low stock products"))
})

export const updateProductStock = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { stock } = req.body
  const product = await Product.findByIdAndUpdate(
    req.params.id,
    { stock: parseInt(stock) },
    { new: true }
  )
  if (!product) return next(new ApiError(404, "Product not found"))
  res.json(ApiResponse.success(product, "Stock updated"))
})
