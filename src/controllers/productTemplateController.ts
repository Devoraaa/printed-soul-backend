import { Request, Response, NextFunction } from "express"
import { ProductTemplate } from "../models/ProductTemplate"
import { Category } from "../models/Category"
import { asyncHandler } from "../api/asyncHandler"
import { ApiError } from "../api/ApiError"
import { ApiResponse } from "../api/ApiResponse"

const slugify = (text: string) =>
  text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "")
    .replace(/--+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")

export const getProductTemplates = asyncHandler(async (req: Request, res: Response) => {
  const { category, categoryId } = req.query
  const filter: any = {}
  if (category || categoryId) {
    filter.category = category || categoryId
  }

  const templates = await ProductTemplate.find(filter)
    .populate("category", "name slug image")
    .sort({ createdAt: -1 })

  res.json(ApiResponse.success(templates, "Product templates fetched successfully"))
})

export const getProductTemplatesByCategory = asyncHandler(async (req: Request, res: Response) => {
  const { categoryId } = req.params
  const templates = await ProductTemplate.find({ category: categoryId })
    .populate("category", "name slug image")
    .sort({ createdAt: -1 })

  res.json(ApiResponse.success(templates, "Category product templates fetched successfully"))
})

export const createProductTemplate = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { category, categoryId, name, displayName, basePrice, comparePrice, description, templates } = req.body

  const catId = category || categoryId
  if (!catId) return next(new ApiError(400, "Category is required"))
  if (!name) return next(new ApiError(400, "Name is required"))

  const categoryDoc = await Category.findById(catId)
  if (!categoryDoc) return next(new ApiError(404, "Category not found"))

  const baseSlug = `${slugify(categoryDoc.name)}-${slugify(name)}`
  let slug = baseSlug
  let count = 1
  while (await ProductTemplate.findOne({ slug })) {
    slug = `${baseSlug}-${count}`
    count++
  }

  const productTemplate = await ProductTemplate.create({
    category: catId,
    name,
    displayName: displayName || name,
    slug,
    basePrice: basePrice ? parseFloat(basePrice) : 499,
    comparePrice: comparePrice ? parseFloat(comparePrice) : 999,
    description: description || "",
    templates: templates || [],
  })

  await productTemplate.populate("category", "name slug image")

  res.status(201).json(ApiResponse.success(productTemplate, "Product template created successfully"))
})

export const updateProductTemplate = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { id } = req.params
  const { name, displayName, basePrice, comparePrice, description, isActive, templates } = req.body

  const productTemplate = await ProductTemplate.findById(id)
  if (!productTemplate) return next(new ApiError(404, "Product template not found"))

  if (name !== undefined) productTemplate.name = name
  if (displayName !== undefined) productTemplate.displayName = displayName
  if (basePrice !== undefined) productTemplate.basePrice = parseFloat(basePrice)
  if (comparePrice !== undefined) productTemplate.comparePrice = parseFloat(comparePrice)
  if (description !== undefined) productTemplate.description = description
  if (isActive !== undefined) productTemplate.isActive = isActive === true || isActive === "true"
  if (templates !== undefined) productTemplate.templates = templates

  await productTemplate.save()
  await productTemplate.populate("category", "name slug image")

  res.json(ApiResponse.success(productTemplate, "Product template updated successfully"))
})

export const deleteProductTemplate = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { id } = req.params
  const productTemplate = await ProductTemplate.findByIdAndDelete(id)
  if (!productTemplate) return next(new ApiError(404, "Product template not found"))

  res.json(ApiResponse.success(null, "Product template deleted successfully"))
})
