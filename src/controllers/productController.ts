import { Request, Response, NextFunction } from "express"
import { Product } from "../models/Product"
import { ApiError } from "../api/ApiError"
import { ApiResponse } from "../api/ApiResponse"
import { asyncHandler } from "../api/asyncHandler"
import { QueryFeatures } from "../api/QueryFeatures"
import { imageService } from "../services/imageService"
import { parseProductName } from "../utils/productNameParser"

import mongoose from "mongoose"
import { v4 as uuid } from "uuid"

// Helper: generate slug
const slugify = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")

export const getProducts = asyncHandler(async (req: Request, res: Response) => {
  // Include products that are active OR have no status field set (backward compat with pre-status products)
  let baseQuery = Product.find({ isActive: true, $or: [{ status: "active" }, { status: { $exists: false } }, { status: null }] })
    .populate("category", "name slug parentCategory")
    .populate("brand", "name slug")
    .populate("deviceModels", "name slug displayName")
    .populate("images", "url")

  const queryObj = { ...req.query }

  if (queryObj.search) {
    const searchString = queryObj.search as string;
    
    // Split search into words to match brands/devices more loosely
    const words = searchString.split(' ').filter(w => w.length > 2);
    const searchRegexes = words.length > 0 ? words.map(w => new RegExp(w, "i")) : [new RegExp(searchString, "i")];

    // Find matching device models or brands
    const [devices, brands] = await Promise.all([
      mongoose.model("DeviceModel").find({
        $or: searchRegexes.flatMap(r => [{ name: r }, { displayName: r }])
      }).select("_id"),
      mongoose.model("Brand").find({
        name: { $in: searchRegexes }
      }).select("_id")
    ])

    const deviceIds = devices.map(d => d._id)
    const brandIds = brands.map(b => b._id)

    // Also match the full string for name/desc/tags
    const fullRegex = new RegExp(searchString, "i");

    const orConditions: any[] = [
      { name: fullRegex },
      { description: fullRegex },
      { tags: fullRegex }
    ];

    if (deviceIds.length > 0) orConditions.push({ deviceModels: { $in: deviceIds } });
    if (brandIds.length > 0) orConditions.push({ brand: { $in: brandIds } });

    baseQuery = baseQuery.find({ $and: [{ $or: orConditions }] } as any)
    delete queryObj.search // handled manually
  }

  // ── Parent Category → include all subcategories automatically ──────────
  if (queryObj.category) {
    const { Category } = await import("../models/Category")
    const catId = queryObj.category as string
    const parentCat = await Category.findOne({ $or: [{ _id: mongoose.isValidObjectId(catId) ? catId : null }, { slug: catId }], isActive: true })
    if (parentCat) {
      const children = await Category.find({ parentCategory: parentCat._id, isActive: true }).select("_id")
      const allCategoryIds = [parentCat._id, ...children.map(c => c._id)]
      baseQuery = baseQuery.find({ category: { $in: allCategoryIds } } as any)
    } else if (mongoose.isValidObjectId(catId)) {
      baseQuery = baseQuery.find({ category: catId } as any)
    }
    delete queryObj.category
  }

  // ── Device Model filter ─────────────────────────────────────────────────
  if (queryObj.deviceModel) {
    const dmId = queryObj.deviceModel as string
    if (mongoose.isValidObjectId(dmId)) {
      baseQuery = baseQuery.find({ deviceModels: { $in: [dmId] } } as any)
    }
    delete queryObj.deviceModel
  }

  // ── Price Range filter ──────────────────────────────────────────────────
  if (queryObj.minPrice || queryObj.maxPrice) {
    const priceFilter: any = {}
    if (queryObj.minPrice) priceFilter.$gte = Number(queryObj.minPrice)
    if (queryObj.maxPrice) priceFilter.$lte = Number(queryObj.maxPrice)
    baseQuery = baseQuery.find({ price: priceFilter } as any)
    delete queryObj.minPrice
    delete queryObj.maxPrice
  }

  const features = new QueryFeatures(baseQuery as any, queryObj)
  features.filter().sort().limitFields()

  const countQuery = features.query.clone()
  const total = await countQuery.countDocuments()

  features.paginate()
  const products = await features.query

  res.json(ApiResponse.success(products, "Products retrieved", {
    total,
    page: parseInt(req.query.page as string) || 1,
    limit: parseInt(req.query.limit as string) || 10,
  }))
})

