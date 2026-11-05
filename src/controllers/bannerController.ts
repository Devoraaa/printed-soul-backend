import { Request, Response, NextFunction } from "express"
import { Banner } from "../models/Banner"
import { Ticker } from "../models/Ticker"
import { asyncHandler } from "../api/asyncHandler"
import { ApiError } from "../api/ApiError"
import { ApiResponse } from "../api/ApiResponse"
import { imageService } from "../services/imageService"

export const getBanners = asyncHandler(async (req: Request, res: Response) => {
  // Public route - only fetch active banners
  const banners = await Banner.find({ isActive: true })
    .populate("imageUrl")
    .populate("mobileImageUrl")
    .sort({ order: 1, createdAt: -1 })

  res.json(ApiResponse.success(banners, "Active banners fetched successfully"))
})

export const adminGetBanners = asyncHandler(async (req: Request, res: Response) => {
  // Admin route - fetch all banners
  const banners = await Banner.find()
    .populate("imageUrl")
    .populate("mobileImageUrl")
    .sort({ order: 1, createdAt: -1 })

  res.json(ApiResponse.success(banners, "All banners fetched successfully"))
})

export const createBanner = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
  const { title, link, isActive, order, type } = req.body

  let desktopFile: Express.Multer.File | undefined
  let mobileFile: Express.Multer.File | undefined

  if (req.files) {
    if (Array.isArray(req.files)) {
      desktopFile = req.files[0]
      if (req.files.length > 1) mobileFile = req.files[1]
    } else {
      desktopFile = req.files.image?.[0] || req.files.images?.[0]
      mobileFile = req.files.mobileImage?.[0]
    }
  }

  if (!desktopFile) {
    return next(new ApiError(400, "Banner image is required"))
  }

  const desktopImageIds = await imageService.saveImages([desktopFile], req.user?.id)
  if (desktopImageIds.length === 0) {
    return next(new ApiError(500, "Failed to process banner image"))
  }

  let mobileImageId: string | undefined
  if (mobileFile) {
    const mobileIds = await imageService.saveImages([mobileFile], req.user?.id)
    if (mobileIds.length > 0) mobileImageId = mobileIds[0]
  }

  const banner = await Banner.create({
    title,
    link,
    isActive: isActive === "true" || isActive === true,
    order: parseInt(order) || 0,
    type: type || "hero",
    imageUrl: desktopImageIds[0],
    mobileImageUrl: mobileImageId,
  })

  await banner.populate(["imageUrl", "mobileImageUrl"])

  res.status(201).json(ApiResponse.success(banner, "Banner created successfully"))
})

export const updateBanner = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
  const { id } = req.params
  const { title, link, isActive, order, type, removeMobileImage } = req.body

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

  // Handle image updates
  if (req.files) {
    let desktopFile: Express.Multer.File | undefined
    let mobileFile: Express.Multer.File | undefined

    if (Array.isArray(req.files)) {
      if (req.files.length > 0) desktopFile = req.files[0]
    } else {
      desktopFile = req.files.image?.[0] || req.files.images?.[0]
      mobileFile = req.files.mobileImage?.[0]
    }

    if (desktopFile) {
      const imageIds = await imageService.saveImages([desktopFile], req.user?.id)
      if (imageIds.length > 0) {
        banner.imageUrl = imageIds[0] as any
      }
    }

    if (mobileFile) {
      const mobileIds = await imageService.saveImages([mobileFile], req.user?.id)
      if (mobileIds.length > 0) {
        banner.mobileImageUrl = mobileIds[0] as any
      }
    }
  }

  if (removeMobileImage === "true" || removeMobileImage === true) {
    banner.mobileImageUrl = undefined
  }

  await banner.save()
  await banner.populate(["imageUrl", "mobileImageUrl"])

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

export const getTicker = asyncHandler(async (req: Request, res: Response) => {
  let ticker = await Ticker.findOne()
  if (!ticker) {
    ticker = await Ticker.create({})
  }
  res.json(ApiResponse.success(ticker, "Ticker fetched successfully"))
})

export const adminGetTicker = asyncHandler(async (req: Request, res: Response) => {
  let ticker = await Ticker.findOne()
  if (!ticker) {
    ticker = await Ticker.create({})
  }
  res.json(ApiResponse.success(ticker, "Ticker fetched successfully"))
})

export const updateTicker = asyncHandler(async (req: Request, res: Response) => {
  const { rawText, items, isActive } = req.body

  let ticker = await Ticker.findOne()
  if (!ticker) {
    ticker = new Ticker()
  }

  if (isActive !== undefined) {
    ticker.isActive = Boolean(isActive)
  }

  if (rawText !== undefined) {
    ticker.rawText = String(rawText)
    const parsed = String(rawText)
      .split("\n")
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0)
    ticker.items = parsed
  } else if (items !== undefined && Array.isArray(items)) {
    ticker.items = items.map((i: any) => String(i).trim()).filter(Boolean)
    ticker.rawText = ticker.items.join("\n")
  }

  await ticker.save()
  res.json(ApiResponse.success(ticker, "Ticker updated successfully"))
})
