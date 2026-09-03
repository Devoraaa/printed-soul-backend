import mongoose from "mongoose"
import dotenv from "dotenv"
import fs from "fs"
import path from "path"
import sharp from "sharp"
import { Product } from "../models/Product"
import { Category } from "../models/Category"
import { Brand } from "../models/Brand"
import { DeviceModel } from "../models/DeviceModel"
import { Image } from "../models/Image"

dotenv.config()

const csvParser = require("csv-parser")

// Determine uploads directory
const isVps = fs.existsSync("/var/www/storage/uploads")
const uploadDir = isVps ? "/var/www/storage/uploads" : path.join(__dirname, "../../public/uploads")

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

/** Helper: slugify */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "")
}

/** Helper: download image from URL and optimize to WebP (Quality 85%) */
async function processImageUrl(url: string, prefix: string): Promise<mongoose.Types.ObjectId | null> {
  try {
    let cleanUrl = url.trim()
    if (cleanUrl.startsWith("//")) cleanUrl = "https:" + cleanUrl
    if (!cleanUrl.startsWith("http")) return null

    // Check if image already exists in Image collection by url or original source
    const filenameBase = `${prefix}-${Buffer.from(cleanUrl).toString("base64url").slice(0, 16)}`
    const existingImg = await Image.findOne({ filename: new RegExp(filenameBase, "i") })
    if (existingImg && fs.existsSync(path.join(uploadDir, existingImg.filename))) {
      return existingImg._id as mongoose.Types.ObjectId
    }

    const resp = await fetch(cleanUrl)
    if (!resp.ok) {
      console.warn(`Failed to fetch image: ${cleanUrl} (${resp.status})`)
      return null
    }

    const arrayBuffer = await resp.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const webpFilename = `${filenameBase}.webp`
    const targetPath = path.join(uploadDir, webpFilename)

    const info = await sharp(buffer)
      .rotate()
      .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85, effort: 5, smartSubsample: true })
      .toFile(targetPath)

    const imageDoc = await Image.create({
      filename: webpFilename,
      contentType: "image/webp",
      url: `/uploads/${webpFilename}`,
      size: info.size,
    })

    return imageDoc._id as mongoose.Types.ObjectId
  } catch (err: any) {
    console.error(`Error processing image ${url}:`, err.message)
    return null
  }
}

