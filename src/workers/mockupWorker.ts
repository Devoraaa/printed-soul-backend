import { Worker } from "bullmq"
import sharp, { OverlayOptions } from "sharp"
import axios from "axios"
import { v4 as uuid } from "uuid"
import { DeviceModel } from "../models/DeviceModel"
import { ProductTemplate } from "../models/ProductTemplate"
import { Design } from "../models/Design"
import { Product } from "../models/Product"
import { Image } from "../models/Image"
import { uploadBuffer } from "../utils/upload"
import path from "path"
import fs from "fs"

// ── Sharp High-Performance Configuration ───────────────────────────────
// Enable SIMD (AVX2) hardware acceleration for 2-3x faster image operations
sharp.simd(true)
// Limit sharp internal thread pool to 1 thread per task so workers never saturate all CPU cores
sharp.concurrency(1)
// Controlled LRU cache (max 64MB) to prevent memory ballooning during bulk automation
sharp.cache({ memory: 64, files: 20, items: 100 })

const connection = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: parseInt(process.env.REDIS_PORT || "6379", 10),
}

// In-memory cache for static base templates & overlays (10-minute TTL)
// Eliminates repetitive disk reads when generating mockups for 50+ phone models
const templateBufferCache = new Map<string, { buffer: Buffer; expiresAt: number }>()

