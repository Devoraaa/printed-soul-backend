import { Request, Response, NextFunction } from "express"
import { Review } from "../models/Review"
import { Order } from "../models/Order"
import { ApiError } from "../api/ApiError"
import { ApiResponse } from "../api/ApiResponse"
import { asyncHandler } from "../api/asyncHandler"
import { QueryFeatures } from "../api/QueryFeatures"

export const getProductReviews = asyncHandler(async (req: Request, res: Response) => {
  const reviews = await Review.find({ product: req.params.productId, isApproved: true })
    .populate("user", "name avatar")
    .sort("-createdAt")
  res.json(ApiResponse.success(reviews, "Reviews retrieved"))
})

export const createReview = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
  const { productId, product, rating, title, comment } = req.body
  const targetProduct = productId || product

  if (!rating || rating < 1 || rating > 5) {
    return next(new ApiError(400, "Please select a rating between 1 and 5 stars"))
  }

  if (!comment || !comment.trim()) {
    return next(new ApiError(400, "Review comment cannot be empty"))
  }

  // Check if user has purchased this product (marks verified badge)
  const hasPurchased = await Order.findOne({
    user: req.user.id,
    "items.product": targetProduct,
    status: "delivered",
  })

  const isAdmin = req.user.role === "admin" || req.user.role === "superadmin"

  // Check if user already reviewed - update it instead of throwing error
  let review = await Review.findOne({ product: targetProduct, user: req.user.id })
  if (review) {
    review.rating = rating
    review.title = title
    review.comment = comment
    review.isVerifiedPurchase = !!hasPurchased
    review.isApproved = isAdmin ? true : false
    await review.save()
  } else {
    review = await Review.create({
      product: targetProduct,
      user: req.user.id,
      rating,
      title,
      comment,
      isVerifiedPurchase: !!hasPurchased,
      isApproved: isAdmin ? true : false,
    })
  }

  if (review.isApproved) {
    await updateProductRatings(targetProduct)
  }

  res.status(201).json(ApiResponse.success(
    review, 
    review.isApproved 
      ? "Review published successfully!" 
      : "Thank you! Your review has been submitted for moderation."
  ))
})

// Admin
export const adminGetReviews = asyncHandler(async (req: Request, res: Response) => {
  const features = new QueryFeatures(
    Review.find().populate("user", "name email").populate("product", "name slug") as any,
    req.query
  )
  features.filter().sort().paginate()
  const reviews = await features.query
  res.json(ApiResponse.success(reviews, "All reviews"))
})

export const approveReview = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const review = await Review.findByIdAndUpdate(req.params.id, { isApproved: true }, { new: true })
  if (!review) return next(new ApiError(404, "Review not found"))
  
  await updateProductRatings(review.product)
  res.json(ApiResponse.success(review, "Review approved"))
})

export const deleteReview = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const review = await Review.findByIdAndDelete(req.params.id)
  if (!review) return next(new ApiError(404, "Review not found"))

  await updateProductRatings(review.product)
  res.json(ApiResponse.success({}, "Review deleted"))
})

async function updateProductRatings(productId: any) {
  const stats = await Review.aggregate([
    { $match: { product: productId, isApproved: true } },
    { $group: { _id: "$product", avgRating: { $avg: "$rating" }, count: { $sum: 1 } } },
  ])
  const average = stats.length > 0 ? Math.round(stats[0].avgRating * 10) / 10 : 0
  const count = stats.length > 0 ? stats[0].count : 0
  await Order.db.model("Product").findByIdAndUpdate(productId, { "ratings.average": average, "ratings.count": count })
}
