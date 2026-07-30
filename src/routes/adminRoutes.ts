import { Router } from "express"
import {
  getDashboardStats, getRevenueAnalytics, getOrdersByStatus, getTopProducts,
  getCustomers, getCustomerById, getLowStockProducts, updateProductStock,
} from "../controllers/adminController"
import { bulkGenerateProducts, previewBulkGeneration } from "../controllers/automationController"
import { protect, authorize } from "../middlewares/authMiddleware"

const router = Router()
router.use(protect, authorize("admin", "superadmin"))

// Dashboard
router.get("/dashboard", getDashboardStats)

// Analytics
router.get("/analytics/revenue", getRevenueAnalytics)
router.get("/analytics/orders-by-status", getOrdersByStatus)
router.get("/analytics/top-products", getTopProducts)

// Customers
router.get("/customers", getCustomers)
router.get("/customers/:id", getCustomerById)

// Inventory
router.get("/inventory/low-stock", getLowStockProducts)
router.put("/inventory/:id/stock", updateProductStock)

// Product Automation
router.post("/automation/preview", previewBulkGeneration)
router.post("/automation/generate", bulkGenerateProducts)

export default router
