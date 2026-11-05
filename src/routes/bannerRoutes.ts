import { Router } from "express"
import {
  getBanners,
  adminGetBanners,
  createBanner,
  updateBanner,
  deleteBanner,
  getTicker,
  adminGetTicker,
  updateTicker,
} from "../controllers/bannerController"
import { protect, authorize } from "../middlewares/authMiddleware"
import { upload, optimizeImages } from "../utils/upload"

const router = Router()

// Public routes
router.get("/", getBanners)
router.get("/ticker", getTicker)

// Admin routes
router.use(protect)
router.use(authorize("admin", "superadmin"))

router.route("/admin/ticker")
  .get(adminGetTicker)
  .put(updateTicker)

const bannerUploadFields = upload.fields([
  { name: "images", maxCount: 1 },
  { name: "image", maxCount: 1 },
  { name: "mobileImage", maxCount: 1 },
])

router.route("/admin")
  .get(adminGetBanners)
  .post(bannerUploadFields, optimizeImages, createBanner)

router.route("/admin/:id")
  .put(bannerUploadFields, optimizeImages, updateBanner)
  .delete(deleteBanner)

export default router
