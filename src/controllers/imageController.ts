import { Request, Response, NextFunction } from "express"
import { Image } from "../models/Image"
import { ApiError } from "../api/ApiError"
import { ApiResponse } from "../api/ApiResponse"
import { asyncHandler } from "../api/asyncHandler"
import { imageService } from "../services/imageService"

// Upload single image
export const uploadImage = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
  if (!req.file) return next(new ApiError(400, "No image file provided"))
  const imageId = await imageService.saveImage(req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, req.user?.id)
  res.status(201).json(ApiResponse.success({ imageId, url: `/api/images/${imageId}` }, "Image uploaded"))
})

// Upload multiple images
export const uploadImages = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
  if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
    return next(new ApiError(400, "No image files provided"))
  }
  const imageIds = await imageService.saveImages(req.files, req.user?.id)
  const urls = imageIds.map((id) => ({ imageId: id, url: `/api/images/${id}` }))
  res.status(201).json(ApiResponse.success(urls, "Images uploaded"))
})

import path from "path"

// Serve image by ID (public)
export const serveImage = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const image = await Image.findById(req.params.id)
  if (!image) return next(new ApiError(404, "Image not found"))

  if (image.url && image.url.startsWith("/uploads")) {
    const filepath = path.join(__dirname, "../../public", image.url.replace(/^\//, ""))
    res.set("Cache-Control", "public, max-age=31536000, immutable")
    return res.sendFile(filepath)
  }

  res.set("Content-Type", image.contentType)
  res.set("Cache-Control", "public, max-age=31536000, immutable") // 1 year cache
  res.send(image.data)
})

// Delete image (admin)
export const deleteImage = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const image = await Image.findById(req.params.id)
  if (!image) return next(new ApiError(404, "Image not found"))
  await image.deleteOne()
  res.json(ApiResponse.success({}, "Image deleted"))
})
