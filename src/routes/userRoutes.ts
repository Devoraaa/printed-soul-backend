import { Router, Request, Response } from "express"
import { getMyAddresses, createAddress, updateAddress, deleteAddress } from "../controllers/addressController"
import { getProductReviews, createReview, adminGetReviews, approveReview, deleteReview } from "../controllers/reviewController"
import { protect, authorize } from "../middlewares/authMiddleware"
import { Review } from "../models/Review"

const router = Router()

// Addresses (customer)
router.get("/addresses", protect, getMyAddresses)
router.post("/addresses", protect, createAddress)
router.put("/addresses/:id", protect, updateAddress)
router.delete("/addresses/:id", protect, deleteAddress)

// Reviews (public get, protected post)
router.get("/reviews/:productId", getProductReviews)
router.post("/reviews", protect, createReview)

// Toggle helpful vote on review
router.put("/reviews/:reviewId/helpful", protect, async (req: Request, res: Response) => {
  try {
    const review = await Review.findById(req.params.reviewId)
    if (!review) return res.status(404).json({ success: false, message: "Review not found" })
    const userId = (req as any).user._id
    const idx = review.helpfulVotes?.findIndex(id => id.toString() === userId.toString()) ?? -1
    if (idx > -1) {
      review.helpfulVotes!.splice(idx, 1)
    } else {
      review.helpfulVotes!.push(userId)
    }
    await review.save()
    res.json({ success: true, helpful: idx === -1, count: review.helpfulVotes!.length })
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" })
  }
})

// Reviews (admin)
router.get("/admin/reviews", protect, authorize("admin", "superadmin"), adminGetReviews)
router.put("/admin/reviews/:id/approve", protect, authorize("admin", "superadmin"), approveReview)
router.delete("/admin/reviews/:id", protect, authorize("admin", "superadmin"), deleteReview)

export default router
