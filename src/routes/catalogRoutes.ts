import { Router } from "express"
import { getBrands, getBrandById, createBrand, updateBrand, deleteBrand } from "../controllers/brandController"
import { getCategories, getCategoryBySlug, createCategory, updateCategory, deleteCategory } from "../controllers/categoryController"
import { getDeviceModels, getDevicesByBrand, createDeviceModel, updateDeviceModel, deleteDeviceModel } from "../controllers/deviceController"
import {
  getProductTemplates,
  getProductTemplatesByCategory,
  createProductTemplate,
  updateProductTemplate,
  deleteProductTemplate,
} from "../controllers/productTemplateController"
import { protect, authorize } from "../middlewares/authMiddleware"
import { upload, optimizeImages } from "../utils/upload"

const router = Router()

// Brands
router.get("/brands", getBrands)
router.get("/brands/:id", getBrandById)
router.post("/brands", protect, authorize("admin", "superadmin"), upload.single("logo"), optimizeImages, createBrand)
router.put("/brands/:id", protect, authorize("admin", "superadmin"), upload.single("logo"), optimizeImages, updateBrand)
router.delete("/brands/:id", protect, authorize("admin", "superadmin"), deleteBrand)

// Categories
router.get("/categories", getCategories)
router.get("/categories/:slug", getCategoryBySlug)
router.post("/categories", protect, authorize("admin", "superadmin"), upload.single("image"), optimizeImages, createCategory)
router.put("/categories/:id", protect, authorize("admin", "superadmin"), upload.single("image"), optimizeImages, updateCategory)
router.delete("/categories/:id", protect, authorize("admin", "superadmin"), deleteCategory)

// Devices (Phone Covers)
router.get("/devices", getDeviceModels)
router.get("/devices/brand/:brandSlug", getDevicesByBrand)
router.post("/devices", protect, authorize("admin", "superadmin"), createDeviceModel)
router.put("/devices/:id", protect, authorize("admin", "superadmin"), updateDeviceModel)
router.delete("/devices/:id", protect, authorize("admin", "superadmin"), deleteDeviceModel)

// Universal Product Templates (Tote Bags, Mousepads, Mugs, Tumblers, Coasters, Frames, etc.)
router.get("/product-templates", getProductTemplates)
router.get("/product-templates/category/:categoryId", getProductTemplatesByCategory)
router.post("/product-templates", protect, authorize("admin", "superadmin"), createProductTemplate)
router.put("/product-templates/:id", protect, authorize("admin", "superadmin"), updateProductTemplate)
router.delete("/product-templates/:id", protect, authorize("admin", "superadmin"), deleteProductTemplate)

export default router
