import multer from "multer"
import { ApiError } from "../api/ApiError"
import path from "path"
import fs from "fs"
import sharp from "sharp"

const uploadDir = path.join(__dirname, "../../public/uploads")
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (req: any, file: any, cb: any) => {
    cb(null, uploadDir)
  },
  filename: (req: any, file: any, cb: any) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
    cb(null, `raw-${uniqueSuffix}${path.extname(file.originalname)}`)
  },
})

const fileFilter = (req: any, file: any, cb: any) => {
  const allowedMimes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"]
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new ApiError(400, "Only JPEG, PNG, HEIC and WebP images are allowed"))
  }
}

export const upload = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024 }, // 30MB
  fileFilter,
})

/**
 * Amazon / Shopify Grade WebP Image Optimizer:
 * - Converts every upload to high-performance .webp
 * - Quality 85: The e-commerce industry standard (visually lossless, 70-85% size reduction)
 * - Maximum bounds: 1800x1800 (downscales huge DSLR/camera photos without enlarging smaller ones)
 * - Auto-orientation: Automatically rotates images according to smartphone camera EXIF tag
 * - Strips camera metadata (GPS, device details) for bandwidth & privacy
 */
export async function processFileToWebp(file: Express.Multer.File): Promise<void> {
  if (!file) return

  const inputPath = file.path
  if (!inputPath || !fs.existsSync(inputPath)) return

  const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
  const webpFilename = `${uniqueSuffix}.webp`
  const outputPath = path.join(uploadDir, webpFilename)

  try {
    const info = await sharp(inputPath)
      .rotate() // auto-orient based on EXIF tag
      .resize({
        width: 1800,
        height: 1800,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({
        quality: 85, // Amazon standard visually-lossless quality
        effort: 5,   // Higher compression effort
        smartSubsample: true,
      })
      .toFile(outputPath)

    // Delete temporary raw upload
    if (inputPath !== outputPath && fs.existsSync(inputPath)) {
      try {
        await fs.promises.unlink(inputPath)
      } catch {}
    }

    // Update Multer file properties
    file.filename = webpFilename
    file.path = outputPath
    file.mimetype = "image/webp"
    file.size = info.size
    file.originalname = file.originalname.replace(/\.[^/.]+$/, "") + ".webp"
  } catch (err: any) {
    console.error("Error optimizing image to WebP:", err)
  }
}

/**
 * Express Middleware: Automatically optimizes all incoming uploads to WebP
 */
export const optimizeImages = async (req: any, res: any, next: any) => {
  try {
    if (req.file) {
      await processFileToWebp(req.file)
    }
    if (req.files) {
      if (Array.isArray(req.files)) {
        for (const file of req.files) {
          await processFileToWebp(file)
        }
      } else {
        for (const key of Object.keys(req.files)) {
          for (const file of req.files[key]) {
            await processFileToWebp(file)
          }
        }
      }
    }
    next()
  } catch (err) {
    next(err)
  }
}

export async function uploadBuffer(filePath: string, buffer: Buffer, contentType?: string): Promise<string> {
  const dir = path.join(__dirname, "../../public/uploads")
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  
  const cleanPath = filePath.replace(/^\/+/, "").replace(/\.[^/.]+$/, "")
  const webpName = `${cleanPath}.webp`
  const fullPath = path.join(dir, webpName)
  
  const fileDir = path.dirname(fullPath)
  if (!fs.existsSync(fileDir)) {
    fs.mkdirSync(fileDir, { recursive: true })
  }

  try {
    await sharp(buffer)
      .rotate()
      .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85, effort: 5, smartSubsample: true })
      .toFile(fullPath)
    return `/uploads/${webpName}`
  } catch {
    const fallbackPath = path.join(dir, filePath.replace(/^\/+/, ""))
    await fs.promises.writeFile(fallbackPath, buffer)
    return `/uploads/${filePath.replace(/^\/+/, "")}`
  }
}