export const getProductBySlug = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const product = await Product.findOne({ slug: req.params.slug, isActive: true, $or: [{ status: "active" }, { status: { $exists: false } }, { status: null }] })
    .populate("category", "name slug")
    .populate("brand", "name slug")
    .populate("deviceModels", "name slug displayName brand")
    .populate("images", "url")

  if (!product) return next(new ApiError(404, "Product not found"))
  res.json(ApiResponse.success(product, "Product retrieved"))
})

export const getFeaturedProducts = asyncHandler(async (req: Request, res: Response) => {
  const products = await Product.find({ isFeatured: true, isActive: true, $or: [{ status: "active" }, { status: { $exists: false } }, { status: null }] })
    .limit(8)
    .populate("category", "name slug")
    .populate("brand", "name slug")
    .populate("images", "url")
    .sort("-createdAt")
  res.json(ApiResponse.success(products, "Featured products retrieved"))
})

export const getProductsByDevice = asyncHandler(async (req: Request, res: Response) => {
  const { deviceSlug } = req.params
  const { DeviceModel } = await import("../models/DeviceModel")
  const device = await DeviceModel.findOne({ slug: deviceSlug })
  if (!device) return res.json(ApiResponse.success([], "No products for this device"))

  const products = await Product.find({ deviceModels: device._id, isActive: true, $or: [{ status: "active" }, { status: { $exists: false } }, { status: null }] })
    .populate("category", "name slug")
    .populate("brand", "name slug")

  res.json(ApiResponse.success(products, `Products for ${device.displayName}`))
})

export const createProduct = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
  const { name, description, shortDescription, price, comparePrice, category, brand, deviceModels, stock, tags, sku, isFeatured, lowStockThreshold, weight, priority, caseType, designSlug } = req.body

  const slug = slugify(name)
  const exists = await Product.findOne({ slug })
  if (exists) return next(new ApiError(400, "Product with this name already exists"))

  // Auto-parse the product name to extract designSlug + caseType
  const parsed = parseProductName(name)
  const finalDesignSlug = designSlug || parsed.designSlug
  const finalCaseType   = caseType   || parsed.caseType

  let imageIds: string[] = []
  if (req.files && Array.isArray(req.files)) {
    imageIds = await imageService.saveImages(req.files, req.user?.id)
  }

  const product = await Product.create({
    name, slug, description, shortDescription, price, comparePrice, category, brand,
    deviceModels: deviceModels ? (Array.isArray(deviceModels) ? deviceModels : [deviceModels]) : [],
    images: imageIds,
    stock: parseInt(stock) || 0,
    tags: tags ? (Array.isArray(tags) ? tags : tags.split(",").map((t: string) => t.trim())) : [],
    sku: sku || `PSS-${Date.now()}`,
    isFeatured: isFeatured === "true" || isFeatured === true,
    lowStockThreshold: parseInt(lowStockThreshold) || 5,
    weight,
    priority: parseInt(priority) || 0,
    designSlug: finalDesignSlug,
    caseType: finalCaseType,
  })

  res.status(201).json(ApiResponse.success(product, "Product created"))
})


