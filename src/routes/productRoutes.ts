import { Router } from "express"
import {
  getProducts, getProductBySlug, getFeaturedProducts, getProductsByDevice,
  createProduct, updateProduct, deleteProduct, adminGetProducts, removeProductImage, generateManualMockup
} from "../controllers/productController"
import { protect, authorize } from "../middlewares/authMiddleware"
import { upload } from "../utils/upload"

const router = Router()

// Public
router.get("/", getProducts)
router.get("/featured", getFeaturedProducts)
router.get("/by-device/:deviceSlug", getProductsByDevice)
router.get("/:slug", getProductBySlug)

// Admin
router.get("/admin/all", protect, authorize("admin", "superadmin"), adminGetProducts)
router.post("/", protect, authorize("admin", "superadmin"), upload.array("images", 10), createProduct)
router.put("/:id", protect, authorize("admin", "superadmin"), upload.array("images", 10), updateProduct)
router.delete("/:id/images/:imageId", protect, authorize("admin", "superadmin"), removeProductImage)
router.post("/:id/mockup", protect, authorize("admin", "superadmin"), upload.single("design"), generateManualMockup)
router.delete("/:id", protect, authorize("admin", "superadmin"), deleteProduct)

export default router
