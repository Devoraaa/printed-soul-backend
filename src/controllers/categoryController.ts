import { Request, Response, NextFunction } from "express"
import { Category } from "../models/Category"
import { ApiError } from "../api/ApiError"
import { ApiResponse } from "../api/ApiResponse"
import { asyncHandler } from "../api/asyncHandler"
import { imageService } from "../services/imageService"

const slugify = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")

export const getCategories = asyncHandler(async (req: Request, res: Response) => {
  const categories = await Category.find({ isActive: true })
    .populate("parentCategory", "name slug")
    .sort("sortOrder name")
  res.json(ApiResponse.success(categories, "Categories retrieved"))
})

export const getCategoryBySlug = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const category = await Category.findOne({ slug: req.params.slug, isActive: true })
  if (!category) return next(new ApiError(404, "Category not found"))
  res.json(ApiResponse.success(category, "Category retrieved"))
})

export const createCategory = asyncHandler(async (req: any, res: Response) => {
  const { name, description, parentCategory, sortOrder } = req.body
  const slug = slugify(name)

  let imageId: string | undefined
  if (req.file) imageId = await imageService.saveImage(req.file.buffer, req.file.originalname, req.file.mimetype, req.user?.id)

  const category = await Category.create({ name, slug, description, parentCategory, sortOrder, image: imageId })
  res.status(201).json(ApiResponse.success(category, "Category created"))
})

export const updateCategory = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
  const category = await Category.findById(req.params.id)
  if (!category) return next(new ApiError(404, "Category not found"))

  const fields = ["name", "description", "parentCategory", "sortOrder", "isActive"]
  fields.forEach((f) => { if (req.body[f] !== undefined) (category as any)[f] = req.body[f] })
  if (req.body.name) category.slug = slugify(req.body.name)

  if (req.file) {
    if (category.image) await imageService.deleteImage(category.image.toString())
    category.image = (await imageService.saveImage(req.file.buffer, req.file.originalname, req.file.mimetype, req.user?.id)) as any
  }

  await category.save()
  res.json(ApiResponse.success(category, "Category updated"))
})

export const deleteCategory = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const category = await Category.findById(req.params.id)
  if (!category) return next(new ApiError(404, "Category not found"))
  await (category as any).softDelete()
  res.json(ApiResponse.success({}, "Category deleted"))
})