export const updateProduct = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
  const product = await Product.findById(req.params.id)
  if (!product) return next(new ApiError(404, "Product not found"))

  const updatable = ["name", "description", "shortDescription", "price", "comparePrice", "category", "brand", "deviceModels", "stock", "tags", "isFeatured", "isActive", "status", "lowStockThreshold", "weight", "sku", "priority", "caseType", "designSlug"]
  updatable.forEach((field) => { if (req.body[field] !== undefined) (product as any)[field] = req.body[field] })

  // Auto-activate when status is set to active
  if (req.body.status === "active") {
    product.isActive = true
  }
  // Auto-deactivate when status is draft/archived
  if (req.body.status === "draft" || req.body.status === "archived") {
    product.isActive = false
  }

  // If name changed: re-slug + re-parse (unless admin explicitly sent caseType/designSlug)
  if (req.body.name && req.body.name !== product.name) {
    product.name = req.body.name
    product.slug = slugify(req.body.name)
    const parsed = parseProductName(req.body.name)
    if (!req.body.designSlug) (product as any).designSlug = parsed.designSlug
    if (!req.body.caseType)   (product as any).caseType   = parsed.caseType
  } else if (req.body.name) {
    product.name = req.body.name
  }

  // Handle new image uploads
  let finalImageIds = [...product.images]
  
  if (req.body.existingImageOrder) {
    try {
      const order = JSON.parse(req.body.existingImageOrder)
      // re-order the existing images according to order
      finalImageIds = order.map((id: string) => new mongoose.Types.ObjectId(id))
    } catch (e) {
      console.error("Invalid existingImageOrder", e)
    }
  }

  if (req.files && Array.isArray(req.files) && req.files.length > 0) {
    const newImageIds = await imageService.saveImages(req.files, req.user?.id)
    finalImageIds = [...finalImageIds, ...newImageIds.map((id) => id as any)]
  }

  product.images = finalImageIds as any


  await product.save()
  res.json(ApiResponse.success(product, "Product updated"))
})

export const deleteProduct = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const product = await Product.findById(req.params.id)
  if (!product) return next(new ApiError(404, "Product not found"))
  await (product as any).softDelete()
  res.json(ApiResponse.success({}, "Product deleted"))
})

export const removeProductImage = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { id, imageId } = req.params
  const product = await Product.findById(id)
  if (!product) return next(new ApiError(404, "Product not found"))

  await imageService.deleteImage(imageId)
  product.images = product.images.filter((img) => img.toString() !== imageId)
  await product.save()
  res.json(ApiResponse.success({}, "Image removed"))
})

// Admin: get all products (including inactive), with optional status filter
export const adminGetProducts = asyncHandler(async (req: Request, res: Response) => {
  // Build base filter — allow filtering by status if passed as query param
  const baseFilter: any = {}
  if (req.query.status) {
    baseFilter.status = req.query.status
  }
  if (req.query.sku) {
    baseFilter.sku = { $regex: req.query.sku, $options: 'i' }
  }
  // Allow fetching a specific product by _id
  if (req.query._id) {
    baseFilter._id = req.query._id
  }

  const queryObj = { ...req.query }
  delete queryObj.status
  delete queryObj.sku
  delete queryObj._id

  const features = new QueryFeatures(
    Product.find(baseFilter)
      .populate("category", "name")
      .populate("brand", "name")
      .populate("images", "url") as any,
    queryObj
  )
  features.search(["name", "sku"]).sort().limitFields().paginate()

  const [products, total] = await Promise.all([features.query, Product.countDocuments(baseFilter)])
  res.json(ApiResponse.success(products, "All products", { total }))
})

export const generateManualMockup = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
  const { id } = req.params
  const product = await Product.findById(id).populate("deviceModels")
  if (!product) return next(new ApiError(404, "Product not found"))
  
  if (!req.file) return next(new ApiError(400, "Please upload a design image"))

  const deviceModel = product.deviceModels?.[0] as any
  if (!deviceModel) return next(new ApiError(400, "Product has no device model associated"))

  const { generateSingleMockup } = await import("../workers/mockupWorker")
  const { uploadBuffer } = await import("../utils/upload")
  const { Image } = await import("../models/Image")

  if (!deviceModel.templates || deviceModel.templates.length === 0) {
    return next(new ApiError(400, `Device ${deviceModel.name} is missing templates or coordinates.`))
  }

  const designBuffer = req.file.buffer
  const generatedImageIds = []

  for (const template of deviceModel.templates) {
    if (!template.printArea) continue;
    
    const buffer = await generateSingleMockup(
      designBuffer, 
      template.templateImageUrl, 
      template.printArea, 
      template.cameraArea, 
      template.blendMode || 'multiply', 
      template.overlayImageUrl
    )
    const filename = `mockups/manual/${product._id}-${template.id}-${uuid()}.jpg`
    const url = await uploadBuffer(filename, buffer, "image/jpeg")
    const imgDoc = await Image.create({
      filename: filename.split('/').pop(),
      contentType: "image/jpeg",
      size: buffer.length,
      url: url,
    })
    generatedImageIds.push(imgDoc._id)
  }

  product.images = [...product.images, ...generatedImageIds]
  await product.save()

  // Return updated product
  const updatedProduct = await Product.findById(product._id).populate("images")
  res.json(ApiResponse.success(updatedProduct, "Mockup generated manually"))
})

