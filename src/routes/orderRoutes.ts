import { Router } from "express"
import {
  createOrder, getMyOrders, getMyOrderById, cancelOrder,
  adminGetOrders, adminGetOrderById, adminUpdateOrderStatus, getOrderStats,
  adminUpdateTracking, trackOrder, adminPushToDelhivery, handlePayuCallback
} from "../controllers/orderController"
import { protect, authorize } from "../middlewares/authMiddleware"

const router = Router()

// Public — Tracking & PayU Callback
router.get("/track/:query", trackOrder)
router.post("/payu/callback", handlePayuCallback)

// Customer
router.post("/", protect, createOrder)
router.get("/my", protect, getMyOrders)
router.get("/my/:id", protect, getMyOrderById)
router.put("/my/:id/cancel", protect, cancelOrder)

// Admin
router.get("/admin/stats", protect, authorize("admin", "superadmin"), getOrderStats)
router.get("/admin", protect, authorize("admin", "superadmin"), adminGetOrders)
router.get("/admin/:id", protect, authorize("admin", "superadmin"), adminGetOrderById)
router.put("/admin/:id/status", protect, authorize("admin", "superadmin"), adminUpdateOrderStatus)
router.put("/admin/:id/tracking", protect, authorize("admin", "superadmin"), adminUpdateTracking)
router.post("/admin/:id/delhivery", protect, authorize("admin", "superadmin"), adminPushToDelhivery)

export default router
