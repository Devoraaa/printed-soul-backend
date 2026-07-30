import { Request, Response, NextFunction } from "express"
import { Product } from "../models/Product"
import { DeviceModel } from "../models/DeviceModel"
import { Brand } from "../models/Brand"
import { Category } from "../models/Category"
import { ApiError } from "../api/ApiError"
import { ApiResponse } from "../api/ApiResponse"
import { asyncHandler } from "../api/asyncHandler"

const slugify = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")

/**
 * Product Automation Engine
 * Bulk-creates products for all device models in a category+brand combination
 */
export const bulkGenerateProducts = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
  const {
    designName,        // e.g., "Galaxy Print"
    description,
    price,
    comparePrice,
    categoryId,
    brandIds,          // array of brand IDs to generate for
    tags,
    stock,
    lowStockThreshold,
  } = req.body

  const category = await Category.findById(categoryId)
  if (!category) return next(new ApiError(404, "Category not found"))

  const created: any[] = []
  const failed: any[] = []

  for (const brandId of brandIds) {
    const brand = await Brand.findById(brandId)
    if (!brand) { failed.push({ brandId, reason: "Brand not found" }); continue }

    const devices = await DeviceModel.find({ brand: brandId, isActive: true })

    for (const device of devices) {
      try {
        const name = `${designName} - ${device.displayName}`
        const slug = slugify(`${designName}-${device.slug}`)
        const sku = `PSS-${designName.substring(0, 3).toUpperCase()}-${device.name.replace(/\s/g, "").toUpperCase().substring(0, 8)}`

        const existing = await Product.findOne({ slug })
        if (existing) { failed.push({ name, reason: "Already exists" }); continue }

        const product = await Product.create({
          name,
          slug,
          description: description || `${designName} phone case for ${device.displayName}`,
          sku,
          price: parseFloat(price),
          comparePrice: comparePrice ? parseFloat(comparePrice) : undefined,
          category: categoryId,
          brand: brandId,
          deviceModels: [device._id],
          images: [],
          stock: parseInt(stock) || 0,
          lowStockThreshold: parseInt(lowStockThreshold) || 5,
          tags: tags ? tags.split(",").map((t: string) => t.trim()) : [designName.toLowerCase(), brand.slug],
          isActive: true,
        })
        created.push({ name: product.name, id: product._id })
      } catch (err: any) {
        failed.push({ device: device.name, reason: err.message })
      }
    }
  }

  res.status(201).json(ApiResponse.success({ created: created.length, failed: failed.length, details: { created, failed } }, `Generated ${created.length} products`))
})

// Get automation preview (what would be generated)
export const previewBulkGeneration = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { designName, brandIds, categoryId } = req.body

  const category = await Category.findById(categoryId).select("name")
  if (!category) return next(new ApiError(404, "Category not found"))

  const preview: any[] = []
  for (const brandId of brandIds) {
    const brand = await Brand.findById(brandId).select("name")
    const devices = await DeviceModel.find({ brand: brandId, isActive: true }).select("displayName")
    devices.forEach((d) => {
      preview.push({ name: `${designName} - ${d.displayName}`, brand: brand?.name, category: category.name })
    })
  }

  res.json(ApiResponse.success({ count: preview.length, preview }, "Generation preview"))
})