/**
 * GET /api/products/design/:designSlug?deviceModel=<id>
 *
 * Returns ALL case-type variants for a given design. Only relevant for mobile
 * cover products (dual-case, metal-case, glass-case etc.).
 *
 * Response includes:
 *   showSwitcher  — false for mugs/frames/tumblers etc. Frontend must NOT render buttons if false.
 *   variants      — list of products sharing this designSlug (only if showSwitcher=true)
 *   available     — whether the variant supports the requested deviceModel
 */
const MOBILE_CASE_TYPES = new Set(["dual-case", "metal-case", "glass-case", "hard-case", "soft-case", "wallet-case"])

export const getDesignVariants = asyncHandler(async (req: Request, res: Response) => {
  const { designSlug } = req.params
  const { deviceModel } = req.query  // optional ObjectId

  // Find all products sharing this designSlug
  const variants = await Product.find({
    designSlug,
    $or: [{ status: "active" }, { status: { $exists: false } }],
  })
    .populate("images", "url")
    .select("name slug caseType price comparePrice images stock deviceModels designSlug")
    .lean()

  // Only mobile case types get the switcher — mugs, frames, tumblers etc. get nothing
  const isMobileDesign = variants.some((v: any) => MOBILE_CASE_TYPES.has(v.caseType))

  if (!isMobileDesign || variants.length <= 1) {
    // No switcher needed — single product or non-mobile category
    return res.json(ApiResponse.success({ showSwitcher: false, variants: [] }, "No case switcher for this product type"))
  }

  // Mark each variant: is it available for the requested device model?
  const result = variants
    .filter((v: any) => MOBILE_CASE_TYPES.has(v.caseType)) // only include mobile case variants
    .map((v: any) => {
      const available = deviceModel
        ? v.deviceModels?.some((dm: any) => dm.toString() === deviceModel.toString())
        : true
      return { ...v, available }
    })

  // Sort: available first, then fixed order: dual → glass → metal → hard → soft → wallet
  const ORDER: Record<string, number> = { "dual-case": 0, "glass-case": 1, "metal-case": 2, "hard-case": 3, "soft-case": 4, "wallet-case": 5 }
  result.sort((a: any, b: any) => {
    if (a.available && !b.available) return -1
    if (!a.available && b.available) return 1
    return (ORDER[a.caseType] ?? 99) - (ORDER[b.caseType] ?? 99)
  })

  res.json(ApiResponse.success({ showSwitcher: true, variants: result }, "Design variants retrieved"))
})

/**
 * GET /api/products/parse-name?name=<product+name>
 * Admin helper: given a product name, return the parsed designName, designSlug, caseType.
 * Call this in real-time from the admin form as the admin types the product name.
 */
export const parseProductNameAPI = asyncHandler(async (req: Request, res: Response) => {
  const name = (req.query.name as string || "").trim()
  if (!name) return res.json(ApiResponse.success(null, "No name provided"))

  const parsed = parseProductName(name)

  // Check if a product with this designSlug already exists in DB
  const existing = await Product.find({ designSlug: parsed.designSlug })
    .select("name caseType slug")
    .lean()

  res.json(ApiResponse.success({
    ...parsed,
    existingVariants: existing,   // so admin panel can show "Links to X existing products"
  }, "Parsed successfully"))
})

