import mongoose from "mongoose"
import dotenv from "dotenv"
import fs from "fs"
import path from "path"
import sharp from "sharp"
import { Product } from "../models/Product"
import { Image } from "../models/Image"

dotenv.config()

const csvParser = require("csv-parser")

const isVps = fs.existsSync("/var/www/storage/uploads")
const uploadDir = isVps ? "/var/www/storage/uploads" : path.join(__dirname, "../../public/uploads")

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

// Map of design slugs to design image URLs from CSV or web
const DESIGN_IMAGE_MAP: Record<string, string[]> = {
  "virat-x-superman": [],
  "gods-plan": [],
  "virat": [],
  "neymar-jr-legacy-edition": [],
  "virat-kohli-champions-journey": [],
  "virat-kohli-royal-legacy": [],
  "lamine-yamal-barca-legacy-edition": [],
  "cristiano-ronaldo-iconic-red-edition": [],
  "virat-era-collectors-edition": [],
  "customised-photo-printed": [],
  "batman-dark-knight": [],
  "spiderman-miles": [],
  "abstract-ocean": [],
}

async function downloadAndOptimize(url: string, prefix: string): Promise<mongoose.Types.ObjectId | null> {
  try {
    let cleanUrl = url.trim()
    if (cleanUrl.startsWith("//")) cleanUrl = "https:" + cleanUrl
    if (!cleanUrl.startsWith("http")) return null

    // Generate safe deterministic filename based on URL
    const urlHash = Buffer.from(cleanUrl).toString("base64url").slice(0, 24)
    const webpFilename = `${prefix.slice(0, 30)}-${urlHash}.webp`
    const targetPath = path.join(uploadDir, webpFilename)

    // Check if Image doc already exists in DB
    let existingImg = await Image.findOne({ filename: webpFilename })
    if (existingImg && fs.existsSync(targetPath)) {
      return existingImg._id as mongoose.Types.ObjectId
    }

    if (!fs.existsSync(targetPath)) {
      const resp = await fetch(cleanUrl)
      if (!resp.ok) return null
      const arrayBuffer = await resp.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      await sharp(buffer)
        .rotate()
        .resize({ width: 1400, height: 1400, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 85, effort: 4 })
        .toFile(targetPath)
    }

    const stats = fs.statSync(targetPath)
    if (!existingImg) {
      existingImg = await Image.create({
        filename: webpFilename,
        contentType: "image/webp",
        url: `/uploads/${webpFilename}`,
        size: stats.size,
      })
    }

    return existingImg._id as mongoose.Types.ObjectId
  } catch (err: any) {
    console.error(`Error downloading ${url}:`, err.message)
    return null
  }
}

