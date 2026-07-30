import { Router } from "express"
import { botAuth } from "../middlewares/authMiddleware"
import { upload } from "../utils/upload"
import {
  getBotCatalogInfo,
  botCreateCategory,
  botCreateDirectProduct,
  botTriggerMobileCoverAutomation,
  getBotDesignStatus,
  botFastCoverUpload,
} from "../controllers/botController"

const router = Router()

// All bot routes require bot API key
router.use(botAuth)

// Catalog info (brands + categories) for bot menus
router.get("/catalog-info", getBotCatalogInfo)

// Create new category
router.post("/categories", botCreateCategory)

// Direct product upload — non-mobile (tote bag, tumbler, mug, wall frame)
// Accepts multiple images
router.post("/products", upload.array("images", 10), botCreateDirectProduct)

// Mobile cover automation — single design image → mockup queue
router.post("/mobile-cover", upload.single("design"), botTriggerMobileCoverAutomation)

// Poll automation progress
router.get("/design-status/:designId", getBotDesignStatus)

// Fast multi-image upload for single device ID
router.post("/fast-cover", upload.array("images", 10), botFastCoverUpload)

export default router