export async function fetchAsBuffer(urlOrPath: string, useCache: boolean = false): Promise<Buffer> {
  const now = Date.now()
  if (useCache && templateBufferCache.has(urlOrPath)) {
    const cached = templateBufferCache.get(urlOrPath)!
    if (cached.expiresAt > now) {
      return cached.buffer
    }
    templateBufferCache.delete(urlOrPath)
  }

  let buf: Buffer
  if (urlOrPath.startsWith("http")) {
    const res = await axios.get(urlOrPath, { responseType: "arraybuffer", timeout: 15000 })
    buf = Buffer.from(res.data)
  } else {
    // Local file
    const safePath = urlOrPath.replace(/^\/api\//, "").replace(/^\/+/, "")
    let filepath = path.join(__dirname, "../../public", safePath)
    if (safePath.startsWith("uploads")) {
      const { getUploadDir } = require("../utils/upload")
      filepath = path.join(getUploadDir(), safePath.replace(/^uploads\/?/, ""))
    }
    
    if (!fs.existsSync(filepath)) {
      filepath = path.join(__dirname, "../../", safePath)
    }
    
    // Non-blocking asynchronous file read
    buf = await fs.promises.readFile(filepath)
  }

  if (useCache) {
    if (templateBufferCache.size > 80) {
      const oldestKey = templateBufferCache.keys().next().value
      if (oldestKey) templateBufferCache.delete(oldestKey)
    }
    templateBufferCache.set(urlOrPath, { buffer: buf, expiresAt: now + 10 * 60 * 1000 })
  }

  return buf
}

export async function generateSingleMockup(
  designBuffer: Buffer,
  templateUrl: string,
  printArea: any,
  cameraArea: any,
  blendMode: string,
  overlayUrl?: string
): Promise<Buffer> {
  // Yield microtask to event loop so customer requests (browsing/checkout) are never starved
  await new Promise((resolve) => setImmediate(resolve))

  const templateBuffer = await fetchAsBuffer(templateUrl, true)

  const pWidth = Math.round(printArea.width)
  const pHeight = Math.round(printArea.height)
  const pX = Math.round(printArea.x)
  const pY = Math.round(printArea.y)
  const printRx = Math.round(printArea.borderRadius || 0)

  const templateMetadata = await sharp(templateBuffer).metadata()
  const tWidth = templateMetadata.width || 800
  const tHeight = templateMetadata.height || 800

  // Clamp print area so it doesn't overflow the base template image (causes Sharp to crash)
  const safePWidth = Math.max(1, Math.min(pWidth, tWidth - pX))
  const safePHeight = Math.max(1, Math.min(pHeight, tHeight - pY))

  const resizedDesign = await sharp(designBuffer)
    .resize(safePWidth, safePHeight, { fit: "cover" })
    .png()
    .toBuffer()

  let maskSvg = `<svg width="${safePWidth}" height="${safePHeight}">
    <mask id="cutout">
      <rect width="${safePWidth}" height="${safePHeight}" fill="white" rx="${printRx}" />`

  if (cameraArea && cameraArea.width > 0 && cameraArea.height > 0) {
    const camX = Math.round(cameraArea.x) - pX
    const camY = Math.round(cameraArea.y) - pY
    const camWidth = Math.round(cameraArea.width)
    const camHeight = Math.round(cameraArea.height)
    const camRx = Math.round(cameraArea.borderRadius || 0)
    maskSvg += `<rect x="${camX}" y="${camY}" width="${camWidth}" height="${camHeight}" fill="black" rx="${camRx}" />`
  }
  
  maskSvg += `</mask><rect width="${safePWidth}" height="${safePHeight}" fill="white" mask="url(#cutout)" /></svg>`

  const maskedDesign = await sharp(resizedDesign)
    .composite([{ input: Buffer.from(maskSvg), blend: 'dest-in' }])
    .png()
    .toBuffer()

  // Single-pass composite array: composites design AND overlay together in 1 operation
  const composites: OverlayOptions[] = [
    { input: maskedDesign, top: pY, left: pX, blend: blendMode as any },
  ]

  // If 3D overlay is provided, resize and add to composite pipeline
  if (overlayUrl) {
    const overlayBuffer = await fetchAsBuffer(overlayUrl, true)
    const resizedOverlay = await sharp(overlayBuffer)
      .resize(tWidth, tHeight, { fit: 'fill' })
      .toBuffer()
    composites.push({ input: resizedOverlay, blend: 'over' })
  }

  // Render directly to WebP (Quality 85, effort 3) in a single pass without intermediate JPEG conversions
  const mockupBuffer = await sharp(templateBuffer)
    .composite(composites)
    .webp({ quality: 85, effort: 3, smartSubsample: true })
    .toBuffer()

  return mockupBuffer
}

export const mockupWorker = new Worker(
  "mockup-generation",
  async (job) => {
    const { designId, phoneModelId, productTemplateId } = job.data

    // ═════════════════════════════════════════════════════════════════
    // 1. UNIVERSAL PRODUCT TEMPLATE FLOW (Tote Bags, Mousepads, Mugs, Coasters, etc.)
    // ═════════════════════════════════════════════════════════════════
    if (productTemplateId) {
      const [design, pTemplate] = await Promise.all([
        Design.findById(designId),
        ProductTemplate.findById(productTemplateId).populate("category"),
      ])
      if (!design || !pTemplate) throw new Error("Design or ProductTemplate not found")

      if (!pTemplate.templates || pTemplate.templates.length === 0) {
        throw new Error(`Templates or print coordinates missing for: ${pTemplate.name}. Please set them from Catalog → Product Templates.`)
      }

      const finalPrice = job.data.price || pTemplate.basePrice || 499
      const finalComparePrice = job.data.comparePrice || pTemplate.comparePrice || 999
      const finalStock = job.data.stock || 10

      const designBuffer = await fetchAsBuffer(design.imageUrl)
      const generatedImageIds = []

      for (const template of pTemplate.templates) {
        if (!template.printArea) continue
        await new Promise((resolve) => setImmediate(resolve))

        const buffer = await generateSingleMockup(
          designBuffer,
          template.templateImageUrl,
          template.printArea,
          template.cameraArea,
          template.blendMode || "multiply",
          template.overlayImageUrl
        )
        const filename = `mockups/${designId}/${productTemplateId}-${template.id}-${uuid()}.webp`
        const url = await uploadBuffer(filename, buffer, "image/webp")
        const imgDoc = await Image.create({
          filename: filename.split("/").pop(),
          contentType: "image/webp",
          size: buffer.length,
          url: url,
        })
        generatedImageIds.push(imgDoc._id)
      }

      const categoryName = (pTemplate.category as any)?.name || "Product"
      const sku = `${design._id}-${pTemplate.slug}`.replace(/\s+/g, "-").toUpperCase()

      const productName = job.data.productName || `${design.title} ${pTemplate.displayName || pTemplate.name}`
      const desc = job.data.description || pTemplate.description || `Premium custom ${categoryName.toLowerCase()} featuring ${design.title}`

      await Product.findOneAndUpdate(
        { slug: sku.toLowerCase() },
        {
          name: productName,
          slug: sku.toLowerCase(),
          shortDescription: "",
          description: desc,
          price: finalPrice,
          comparePrice: finalComparePrice,
          category: pTemplate.category,
          isActive: true,
          status: "active",
          stock: finalStock,
          sku,
          designSlug: job.data.designSlug || undefined,
          $addToSet: { images: { $each: generatedImageIds } },
        },
        { upsert: true, new: true }
      )

      await Design.findByIdAndUpdate(designId, { $inc: { generatedCount: 1 } })
      return { mockupUrls: generatedImageIds }
    }

    // ═════════════════════════════════════════════════════════════════
    // 2. PHONE COVERS FLOW (Apple, Samsung, Vivo, etc. — 100% Intact)
    // ═════════════════════════════════════════════════════════════════
    const [design, phoneModel] = await Promise.all([
      Design.findById(designId),
      DeviceModel.findById(phoneModelId).populate("brand"),
    ])
    if (!design || !phoneModel) throw new Error("Design or PhoneModel not found")
    
    if (!phoneModel.templates || phoneModel.templates.length === 0) {
      throw new Error(`Coordinates or Templates missing for phone model: ${phoneModel.name}. Please set them from Admin Devices page.`)
    }

    const { basePrice = 499, comparePrice = 999 } = phoneModel

    // Respect admin-specified price/stock from job data (set via WhatsApp bot)
    // Fall back to device defaults if not supplied
    const finalPrice = job.data.price || basePrice
    const finalStock = job.data.stock || 10

    // Determine which template(s) to use based on coverType
    // "dual-protection" → template id "dual-protection"
    // "metal" | "glass"  → template id "metal-glass"
    const coverType: string | undefined = job.data.coverType
    let templatesToUse = phoneModel.templates || []

    if (coverType && templatesToUse.length > 0) {
      const templateId = coverType === "dual-protection" ? "dual-protection" : "metal-glass"
      const filtered = templatesToUse.filter((t) => t.id === templateId || t.id?.toLowerCase().includes(templateId) || t.name?.toLowerCase().includes(coverType))
      if (filtered.length > 0) {
        templatesToUse = filtered
      } else {
        // Fallback to the first available template configured for this phone model
        templatesToUse = [templatesToUse[0]]
      }
    }

    const designBuffer = await fetchAsBuffer(design.imageUrl)

    const generatedImageIds = []

    for (const template of templatesToUse) {
      if (!template.printArea) continue;
      await new Promise((resolve) => setImmediate(resolve))
      
      const buffer = await generateSingleMockup(
        designBuffer, 
        template.templateImageUrl, 
        template.printArea, 
        template.cameraArea, 
        template.blendMode || 'multiply', 
        template.overlayImageUrl
      )
      const filename = `mockups/${designId}/${phoneModelId}-${template.id}-${uuid()}.webp`
      const url = await uploadBuffer(filename, buffer, "image/webp")
      const imgDoc = await Image.create({
        filename: filename.split('/').pop(),
        contentType: "image/webp",
        size: buffer.length,
        url: url,
      })
      generatedImageIds.push(imgDoc._id)
    }

    const brandName = (phoneModel.brand as any)?.name || "Unknown"
    const sku = `${design._id}-${brandName}-${phoneModel.name}`.replace(/\s+/g, "-").toUpperCase()

    // Add extra images if passed from fast-upload flow
    const extraImageIds = job.data.extraImageIds || []
    const allImages = [...generatedImageIds, ...extraImageIds]

    // Determine titles and descriptions
    const productName = job.data.productName || `${design.title} - ${phoneModel.name}`
    const desc = job.data.description || `Premium case for ${phoneModel.name} featuring ${design.title}`
    const shortDesc = job.data.shortDescription || ""

    // Create or update Product
    const product = await Product.findOneAndUpdate(
      { slug: sku.toLowerCase() },
      {
        name: productName,
        slug: sku.toLowerCase(),
        shortDescription: shortDesc,
        description: desc,
        price: finalPrice,
        comparePrice: comparePrice,
        category: design.categoryId,
        brand: phoneModel.brand,
        deviceModels: [phoneModel._id],
        isActive: true,
        status: "active",
        stock: finalStock,
        sku,
        caseType: job.data.caseType || "hard-case",
        designSlug: job.data.designSlug || undefined,
        $addToSet: { images: { $each: allImages } },
      },
      { upsert: true, new: true }
    )
    
    await Design.findByIdAndUpdate(designId, { $inc: { generatedCount: 1 } })

    return { mockupUrls: generatedImageIds }
  },
  { connection, concurrency: 3 }
)

mockupWorker.on("failed", async (job: any, err: Error) => {
  console.error(`Mockup job failed [design=${job?.data?.designId} item=${job?.data?.phoneModelId || job?.data?.productTemplateId}]:`, err.message)
  if (job?.data?.designId) {
    const design = await Design.findByIdAndUpdate(job.data.designId, { $inc: { failedCount: 1 } }, { new: true })
    if (design && design.generatedCount + design.failedCount >= design.totalModels) {
      design.status = design.failedCount === design.totalModels ? "partial_failure" : "partial_failure" // Or "failed" if you prefer
      await design.save()
    }
  }
})

mockupWorker.on("completed", async (job: any) => {
  const { designId } = job.data
  const design = await Design.findById(designId)
  if (design && design.generatedCount + design.failedCount >= design.totalModels) {
    design.status = design.failedCount > 0 ? "partial_failure" : "done"
    await design.save()
  }
})