async function run() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://127.0.0.1:27017/printedsoul"
  console.log("Connecting to DB:", mongoUri)
  await mongoose.connect(mongoUri)
  console.log("Connected to MongoDB!")

  // 1. COLLECT CSV DATA
  const csvFiles = [
    "/var/www/printed-soul/products_export.csv",
    "/var/www/printed-soul/products_export_1.csv",
    "/var/www/printed-soul/products_export_2.csv",
    "/var/www/printed-soul/products_export_3.csv",
    path.join(__dirname, "../../../products_export.csv"),
    path.join(__dirname, "../../../products_export (1).csv"),
    path.join(__dirname, "../../../products_export (2).csv"),
    path.join(__dirname, "../../../products_export (3).csv"),
  ].filter(f => fs.existsSync(f))

  console.log(`Found ${csvFiles.length} CSV files to parse.`)

  const handleImages: Record<string, string[]> = {}
  const titleImages: Record<string, string[]> = {}

  for (const file of csvFiles) {
    await new Promise((resolve) => {
      fs.createReadStream(file)
        .pipe(csvParser())
        .on("data", (r: any) => {
          const h = r.Handle?.trim()
          const t = r.Title?.trim()
          const img = r["Image Src"]?.trim()
          if (!img || !img.startsWith("http")) return

          if (h) {
            if (!handleImages[h]) handleImages[h] = []
            if (!handleImages[h].includes(img)) handleImages[h].push(img)
          }
          if (t) {
            const cleanT = slugify(t)
            if (!titleImages[cleanT]) titleImages[cleanT] = []
            if (!titleImages[cleanT].includes(img)) titleImages[cleanT].push(img)
          }

          // Case design detection
          const lowerText = `${h} ${t}`.toLowerCase()
          if (lowerText.includes("virat") && lowerText.includes("superman")) {
            if (!DESIGN_IMAGE_MAP["virat-x-superman"].includes(img)) DESIGN_IMAGE_MAP["virat-x-superman"].push(img)
          } else if (lowerText.includes("god's plan") || lowerText.includes("gods-plan")) {
            if (!DESIGN_IMAGE_MAP["gods-plan"].includes(img)) DESIGN_IMAGE_MAP["gods-plan"].push(img)
          } else if (lowerText.includes("neymar")) {
            if (!DESIGN_IMAGE_MAP["neymar-jr-legacy-edition"].includes(img)) DESIGN_IMAGE_MAP["neymar-jr-legacy-edition"].push(img)
          } else if (lowerText.includes("cristiano") || lowerText.includes("ronaldo")) {
            if (!DESIGN_IMAGE_MAP["cristiano-ronaldo-iconic-red-edition"].includes(img)) DESIGN_IMAGE_MAP["cristiano-ronaldo-iconic-red-edition"].push(img)
          } else if (lowerText.includes("lamine") || lowerText.includes("yamal")) {
            if (!DESIGN_IMAGE_MAP["lamine-yamal-barca-legacy-edition"].includes(img)) DESIGN_IMAGE_MAP["lamine-yamal-barca-legacy-edition"].push(img)
          } else if (lowerText.includes("champion's journey") || lowerText.includes("champions-journey")) {
            if (!DESIGN_IMAGE_MAP["virat-kohli-champions-journey"].includes(img)) DESIGN_IMAGE_MAP["virat-kohli-champions-journey"].push(img)
          } else if (lowerText.includes("royal legacy")) {
            if (!DESIGN_IMAGE_MAP["virat-kohli-royal-legacy"].includes(img)) DESIGN_IMAGE_MAP["virat-kohli-royal-legacy"].push(img)
          } else if (lowerText.includes("collector") || lowerText.includes("virat-era")) {
            if (!DESIGN_IMAGE_MAP["virat-era-collectors-edition"].includes(img)) DESIGN_IMAGE_MAP["virat-era-collectors-edition"].push(img)
          } else if (lowerText.includes("customised photo") || lowerText.includes("customised-photo")) {
            if (!DESIGN_IMAGE_MAP["customised-photo-printed"].includes(img)) DESIGN_IMAGE_MAP["customised-photo-printed"].push(img)
          } else if (lowerText.includes("virat") && (lowerText.includes("case") || lowerText.includes("cover"))) {
            if (!DESIGN_IMAGE_MAP["virat"].includes(img)) DESIGN_IMAGE_MAP["virat"].push(img)
          }
        })
        .on("end", resolve)
    })
  }

  console.log(`Parsed ${Object.keys(handleImages).length} handles with images.`)

  // Fallback cover images for Batman, Spiderman, Ocean if empty
  const defaultCoverImgs = DESIGN_IMAGE_MAP["virat-x-superman"].length > 0
    ? DESIGN_IMAGE_MAP["virat-x-superman"]
    : DESIGN_IMAGE_MAP["neymar-jr-legacy-edition"]

  DESIGN_IMAGE_MAP["batman-dark-knight"] = DESIGN_IMAGE_MAP["batman-dark-knight"]?.length ? DESIGN_IMAGE_MAP["batman-dark-knight"] : defaultCoverImgs
  DESIGN_IMAGE_MAP["spiderman-miles"] = DESIGN_IMAGE_MAP["spiderman-miles"]?.length ? DESIGN_IMAGE_MAP["spiderman-miles"] : defaultCoverImgs
  DESIGN_IMAGE_MAP["abstract-ocean"] = DESIGN_IMAGE_MAP["abstract-ocean"]?.length ? DESIGN_IMAGE_MAP["abstract-ocean"] : defaultCoverImgs

  // 2. CACHE DOWNLOADED IMAGE OBJECTIDS
  const urlToIdMap: Record<string, mongoose.Types.ObjectId> = {}

  async function getImgId(url: string, prefix: string): Promise<mongoose.Types.ObjectId | null> {
    if (urlToIdMap[url]) return urlToIdMap[url]
    const id = await downloadAndOptimize(url, prefix)
    if (id) urlToIdMap[url] = id
    return id
  }

  // Pre-download cover design images
  const designImageIds: Record<string, mongoose.Types.ObjectId[]> = {}
  for (const [dSlug, urls] of Object.entries(DESIGN_IMAGE_MAP)) {
    designImageIds[dSlug] = []
    for (const u of urls.slice(0, 3)) {
      const id = await getImgId(u, `cover-${dSlug}`)
      if (id) designImageIds[dSlug].push(id)
    }
  }

  // 3. UPDATE ALL PRODUCTS IN DATABASE
  const allProducts = await Product.find({})
  console.log(`Updating images for ${allProducts.length} products...`)

  let updatedCount = 0

  for (const prod of allProducts) {
    let matchedUrls: string[] = []

    // If it's a phone case
    if (prod.caseType && prod.caseType !== "other" && prod.designSlug && designImageIds[prod.designSlug]?.length > 0) {
      prod.images = designImageIds[prod.designSlug]
      await prod.save()
      updatedCount++
      continue
    }

    // Try handle match
    if (handleImages[prod.slug]) {
      matchedUrls = handleImages[prod.slug]
    } else {
      // Try fuzzy title match
      const pSlug = slugify(prod.name)
      for (const [tKey, urls] of Object.entries(titleImages)) {
        if (pSlug.includes(tKey) || tKey.includes(pSlug)) {
          matchedUrls = urls
          break
        }
      }

      // Try keyword match for Mugs, Tumblers, Mousepads, etc.
      if (matchedUrls.length === 0) {
        const prodWords = prod.name.toLowerCase().split(/\s+/).filter(w => w.length > 3)
        for (const [h, urls] of Object.entries(handleImages)) {
          const matchCount = prodWords.filter(w => h.toLowerCase().includes(w)).length
          if (matchCount >= 2) {
            matchedUrls = urls
            break
          }
        }
      }
    }

    if (matchedUrls.length > 0) {
      const imgIds: mongoose.Types.ObjectId[] = []
      for (const u of matchedUrls.slice(0, 3)) {
        const id = await getImgId(u, slugify(prod.name).slice(0, 20))
        if (id) imgIds.push(id)
      }

      if (imgIds.length > 0) {
        prod.images = imgIds
        await prod.save()
        updatedCount++
      }
    }
  }

  console.log(`\n🎉 Successfully downloaded and linked images for ${updatedCount} / ${allProducts.length} products!`)

  // Verification count
  const withImages = await Product.countDocuments({ images: { $exists: true, $not: { $size: 0 } } })
  console.log(`📊 Products with valid images in DB: ${withImages} / ${allProducts.length}`)

  await mongoose.disconnect()
}

run().catch(console.error)
