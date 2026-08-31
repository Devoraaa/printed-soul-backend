import { Worker } from "bullmq"
import sharp from "sharp"
import axios from "axios"
import { v4 as uuid } from "uuid"
import { DeviceModel } from "../models/DeviceModel"
import { Design } from "../models/Design"
import { Product } from "../models/Product"
import { Image } from "../models/Image"
import { uploadBuffer } from "../utils/upload"
import path from "path"
import fs from "fs"

const connection = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: parseInt(process.env.REDIS_PORT || "6379", 10),
}

export async function fetchAsBuffer(urlOrPath: string): Promise<Buffer> {
  if (urlOrPath.startsWith("http")) {
    const res = await axios.get(urlOrPath, { responseType: "arraybuffer" })
    return Buffer.from(res.data)
  }
  // Local file
  const localPath = path.join(__dirname, "../../public", urlOrPath)
  return fs.promises.readFile(localPath)
}

export async function generateSingleMockup(
  designBuffer: Buffer,
  templateUrl: string,
  printArea: any,
  cameraArea: any,
  blendMode: string,
  overlayUrl?: string
): Promise<Buffer> {
  const templateBuffer = await fetchAsBuffer(templateUrl)

  const resizedDesign = await sharp(designBuffer)
    .resize(printArea.width, printArea.height, { fit: "cover" })
    .png()
    .toBuffer()

  const printRx = printArea.borderRadius || 0
  let maskSvg = `<svg width="${printArea.width}" height="${printArea.height}">
    <mask id="cutout">
      <rect width="${printArea.width}" height="${printArea.height}" fill="white" rx="${printRx}" />`

  if (cameraArea && cameraArea.width > 0 && cameraArea.height > 0) {
    const camX = cameraArea.x - printArea.x
    const camY = cameraArea.y - printArea.y
    const camRx = cameraArea.borderRadius || 0
    maskSvg += `<rect x="${camX}" y="${camY}" width="${cameraArea.width}" height="${cameraArea.height}" fill="black" rx="${camRx}" />`
  }
  
  maskSvg += `</mask><rect width="${printArea.width}" height="${printArea.height}" fill="white" mask="url(#cutout)" /></svg>`

  const maskedDesign = await sharp(resizedDesign)
    .composite([{ input: Buffer.from(maskSvg), blend: 'dest-in' }])
    .png()
    .toBuffer()

  let finalBase = sharp(templateBuffer).composite([{ input: maskedDesign, top: printArea.y, left: printArea.x, blend: blendMode as any }])
  let mockupBuffer = await finalBase.jpeg({ quality: 85 }).toBuffer()

  // Apply Overlay Mask for 3D Effect if provided
  if (overlayUrl) {
    const overlayBuffer = await fetchAsBuffer(overlayUrl)
    // Assuming overlay is same size as template
    mockupBuffer = await sharp(mockupBuffer)
      .composite([{ input: overlayBuffer, blend: 'over' }])
      .jpeg({ quality: 85 })
      .toBuffer()
  }

  return mockupBuffer
}

export const mockupWorker = new Worker(
  "mockup-generation",
  async (job) => {
    const { designId, phoneModelId } = job.data

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
      const filtered = templatesToUse.filter((t) => t.id === templateId)
      if (filtered.length > 0) {
        templatesToUse = filtered
      } else {
        throw new Error(`No template found with id "${templateId}" for device "${phoneModel.name}". Add the template from Admin > Devices first.`)
      }
    }

    const designBuffer = await fetchAsBuffer(design.imageUrl)

    const generatedImageIds = []

    for (const template of templatesToUse) {
      if (!template.printArea) continue;
      
      const buffer = await generateSingleMockup(
        designBuffer, 
        template.templateImageUrl, 
        template.printArea, 
        template.cameraArea, 
        template.blendMode || 'multiply', 
        template.overlayImageUrl
      )
      const filename = `mockups/${designId}/${phoneModelId}-${template.id}-${uuid()}.jpg`
      const url = await uploadBuffer(filename, buffer, "image/jpeg")
      const imgDoc = await Image.create({
        filename: filename.split('/').pop(),
        contentType: "image/jpeg",
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
        isActive: false,
        status: "draft",
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
  { connection, concurrency: 8 }
)

mockupWorker.on("failed", async (job: any, err: Error) => {
  console.error(`Mockup job failed [design=${job?.data?.designId} model=${job?.data?.phoneModelId}]:`, err.message)
  if (job?.data?.designId) {
    await Design.findByIdAndUpdate(job.data.designId, { $inc: { failedCount: 1 } })
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
