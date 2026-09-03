import { Router } from "express"
import { getBanners, adminGetBanners, createBanner, updateBanner, deleteBanner } from "../controllers/bannerController"
import { protect, authorize } from "../middlewares/authMiddleware"
import { upload, optimizeImages } from "../utils/upload"

const router = Router()

// Public route
router.get("/", getBanners)

// Admin routes
router.use(protect)
router.use(authorize("admin", "superadmin"))

router.route("/admin")
  .get(adminGetBanners)
  .post(upload.array("images", 1), optimizeImages, createBanner)

router.route("/admin/:id")
  .put(upload.array("images", 1), optimizeImages, updateBanner)
  .delete(deleteBanner)

export default router
