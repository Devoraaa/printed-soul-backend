import mongoose from "mongoose"
import dotenv from "dotenv"
import path from "path"
import fs from "fs"
import sharp from "sharp"
import { Image } from "../models/Image"

dotenv.config()

const uploadDir = path.join(__dirname, "../../public/uploads")

async function convertAllImagesToWebp() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://127.0.0.1:27017/printedsoul"
  console.log("Connecting to MongoDB:", mongoUri)
  await mongoose.connect(mongoUri)
  console.log("Connected to MongoDB!")

  const images = await Image.find({})
  console.log(`Found ${images.length} Image records in database.`)

  let convertedCount = 0
  let skippedCount = 0
  let errorCount = 0
  let totalSavedBytes = 0

  for (const img of images) {
    if (!img.url) continue
    const cleanName = path.basename(img.url)
    const diskPath = path.join(uploadDir, cleanName)

    if (!fs.existsSync(diskPath)) {
      skippedCount++
      continue
    }

    if (cleanName.toLowerCase().endsWith(".webp")) {
      skippedCount++
      continue
    }

    const webpName = cleanName.replace(/\.[^/.]+$/, "") + ".webp"
    const webpPath = path.join(uploadDir, webpName)

    try {
      const origStat = fs.statSync(diskPath)
      const info = await sharp(diskPath)
        .rotate()
        .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 85, effort: 5, smartSubsample: true })
        .toFile(webpPath)

      // Update Image document
      img.url = `/uploads/${webpName}`
      img.contentType = "image/webp"
      img.size = info.size
      await img.save()

      // Calculate saved bytes and remove old raw image
      const savedBytes = origStat.size - info.size
      if (savedBytes > 0) totalSavedBytes += savedBytes

      if (diskPath !== webpPath) {
        try {
          fs.unlinkSync(diskPath)
        } catch {}
      }

      convertedCount++
      if (convertedCount % 10 === 0) {
        console.log(`Converted ${convertedCount} images...`)
      }
    } catch (err) {
      console.error(`Error converting ${cleanName}:`, err)
      errorCount++
    }
  }

  console.log("\n================ CONVERSION COMPLETE ================")
  console.log(`Successfully converted to WebP: ${convertedCount}`)
  console.log(`Already WebP / Skipped: ${skippedCount}`)
  console.log(`Errors: ${errorCount}`)
  console.log(`Storage space saved: ${(totalSavedBytes / (1024 * 1024)).toFixed(2)} MB`)
  console.log("=====================================================\n")

  await mongoose.disconnect()
}

convertAllImagesToWebp().catch(console.error)
