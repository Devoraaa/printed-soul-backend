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

  // Check if user has purchased this product
  const hasPurchased = await Order.findOne({
    user: req.user.id,
    "items.product": targetProduct,
    status: "delivered",
  })
  if (!hasPurchased) return next(new ApiError(403, "You can only review products you have purchased"))

  const existing = await Review.findOne({ product: targetProduct, user: req.user.id })
  if (existing) return next(new ApiError(400, "You have already reviewed this product"))

  const review = await Review.create({ product: targetProduct, user: req.user.id, rating, title, comment })
  res.status(201).json(ApiResponse.success(review, "Review submitted — pending approval"))
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
  res.json(ApiResponse.success(review, "Review approved"))
})

export const deleteReview = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const review = await Review.findByIdAndDelete(req.params.id)
  if (!review) return next(new ApiError(404, "Review not found"))
  res.json(ApiResponse.success({}, "Review deleted"))
})