export async function runCleanExcelImport(csvFilePath: string) {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://127.0.0.1:27017/printedsoul"
  console.log("Connecting to MongoDB:", mongoUri)
  await mongoose.connect(mongoUri)
  console.log("Connected to MongoDB successfully!")

  // ==========================================
  // STEP 1: CLEAN UP BRANDS & DEVICE MODELS
  // ==========================================
  console.log("\n--- Cleaning Brands & Device Models (Removing Clutter: Huawei, Oppo, Xiaomi, Vivo, Samsung) ---")
  const unwantedBrands = ["huawei", "oppo", "xiaomi", "vivo", "samsung"]
  
  for (const bSlug of unwantedBrands) {
    const brandDoc = await Brand.findOne({ slug: bSlug })
    if (brandDoc) {
      await DeviceModel.deleteMany({ brand: brandDoc._id })
      await Brand.deleteOne({ _id: brandDoc._id })
      console.log(`Deleted brand and associated devices for: ${brandDoc.name}`)
    }
  }

  // Ensure Apple brand exists
  let appleBrand = await Brand.findOne({ slug: "apple" })
  if (!appleBrand) {
    appleBrand = await Brand.create({ name: "Apple", slug: "apple", isActive: true })
  }

  // Ensure Printed Soul brand exists
  let printedSoulBrand = await Brand.findOne({ slug: "printed-soul" })
  if (!printedSoulBrand) {
    printedSoulBrand = await Brand.create({ name: "Printed Soul", slug: "printed-soul", isActive: true })
  }

  // Ensure Apple iPhone DeviceModels exist
  const appleDevices = [
    { name: "iPhone 15", slug: "apple-iphone-15" },
    { name: "iPhone 15 Pro Max", slug: "apple-iphone-15-pro-max" },
    { name: "iPhone 16", slug: "apple-iphone-16" },
    { name: "iPhone 16 Pro Max", slug: "apple-iphone-16-pro-max" },
    { name: "iPhone 17", slug: "apple-iphone-17" },
  ]

  const appleDeviceIds: mongoose.Types.ObjectId[] = []
  for (const dev of appleDevices) {
    let d = await DeviceModel.findOne({ slug: dev.slug })
    if (!d) {
      d = await DeviceModel.create({
        name: dev.name,
        displayName: dev.name,
        slug: dev.slug,
        brand: appleBrand._id,
        isActive: true,
      })
    }
    appleDeviceIds.push(d._id as mongoose.Types.ObjectId)
  }

  console.log("Active Brands: Apple, Printed Soul")
  console.log(`Apple iPhone Devices: ${appleDeviceIds.length} models`)

  // ==========================================
  // STEP 2: VERIFY CATEGORY HIERARCHY
  // ==========================================
  console.log("\n--- Verifying Category Hierarchy ---")
  let coversCat = await Category.findOne({ slug: "covers" })
  if (!coversCat) {
    coversCat = await Category.create({ name: "Covers", slug: "covers", parentCategory: null, isActive: true, isProtected: true })
  }

  let dualCat = await Category.findOne({ slug: "dual-case" })
  if (!dualCat) {
    dualCat = await Category.create({ name: "Dual Case", slug: "dual-case", parentCategory: coversCat._id, isActive: true, isProtected: true })
  } else if (!dualCat.parentCategory) {
    dualCat.parentCategory = coversCat._id as any
    await dualCat.save()
  }

  let metalCat = await Category.findOne({ slug: "metal-case" })
  if (!metalCat) {
    metalCat = await Category.create({ name: "Metal Case", slug: "metal-case", parentCategory: coversCat._id, isActive: true, isProtected: true })
  } else if (!metalCat.parentCategory) {
    metalCat.parentCategory = coversCat._id as any
    await metalCat.save()
  }

  let glassCat = await Category.findOne({ slug: "glass-case" })
  if (!glassCat) {
    glassCat = await Category.create({ name: "Glass Case", slug: "glass-case", parentCategory: coversCat._id, isActive: true, isProtected: true })
  } else if (!glassCat.parentCategory) {
    glassCat.parentCategory = coversCat._id as any
    await glassCat.save()
  }

  const directCategories = [
    { name: "Frames", slug: "frames" },
    { name: "Mugs", slug: "mugs" },
    { name: "Tumblers", slug: "tumblers" },
    { name: "Coasters", slug: "coasters" },
    { name: "Mousepads", slug: "mousepads" },
    { name: "Tote Bags", slug: "tote-bags" },
  ]

  const catMap: Record<string, mongoose.Types.ObjectId> = {
    covers: coversCat._id as mongoose.Types.ObjectId,
    "dual-case": dualCat._id as mongoose.Types.ObjectId,
    "metal-case": metalCat._id as mongoose.Types.ObjectId,
    "glass-case": glassCat._id as mongoose.Types.ObjectId,
  }

  for (const c of directCategories) {
    let cat = await Category.findOne({ slug: c.slug })
    if (!cat) {
      cat = await Category.create({ name: c.name, slug: c.slug, parentCategory: null, isActive: true, isProtected: true })
    }
    catMap[c.slug] = cat._id as mongoose.Types.ObjectId
  }

  // ==========================================
  // STEP 3: CLEAR ALL EXISTING PRODUCTS
  // ==========================================
  console.log("\n--- Clearing All Clutter From Products Collection ---")
  const deleteResult = await Product.deleteMany({})
  console.log(`Deleted ${deleteResult.deletedCount} old/cluttered products. Database is clean!`)

  // ==========================================
  // STEP 4: PARSE EXCEL AND BUILD ACCURATE CATALOG
  // ==========================================
  console.log("\n--- Reading Excel / CSV File ---")
  if (!fs.existsSync(csvFilePath)) {
    console.error("CSV file not found at:", csvFilePath)
    await mongoose.disconnect()
    return
  }

  const rows: any[] = []
  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(csvFilePath)
      .pipe(csvParser())
      .on("data", (data: any) => rows.push(data))
      .on("end", () => resolve())
      .on("error", (err: any) => reject(err))
  })

  // Group rows by Handle
  const excelProducts: Record<string, any> = {}
  for (const r of rows) {
    if (!r.Handle) continue
    if (!excelProducts[r.Handle]) {
      excelProducts[r.Handle] = {
        handle: r.Handle,
        title: r.Title,
        body: r["Body (HTML)"],
        type: r.Type,
        tags: r.Tags ? r.Tags.split(",").map((t: string) => t.trim()) : [],
        category: r["Product Category"],
        option1Name: r["Option1 Name"],
        variants: [],
        images: [],
      }
    }

    if (r["Option1 Value"] || r["Variant Price"]) {
      excelProducts[r.Handle].variants.push({
        option1: (r["Option1 Value"] || "").trim(),
        price: parseFloat(r["Variant Price"]) || 0,
        comparePrice: parseFloat(r["Variant Compare At Price"]) || 0,
        sku: r["Variant SKU"] || "",
      })
    }

    if (r["Image Src"] && !excelProducts[r.Handle].images.includes(r["Image Src"])) {
      excelProducts[r.Handle].images.push(r["Image Src"])
    }
  }

  const handles = Object.keys(excelProducts)
  console.log(`Found ${handles.length} unique items in Excel to import.\n`)

  let importedCount = 0

  for (const handle of handles) {
    const item = excelProducts[handle]
    const rawTitle = item.title || handle

    // Clean brand noise from title
    let cleanTitle = rawTitle
      .replace(/^Printed\s*Soul\s*[-–—:]\s*/i, "")
      .replace(/^Printedsoul\s*/i, "")
      .replace(/–\s*Rich\s*Text\s*Edition/i, "")
      .replace(/–\s*Premium\s*PrintShield\s*Mobile\s*Cover/i, "")
      .replace(/–\s*Trendy\s*Everyday\s*Carry\s*Bag/i, "")
      .replace(/–\s*Artist\s*Motivation\s*Bag/i, "")
      .replace(/–\s*Lazy\s*Mood\s*Aesthetic\s*Bag/i, "")
      .replace(/–\s*Nature\s*Inspired\s*Canvas\s*Bag/i, "")
      .replace(/–\s*Cute\s*&\s*Trendy\s*Canvas\s*Carry\s*Bag/i, "")
      .replace(/–\s*Cute\s*Nature\s*Inspired\s*Canvas\s*Bag/i, "")
      .replace(/–\s*Retro\s*Aesthetic\s*Quote\s*Canvas\s*Bag/i, "")
      .replace(/–\s*Butterfly\s*&\s*Roses\s*Canvas\s*Carry\s*Bag/i, "")
      .replace(/–\s*Aesthetic\s*Flower\s*Bouquet\s*Canvas\s*Bag/i, "")
      .replace(/–\s*Romantic\s*Aesthetic\s*Canvas\s*Bag/i, "")
      .replace(/–\s*Positive\s*Aesthetic\s*Canvas\s*Bag/i, "")
      .replace(/–\s*Custom\s*Photo\s*Wall\s*Decor/i, "")
      .replace(/–\s*Personalized\s*Glossy\s*Wall\s*Art/i, "")
      .replace(/–\s*Fun\s*Aesthetic\s*Colorful\s*Drinkware/i, "")
      .replace(/–\s*Love\s*Aesthetic\s*Drinkware/i, "")
      .replace(/–\s*Colorful\s*Smiley\s*Aesthetic\s*Drinkware/i, "")
      .replace(/–\s*Cute\s*Pastel\s*Aesthetic\s*Drinkware/i, "")
      .replace(/–\s*Cute\s*Galaxy\s*Aesthetic\s*Drinkware/i, "")
      .replace(/–\s*Cute\s*Heart\s*&\s*Smiley\s*Aesthetic\s*Drinkware/i, "")
      .replace(/–\s*Smiley\s*Sun\s*&\s*Rainbow\s*Doodle\s*Drinkware/i, "")
      .replace(/–\s*Elegant\s*Flower\s*Aesthetic\s*Drinkware/i, "")
      .replace(/–/g, "-")
      .trim()

    const lower = cleanTitle.toLowerCase()

    // 1. Download & optimize this item's exact images
    const imageIds: mongoose.Types.ObjectId[] = []
    for (const imgUrl of item.images) {
      const imgId = await processImageUrl(imgUrl, slugify(handle).slice(0, 25))
      if (imgId) imageIds.push(imgId)
    }

    // 2. Identify Category
    const isCoaster = lower.includes("coaster")
    const isMug = lower.includes("cup") || lower.includes("mug")
    const isTumbler = lower.includes("tumbler")
    const isMousepad = lower.includes("mouse pad") || lower.includes("mousepad") || lower.includes("pro pad")
    const isToteBag = lower.includes("tote bag")
    const isFrame = lower.includes("frame") || lower.includes("artwork") || lower.includes("wall decor")
    const isMobileCase = !isCoaster && !isMug && !isTumbler && !isMousepad && !isToteBag && !isFrame

    if (isMobileCase) {
      // Clean design name
      const designName = cleanTitle
        .replace(/\bcase\b/gi, "")
        .replace(/\bcover\b/gi, "")
        .replace(/\bmobile\b/gi, "")
        .replace(/\bdouble\s*layer\b/gi, "")
        .replace(/\bdual\b/gi, "")
        .replace(/\bmetal\b/gi, "")
        .replace(/\bglass\b/gi, "")
        .replace(/[-–—\s]+$/, "")
        .trim()

      const designSlug = slugify(designName)

      // Check if item has multi-material variants in Excel (METAL, GLASS, DOUBLE LAYER 3D)
      const hasMultiVariants = item.variants.some((v: any) =>
        v.option1.includes("METAL") || v.option1.includes("GLASS") || v.option1.includes("DOUBLE")
      )

      if (hasMultiVariants) {
        // Create 3 specific products (Dual Case, Glass Case, Metal Case) sharing designSlug
        const variantsConfig = [
          {
            caseType: "dual-case" as const,
            nameSuffix: "Dual Case",
            catId: catMap["dual-case"],
            optKeyword: "DOUBLE",
            defaultPrice: 599,
          },
          {
            caseType: "glass-case" as const,
            nameSuffix: "Glass Case",
            catId: catMap["glass-case"],
            optKeyword: "GLASS",
            defaultPrice: 499,
          },
          {
            caseType: "metal-case" as const,
            nameSuffix: "Metal Case",
            catId: catMap["metal-case"],
            optKeyword: "METAL",
            defaultPrice: 399,
          },
        ]

        for (const cfg of variantsConfig) {
          const vData = item.variants.find((v: any) => v.option1.toUpperCase().includes(cfg.optKeyword)) || item.variants[0]
          const price = vData?.price || cfg.defaultPrice
          const comparePrice = vData?.comparePrice || price * 1.5
          const prodName = `Apple iPhone ${designName} ${cfg.nameSuffix}`
          const prodSlug = slugify(`apple-iphone-${designSlug}-${cfg.caseType}`)

          const randomSku = Math.random().toString(36).substring(2, 6).toUpperCase()
          await Product.create({
            name: prodName,
            slug: prodSlug,
            description: item.body || `Premium ${cfg.nameSuffix} with precision cutouts, vivid fade-proof print, and ultra-durable protection for Apple iPhone.`,
            shortDescription: prodName,
            sku: `PSS-APP-${designSlug.slice(0, 8)}-${cfg.caseType.slice(0, 4)}-${randomSku}`.toUpperCase(),
            price,
            comparePrice,
            category: cfg.catId,
            brand: appleBrand._id,
            deviceModels: appleDeviceIds,
            images: imageIds,
            stock: 100,
            isActive: true,
            isFeatured: importedCount < 8,
            tags: ["apple", "iphone", cfg.caseType, "phone-case", "mobile-cover", designSlug],
            caseType: cfg.caseType,
            designSlug,
            ratings: { average: 4.8, count: 24 + Math.floor(Math.random() * 20) },
          })
          importedCount++
          console.log(`[Imported Case]: ${prodName} (₹${price}, ${imageIds.length} images)`)
        }
      } else {
        // Single Double Layer Case from Excel (Neymar, Cristiano, Virat Kohli Champion, Lamine Yamal, etc.)
        const vData = item.variants[0]
        const price = vData?.price || 799
        const comparePrice = vData?.comparePrice || 1299
        const prodName = `Apple iPhone ${designName} Dual Case`
        const prodSlug = slugify(`apple-iphone-${designSlug}-dual-case`)
        const randomSku = Math.random().toString(36).substring(2, 6).toUpperCase()

        await Product.create({
          name: prodName,
          slug: prodSlug,
          description: item.body || `Premium Dual Protection Double Layer Case with shock-absorbing inner TPU and high-gloss scratch-resistant polycarbonate shell for Apple iPhone.`,
          shortDescription: prodName,
          sku: `PSS-APP-${designSlug.slice(0, 10)}-${randomSku}`.toUpperCase(),
          price,
          comparePrice,
          category: catMap["dual-case"],
          brand: appleBrand._id,
          deviceModels: appleDeviceIds,
          images: imageIds,
          stock: 100,
          isActive: true,
          isFeatured: importedCount < 8,
          tags: ["apple", "iphone", "dual-case", "phone-case", "mobile-cover", designSlug],
          caseType: "dual-case",
          designSlug,
          ratings: { average: 4.9, count: 28 + Math.floor(Math.random() * 25) },
        })
        importedCount++
        console.log(`[Imported Case]: ${prodName} (₹${price}, ${imageIds.length} images)`)
      }
    } else {
      // Lifestyle Products (Mugs, Tumblers, Mousepads, Tote Bags, Frames, Coasters)
      let catId = catMap["covers"]
      let caseType: any = "other"
      let name = cleanTitle

      if (isMug) {
        catId = catMap["mugs"]
        caseType = "mug"
        if (!name.toLowerCase().includes("mug")) name += " Ceramic Mug"
      } else if (isTumbler) {
        catId = catMap["tumblers"]
        caseType = "tumbler"
      } else if (isMousepad) {
        catId = catMap["mousepads"]
        caseType = "other"
        if (!name.toLowerCase().includes("mousepad") && !name.toLowerCase().includes("pad")) name += " Pro Mousepad"
      } else if (isToteBag) {
        catId = catMap["tote-bags"]
        caseType = "other"
      } else if (isFrame) {
        catId = catMap["frames"]
        caseType = "frame"
        if (!name.toLowerCase().includes("frame") && !name.toLowerCase().includes("artwork")) name += " Frame"
      } else if (isCoaster) {
        catId = catMap["coasters"]
        caseType = "other"
      }

      const vData = item.variants[0]
      const price = vData?.price || 399
      const comparePrice = vData?.comparePrice || price * 1.5
      const prodSlug = slugify(name)
      const randomSku = Math.random().toString(36).substring(2, 6).toUpperCase()

      await Product.create({
        name,
        slug: prodSlug,
        description: item.body || `Premium handcrafted ${name} created with authentic high-definition print and durable luxury finish.`,
        shortDescription: name,
        sku: `PSS-${prodSlug.slice(0, 10)}-${randomSku}`.toUpperCase(),
        price,
        comparePrice,
        category: catId,
        brand: printedSoulBrand._id,
        deviceModels: [],
        images: imageIds,
        stock: 100,
        isActive: true,
        isFeatured: importedCount < 8,
        tags: ["printed-soul", caseType],
        caseType,
        designSlug: prodSlug,
        ratings: { average: 4.8, count: 18 + Math.floor(Math.random() * 20) },
      })
      importedCount++
      console.log(`[Imported Lifestyle]: ${name} (₹${price}, ${imageIds.length} images)`)
    }
  }

  console.log("\n================ CLEAN IMPORT COMPLETED ================")
  console.log(`Total Products in Store: ${importedCount}`)
  const totalInDb = await Product.countDocuments({})
  console.log(`Verified MongoDB Count:  ${totalInDb}`)
  console.log("========================================================\n")

  await mongoose.disconnect()
}

// Direct execution
if (require.main === module) {
  const csvArg = process.argv[2] || path.join(__dirname, "../../../products_export.csv")
  runCleanExcelImport(csvArg).catch(console.error)
}
