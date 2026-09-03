import { Router } from "express"
import {
  createOrder, getMyOrders, getMyOrderById, cancelOrder,
  adminGetOrders, adminGetOrderById, adminUpdateOrderStatus, getOrderStats,
  adminUpdateTracking, trackOrder, adminPushToDelhivery, handlePayuCallback,
  adminUpdatePaymentStatus, downloadOrderInvoice
} from "../controllers/orderController"
import { protect, authorize, optionalAuth } from "../middlewares/authMiddleware"

const router = Router()

// Public — Tracking, PayU Callback & Invoice Download
router.get("/track/:query", trackOrder)
router.get("/:id/invoice", downloadOrderInvoice)
router.post("/payu/callback", handlePayuCallback)

// Customer (Optional Auth for Guest Checkout)
router.post("/", optionalAuth, createOrder)
router.get("/my", protect, getMyOrders)
router.get("/my/:id", protect, getMyOrderById)
router.put("/my/:id/cancel", protect, cancelOrder)

// Admin
router.get("/admin/stats", protect, authorize("admin", "superadmin"), getOrderStats)
router.get("/admin", protect, authorize("admin", "superadmin"), adminGetOrders)
router.get("/admin/:id", protect, authorize("admin", "superadmin"), adminGetOrderById)
router.put("/admin/:id/status", protect, authorize("admin", "superadmin"), adminUpdateOrderStatus)
router.put("/admin/:id/tracking", protect, authorize("admin", "superadmin"), adminUpdateTracking)
router.put("/admin/:id/payment-status", protect, authorize("admin", "superadmin"), adminUpdatePaymentStatus)
router.post("/admin/:id/delhivery", protect, authorize("admin", "superadmin"), adminPushToDelhivery)

export default router
