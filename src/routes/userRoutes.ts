import { Router } from "express"
import { getMyAddresses, createAddress, updateAddress, deleteAddress } from "../controllers/addressController"
import { getProductReviews, createReview, adminGetReviews, approveReview, deleteReview } from "../controllers/reviewController"
import { protect, authorize } from "../middlewares/authMiddleware"

const router = Router()

// Addresses (customer)
router.get("/addresses", protect, getMyAddresses)
router.post("/addresses", protect, createAddress)
router.put("/addresses/:id", protect, updateAddress)
router.delete("/addresses/:id", protect, deleteAddress)

// Reviews (public get, protected post)
router.get("/reviews/:productId", getProductReviews)
router.post("/reviews", protect, createReview)

// Reviews (admin)
router.get("/admin/reviews", protect, authorize("admin", "superadmin"), adminGetReviews)
router.put("/admin/reviews/:id/approve", protect, authorize("admin", "superadmin"), approveReview)
router.delete("/admin/reviews/:id", protect, authorize("admin", "superadmin"), deleteReview)

export default router
