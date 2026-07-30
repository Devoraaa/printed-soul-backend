import { Request, Response, NextFunction } from "express"
import { Brand } from "../models/Brand"
import { ApiError } from "../api/ApiError"
import { ApiResponse } from "../api/ApiResponse"
import { asyncHandler } from "../api/asyncHandler"
import { QueryFeatures } from "../api/QueryFeatures"
import { imageService } from "../services/imageService"

const slugify = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")

export const getBrands = asyncHandler(async (req: Request, res: Response) => {
  const brands = await Brand.find({ isActive: true }).sort("name")
  res.json(ApiResponse.success(brands, "Brands retrieved"))
})

export const getBrandById = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const brand = await Brand.findById(req.params.id)
  if (!brand) return next(new ApiError(404, "Brand not found"))
  res.json(ApiResponse.success(brand, "Brand retrieved"))
})

export const createBrand = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
  const { name } = req.body
  const slug = slugify(name)

  let logoId: string | undefined
  if (req.file) logoId = await imageService.saveImage(req.file.buffer, req.file.originalname, req.file.mimetype, req.user?.id)

  const brand = await Brand.create({ name, slug, logo: logoId })
  res.status(201).json(ApiResponse.success(brand, "Brand created"))
})

export const updateBrand = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
  const brand = await Brand.findById(req.params.id)
  if (!brand) return next(new ApiError(404, "Brand not found"))

  if (req.body.name) { brand.name = req.body.name; brand.slug = slugify(req.body.name) }
  if (req.body.isActive !== undefined) brand.isActive = req.body.isActive

  if (req.file) {
    if (brand.logo) await imageService.deleteImage(brand.logo.toString())
    brand.logo = (await imageService.saveImage(req.file.buffer, req.file.originalname, req.file.mimetype, req.user?.id)) as any
  }

  await brand.save()
  res.json(ApiResponse.success(brand, "Brand updated"))
})

export const deleteBrand = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const brand = await Brand.findById(req.params.id)
  if (!brand) return next(new ApiError(404, "Brand not found"))
  await (brand as any).softDelete()
  res.json(ApiResponse.success({}, "Brand deleted"))
})
