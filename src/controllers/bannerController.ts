import { Request, Response, NextFunction } from "express"
import { Banner } from "../models/Banner"
import { asyncHandler } from "../api/asyncHandler"
import { ApiError } from "../api/ApiError"
import { ApiResponse } from "../api/ApiResponse"
import { imageService } from "../services/imageService"

export const getBanners = asyncHandler(async (req: Request, res: Response) => {
  // Public route - only fetch active banners
  const banners = await Banner.find({ isActive: true })
    .populate("imageUrl")
    .sort({ order: 1, createdAt: -1 })

  res.json(ApiResponse.success(banners, "Active banners fetched successfully"))
})

export const adminGetBanners = asyncHandler(async (req: Request, res: Response) => {
  // Admin route - fetch all banners
  const banners = await Banner.find()
    .populate("imageUrl")
    .sort({ order: 1, createdAt: -1 })

  res.json(ApiResponse.success(banners, "All banners fetched successfully"))
})

export const createBanner = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
  const { title, link, isActive, order, type } = req.body

  if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
    return next(new ApiError(400, "Banner image is required"))
  }

  const imageIds = await imageService.saveImages(req.files, req.user?.id)
  if (imageIds.length === 0) {
    return next(new ApiError(500, "Failed to process banner image"))
  }

  const banner = await Banner.create({
    title,
    link,
    isActive: isActive === "true" || isActive === true,
    order: parseInt(order) || 0,
    type: type || "hero",
    imageUrl: imageIds[0],
  })

  await banner.populate("imageUrl")

  res.status(201).json(ApiResponse.success(banner, "Banner created successfully"))
})

export const updateBanner = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
  const { id } = req.params
  const { title, link, isActive, order, type } = req.body

  let banner = await Banner.findById(id)
  if (!banner) {
    return next(new ApiError(404, "Banner not found"))
  }

  // Update fields if provided
  if (title !== undefined) banner.title = title
  if (link !== undefined) banner.link = link
  if (isActive !== undefined) banner.isActive = isActive === "true" || isActive === true
  if (order !== undefined) banner.order = parseInt(order)
  if (type !== undefined) banner.type = type

  // Handle new image upload if exists
  if (req.files && Array.isArray(req.files) && req.files.length > 0) {
    const imageIds = await imageService.saveImages(req.files, req.user?.id)
    if (imageIds.length > 0) {
      banner.imageUrl = imageIds[0] as any
    }
  }

  await banner.save()
  await banner.populate("imageUrl")

  res.json(ApiResponse.success(banner, "Banner updated successfully"))
})

export const deleteBanner = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { id } = req.params
  const banner = await Banner.findByIdAndDelete(id)
  
  if (!banner) {
    return next(new ApiError(404, "Banner not found"))
  }

  res.json(ApiResponse.success(null, "Banner deleted successfully"))
})
