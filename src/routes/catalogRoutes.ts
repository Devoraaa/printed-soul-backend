import { Router } from "express"
import { getBrands, getBrandById, createBrand, updateBrand, deleteBrand } from "../controllers/brandController"
import { getCategories, getCategoryBySlug, createCategory, updateCategory, deleteCategory } from "../controllers/categoryController"
import { getDeviceModels, getDevicesByBrand, createDeviceModel, updateDeviceModel, deleteDeviceModel } from "../controllers/deviceController"
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

// Devices
router.get("/devices", getDeviceModels)
router.get("/devices/brand/:brandSlug", getDevicesByBrand)
router.post("/devices", protect, authorize("admin", "superadmin"), createDeviceModel)
router.put("/devices/:id", protect, authorize("admin", "superadmin"), updateDeviceModel)
router.delete("/devices/:id", protect, authorize("admin", "superadmin"), deleteDeviceModel)

export default router
