import { Request, Response, NextFunction } from "express"
import { Queue } from "bullmq"
import { asyncHandler } from "../api/asyncHandler"
import { ApiError } from "../api/ApiError"
import { ApiResponse } from "../api/ApiResponse"
import { Brand } from "../models/Brand"
import { Category } from "../models/Category"
import { Design } from "../models/Design"
import { DeviceModel } from "../models/DeviceModel"
import { Product } from "../models/Product"
import { Image } from "../models/Image"
import path from "path"
import fs from "fs"
import { v4 as uuid } from "uuid"

// ── BullMQ connection ─────────────────────────────────────────────────────────
const connection = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: parseInt(process.env.REDIS_PORT || "6379", 10),
}
const mockupQueue = new Queue("mockup-generation", { connection })

// ── Helpers ───────────────────────────────────────────────────────────────────
const slugify = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")

/** Save an uploaded multer file buffer as an Image document and return its ID */
async function saveUploadedFile(file: Express.Multer.File) {
  const imgDoc = await Image.create({
    filename: file.filename,
    contentType: file.mimetype,
    size: file.size,
    url: `/uploads/${file.filename}`,
  })
  return imgDoc
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/bot/catalog-info
// Returns brands + categories for bot menu building
// ─────────────────────────────────────────────────────────────────────────────
export const getBotCatalogInfo = asyncHandler(async (_req: Request, res: Response) => {
  const [brands, categories] = await Promise.all([
    Brand.find({ isActive: true }).select("_id name slug").sort("name"),
    Category.find({ isActive: true }).select("_id name slug").sort("sortOrder name"),
  ])
  res.json(ApiResponse.success({ brands, categories }, "Catalog info fetched"))
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/bot/categories
// Create a new category (for bot "new category" option)
// ─────────────────────────────────────────────────────────────────────────────
export const botCreateCategory = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { name } = req.body
  if (!name?.trim()) return next(new ApiError(400, "Category name required"))

  const slug = slugify(name.trim())
  const existing = await Category.findOne({ slug })
  if (existing) {
    return res.json(ApiResponse.success({ category: existing }, "Category already exists"))
  }

  const category = await Category.create({ name: name.trim(), slug, isActive: true })
  res.status(201).json(ApiResponse.success({ category }, `Category "${category.name}" created`))
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/bot/products  (multipart/form-data)
// Direct product upload for non-mobile items (tote bag, tumbler, mug, wall frame)
// Fields: name, categoryId, price, stock, productType
// Files:  images[] (1 or more)
// ─────────────────────────────────────────────────────────────────────────────
export const botCreateDirectProduct = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { name, categoryId, price, stock, productType } = req.body
  const files = req.files as Express.Multer.File[] | undefined

  if (!name?.trim()) return next(new ApiError(400, "Product name is required"))
  if (!categoryId) return next(new ApiError(400, "categoryId is required"))
  if (!files || files.length === 0) return next(new ApiError(400, "At least one image is required"))

  const category = await Category.findById(categoryId)
  if (!category) return next(new ApiError(404, "Category not found"))

  // Resolve the "Printed Soul Store" brand for non-mobile products
  const brand = await Brand.findOne({ slug: "printed-soul-store" }).select("_id name")
  if (!brand) {
    return next(new ApiError(400, "'Printed Soul Store' brand DB mein nahi mili. Pehle brand add karo (slug: printed-soul-store)."))
  }

  // Save uploaded image files
  const imageIds: any[] = []
  for (const file of files) {
    const imgDoc = await saveUploadedFile(file)
    imageIds.push(imgDoc._id)
  }

  const productName = name.trim()
  const slug = slugify(`${productName}-${productType || "product"}-${Date.now()}`)
  const sku = `PSS-${(productType || "PROD").toUpperCase().substring(0, 5)}-${Date.now()}`

  const product = await Product.create({
    name: productName,
    slug,
    description: `${productName} — ${category.name} by Printed Soul Store`,
    sku,
    price: parseFloat(price) || 499,
    category: categoryId,
    brand: brand?._id,
    images: imageIds,
    stock: parseInt(stock) || 10,
    status: "active",
    isActive: true,
    tags: [productType?.toLowerCase(), category.slug].filter(Boolean),
  })

  res.status(201).json(ApiResponse.success(
    { productId: product._id, name: product.name, images: imageIds.length },
    `Product "${product.name}" created successfully`
  ))
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/bot/mobile-cover  (multipart/form-data)
// Trigger automation for mobile cover design
// Fields: designName, coverType (dual-protection|metal|glass), brandIds (JSON array),
//         categoryId, price, stock
// File:   design (single design artwork image)
// ─────────────────────────────────────────────────────────────────────────────
export const botTriggerMobileCoverAutomation = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { designName, coverType, categoryId, price, stock } = req.body
  let brandIds: string[] = []
  try {
    brandIds = JSON.parse(req.body.brandIds || "[]")
  } catch {
    return next(new ApiError(400, "brandIds must be a valid JSON array"))
  }

  const file = req.file as Express.Multer.File | undefined

  if (!designName?.trim()) return next(new ApiError(400, "designName is required"))
  if (!["dual-protection", "metal", "glass"].includes(coverType))
    return next(new ApiError(400, "coverType must be: dual-protection | metal | glass"))
  if (!brandIds.length) return next(new ApiError(400, "Select at least one brand"))
  if (!file) return next(new ApiError(400, "Design image is required"))
  if (!categoryId) return next(new ApiError(400, "categoryId is required"))

  // Create Design record with the uploaded design image
  const imageUrl = `/uploads/${file.filename}`
  const design = await Design.create({
    title: designName.trim(),
    categoryId,
    imageUrl,
    status: "processing",
  })

  // Collect all device models for the given brands
  const devices = await DeviceModel.find({ brand: { $in: brandIds }, isActive: true })
    .select("_id name brand templates basePrice")

  // Filter devices that actually have the required template
  const templateId = coverType === "dual-protection" ? "dual-protection" : "metal-glass"
  const validDevices = devices.filter((d) => d.templates?.some((t) => t.id === templateId))
  const skippedDevices = devices.length - validDevices.length

  if (validDevices.length === 0) {
    // Clean up design record since nothing will process
    await Design.findByIdAndDelete(design._id)
    return next(new ApiError(400, `No devices found with template "${templateId}". Please add templates from Admin > Devices first.`))
  }

  // Update design with total count and queue jobs
  await Design.findByIdAndUpdate(design._id, { totalModels: validDevices.length })

  await mockupQueue.addBulk(
    validDevices.map((device) => ({
      name: "generate-mockup",
      data: {
        designId: design._id.toString(),
        phoneModelId: device._id.toString(),
        coverType,           // passed to worker for template selection
        price: parseFloat(price) || device.basePrice || 499,
        stock: parseInt(stock) || 10,
      },
    }))
  )

  res.status(201).json(ApiResponse.success(
    {
      designId: design._id,
      designName: design.title,
      coverType,
      totalDevices: validDevices.length,
      skippedDevices,
      status: "processing",
      message: `Mockup generation started for ${validDevices.length} devices. ${skippedDevices > 0 ? `${skippedDevices} devices skipped (no ${templateId} template).` : ""}`,
    },
    "Mobile cover automation triggered"
  ))
})

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/bot/design-status/:designId
// Poll automation progress
// ─────────────────────────────────────────────────────────────────────────────
export const getBotDesignStatus = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const design = await Design.findById(req.params.designId)
  if (!design) return next(new ApiError(404, "Design not found"))

  res.json(ApiResponse.success({
    designId: design._id,
    title: design.title,
    status: design.status,
    generatedCount: design.generatedCount,
    failedCount: design.failedCount,
    totalModels: design.totalModels,
    percentComplete: design.totalModels > 0
      ? Math.round(((design.generatedCount + design.failedCount) / design.totalModels) * 100)
      : 0,
  }, "Design status"))
})

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/bot/fast-cover
// Fast upload for a specific device ID. Accepts multiple images.
// First image is design. The rest are extra gallery images.
// ─────────────────────────────────────────────────────────────────────────────
export const botFastCoverUpload = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { deviceId, productName, shortDescription, description, basePrice, comparePrice } = req.body

  if (!deviceId) return next(new ApiError(400, "Device ID is required"))
  
  if (!req.files || (req.files as any[]).length === 0) {
    return next(new ApiError(400, "At least one image is required"))
  }

  const files = req.files as Express.Multer.File[]
  const designFile = files[0]
  const extraFiles = files.slice(1)

  // Resolve device by internal name
  const device = await DeviceModel.findOne({ name: deviceId })
  if (!device) {
    return next(new ApiError(404, `Device with ID "${deviceId}" not found`))
  }

  // Find or create "Universal Mobile Cover" category
  let category = await Category.findOne({ slug: "universal-mobile-cover" })
  if (!category) {
    category = await Category.create({ name: "Universal Mobile Cover", slug: "universal-mobile-cover", isActive: true })
  }

  // Process design file
  const designImgDoc = await saveUploadedFile(designFile)
  
  const design = await Design.create({
    title: productName || `${device.displayName} Cover`,
    categoryId: category._id,
    imageUrl: designImgDoc.url,
    status: "processing",
    totalModels: 1, // Only this device
  })

  // Process extra images
  const extraImageIds: string[] = []
  for (const f of extraFiles) {
    const imgDoc = await saveUploadedFile(f)
    extraImageIds.push(imgDoc._id.toString())
  }

  // Queue mockup generation
  await mockupQueue.add("generate-mockup", {
    designId: design._id.toString(),
    phoneModelId: device._id.toString(),
    // We don't pass coverType so the worker will process all templates of this device
    productName,
    shortDescription,
    description,
    price: parseFloat(basePrice) || device.basePrice || 499,
    comparePrice: parseFloat(comparePrice) || device.comparePrice || 999,
    extraImageIds
  })

  res.status(201).json(ApiResponse.success(
    { designId: design._id, message: "Fast upload triggered successfully" },
    "Fast upload started"
  ))
})
