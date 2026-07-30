import { Router } from "express"
import { uploadImage, uploadImages, serveImage, deleteImage } from "../controllers/imageController"
import { protect, authorize } from "../middlewares/authMiddleware"
import { upload } from "../utils/upload"

const router = Router()

// Public: serve image
router.get("/:id", serveImage)

// Protected: upload
router.post("/upload", protect, upload.single("image"), uploadImage)
router.post("/upload/bulk", protect, authorize("admin", "superadmin"), upload.array("images", 20), uploadImages)
router.delete("/:id", protect, authorize("admin", "superadmin"), deleteImage)

export default router
