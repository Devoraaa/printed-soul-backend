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
import { parseProductName } from "../utils/productNameParser"

dotenv.config()

// Support csv-parser require
const csvParser = require("csv-parser")

const uploadDir = path.join(__dirname, "../../public/uploads")
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

/** Helper: slugify string */
function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "")
}

/** Helper: download image from URL and optimize to WebP 85% */
async function downloadAndOptimizeImage(url: string, prefix: string): Promise<mongoose.Types.ObjectId | null> {
  try {
    let cleanUrl = url.trim()
    if (cleanUrl.startsWith("//")) cleanUrl = "https:" + cleanUrl
    if (!cleanUrl.startsWith("http")) return null

    const resp = await fetch(cleanUrl)
    if (!resp.ok) return null
    const arrayBuffer = await resp.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`
    const webpFilename = `${prefix}-${uniqueSuffix}.webp`
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

export async function runCatalogSync(csvFilePath: string) {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://127.0.0.1:27017/printedsoul"
  console.log("Connecting to MongoDB:", mongoUri)
  await mongoose.connect(mongoUri)
  console.log("Connected to MongoDB!")

  // 1. SETUP CATEGORIES (Parent & Sub-categories)
  console.log("\n--- Setting up Category Hierarchy ---")

  // Covers (Parent)
  let coversCat = await Category.findOne({ slug: "covers" })
  if (!coversCat) {
    coversCat = await Category.create({ name: "Covers", slug: "covers", parentCategory: null, isActive: true, isProtected: true })
  }

  // Dual Case (Sub)
  let dualCat = await Category.findOne({ slug: "dual-case" })
  if (!dualCat) {
    dualCat = await Category.create({ name: "Dual Case", slug: "dual-case", parentCategory: coversCat._id, isActive: true, isProtected: true })
  } else if (!dualCat.parentCategory) {
    dualCat.parentCategory = coversCat._id as any
    await dualCat.save()
  }

  // Metal Case (Sub)
  let metalCat = await Category.findOne({ slug: "metal-case" })
  if (!metalCat) {
    metalCat = await Category.create({ name: "Metal Case", slug: "metal-case", parentCategory: coversCat._id, isActive: true, isProtected: true })
  } else if (!metalCat.parentCategory) {
    metalCat.parentCategory = coversCat._id as any
    await metalCat.save()
  }

  // Glass Case (Sub)
  let glassCat = await Category.findOne({ slug: "glass-case" })
  if (!glassCat) {
    glassCat = await Category.create({ name: "Glass Case", slug: "glass-case", parentCategory: coversCat._id, isActive: true, isProtected: true })
  } else if (!glassCat.parentCategory) {
    glassCat.parentCategory = coversCat._id as any
    await glassCat.save()
  }

  // Parent Categories (Direct)
  const directCats = [
    { name: "Coasters", slug: "coasters" },
    { name: "Frames", slug: "frames" },
    { name: "Mugs", slug: "mugs" },
    { name: "Tumblers", slug: "tumblers" },
    { name: "Mousepads", slug: "mousepads" },
    { name: "Tote Bags", slug: "tote-bags" },
  ]

  const catMap: Record<string, mongoose.Types.ObjectId> = {
    covers: coversCat._id as mongoose.Types.ObjectId,
    "dual-case": dualCat._id as mongoose.Types.ObjectId,
    "metal-case": metalCat._id as mongoose.Types.ObjectId,
    "glass-case": glassCat._id as mongoose.Types.ObjectId,
  }

  for (const c of directCats) {
    let cat = await Category.findOne({ slug: c.slug })
    if (!cat) {
      cat = await Category.create({ name: c.name, slug: c.slug, parentCategory: null, isActive: true, isProtected: true })
    }
    catMap[c.slug] = cat._id as mongoose.Types.ObjectId
  }

  console.log("Categories verified:")
  console.log("- Covers (Parent) -> Dual Case, Metal Case, Glass Case")
  console.log("- Coasters, Frames, Mugs, Tumblers, Mousepads, Tote Bags")

  // Fetch all devices to attach to cases
  const allDevices = await DeviceModel.find({ isActive: true }).select("_id").lean()
  const defaultDeviceIds = allDevices.map(d => d._id)

  // Default Brand
  let defaultBrand = await Brand.findOne({ slug: "printed-soul" })
  if (!defaultBrand) {
    defaultBrand = await Brand.create({ name: "Printed Soul", slug: "printed-soul", isActive: true })
  }

  // 2. CLEAN & STANDARDIZE EXISTING PRODUCTS
  console.log("\n--- Checking and Standardizing Existing Products ---")
  const existingProducts = await Product.find({})
  console.log(`Found ${existingProducts.length} existing products in DB.`)

  let updatedExisting = 0
  for (const p of existingProducts) {
    let changed = false
    const lowerName = p.name.toLowerCase()

    // Determine correct caseType and category
    if (lowerName.includes("dual case") || lowerName.includes("double layer")) {
      if (p.caseType !== "dual-case") { p.caseType = "dual-case"; changed = true }
      if (p.category?.toString() !== catMap["dual-case"].toString()) { p.category = catMap["dual-case"] as any; changed = true }
    } else if (lowerName.includes("metal case") || lowerName.includes("metal frame")) {
      if (p.caseType !== "metal-case") { p.caseType = "metal-case"; changed = true }
      if (p.category?.toString() !== catMap["metal-case"].toString()) { p.category = catMap["metal-case"] as any; changed = true }
    } else if (lowerName.includes("glass case") || lowerName.includes("tempered glass")) {
      if (p.caseType !== "glass-case") { p.caseType = "glass-case"; changed = true }
      if (p.category?.toString() !== catMap["glass-case"].toString()) { p.category = catMap["glass-case"] as any; changed = true }
    } else if (lowerName.includes("frame") || lowerName.includes("wall art") || lowerName.includes("canvas")) {
      if (p.caseType !== "frame") { p.caseType = "frame"; changed = true }
      if (p.category?.toString() !== catMap["frames"].toString()) { p.category = catMap["frames"] as any; changed = true }
    } else if (lowerName.includes("mug") || lowerName.includes("cup")) {
      if (p.caseType !== "mug") { p.caseType = "mug"; changed = true }
      if (p.category?.toString() !== catMap["mugs"].toString()) { p.category = catMap["mugs"] as any; changed = true }
    } else if (lowerName.includes("tumbler")) {
      if (p.caseType !== "tumbler") { p.caseType = "tumbler"; changed = true }
      if (p.category?.toString() !== catMap["tumblers"].toString()) { p.category = catMap["tumblers"] as any; changed = true }
    } else if (lowerName.includes("coaster")) {
      if (p.caseType !== "other") { p.caseType = "other"; changed = true }
      if (p.category?.toString() !== catMap["coasters"].toString()) { p.category = catMap["coasters"] as any; changed = true }
    } else if (lowerName.includes("mouse pad") || lowerName.includes("mousepad") || lowerName.includes("pro pad")) {
      if (p.caseType !== "other") { p.caseType = "other"; changed = true }
      if (p.category?.toString() !== catMap["mousepads"].toString()) { p.category = catMap["mousepads"] as any; changed = true }
    } else if (lowerName.includes("tote bag")) {
      if (p.caseType !== "other") { p.caseType = "other"; changed = true }
      if (p.category?.toString() !== catMap["tote-bags"].toString()) { p.category = catMap["tote-bags"] as any; changed = true }
    }

    // Ensure designSlug is present
    if (!p.designSlug) {
      const parsed = parseProductName(p.name)
      if (parsed.designSlug) {
        p.designSlug = parsed.designSlug
        changed = true
      }
    }

    if (changed) {
      await p.save()
      updatedExisting++
    }
  }
  console.log(`Standardized ${updatedExisting} existing products in database.`)

  // 3. READ CSV & IMPORT NEW PRODUCTS
  console.log("\n--- Reading CSV and Importing New Products ---")
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

  console.log(`Read ${rows.length} rows from CSV.`)

  // Group by Handle
  const productsByHandle: Record<string, any> = {}
  for (const row of rows) {
    if (!row.Handle) continue
    if (!productsByHandle[row.Handle]) {
      productsByHandle[row.Handle] = {
        title: row.Title,
        body: row["Body (HTML)"],
        type: row.Type,
        tags: row.Tags ? row.Tags.split(",").map((t: string) => t.trim()) : [],
        variants: [],
        images: [],
      }
    }
    if (row["Option1 Value"] || row["Variant Price"]) {
      productsByHandle[row.Handle].variants.push({
        option1: (row["Option1 Value"] || "").trim().toUpperCase(),
        price: parseFloat(row["Variant Price"]) || 0,
        comparePrice: parseFloat(row["Variant Compare At Price"]) || 0,
        sku: row["Variant SKU"] || "",
        image: row["Variant Image"] || row["Image Src"] || "",
      })
    }
    if (row["Image Src"] && !productsByHandle[row.Handle].images.includes(row["Image Src"])) {
      productsByHandle[row.Handle].images.push(row["Image Src"])
    }
  }

  const handles = Object.keys(productsByHandle)
  console.log(`Found ${handles.length} unique products in CSV to process.`)

  let importedCount = 0
  let skippedCount = 0

  for (const handle of handles) {
    const raw = productsByHandle[handle]
    const rawTitle = raw.title || handle

    // Clean brand prefixes from title
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

    const lowerTitle = cleanTitle.toLowerCase()

    // Determine Product Family
    const isCoaster = lowerTitle.includes("coaster")
    const isMug = lowerTitle.includes("mug") || lowerTitle.includes("cup")
    const isTumbler = lowerTitle.includes("tumbler")
    const isMousepad = lowerTitle.includes("mouse pad") || lowerTitle.includes("mousepad") || lowerTitle.includes("pro pad")
    const isToteBag = lowerTitle.includes("tote bag")
    const isFrame = lowerTitle.includes("frame") || lowerTitle.includes("artwork") || lowerTitle.includes("wall art")
    const isCase = !isCoaster && !isMug && !isTumbler && !isMousepad && !isToteBag && !isFrame

    // Download WebP images for this product
    const productImagesToDownload = raw.images.slice(0, 4)
    const downloadedImageIds: mongoose.Types.ObjectId[] = []
    for (const imgUrl of productImagesToDownload) {
      const imgId = await downloadAndOptimizeImage(imgUrl, slugify(handle).slice(0, 20))
      if (imgId) downloadedImageIds.push(imgId)
    }

    // A. PHONE CASES (Expand variants: Dual, Glass, Metal)
    if (isCase) {
      const baseDesignName = cleanTitle
        .replace(/\bcase\b/gi, "")
        .replace(/\bcover\b/gi, "")
        .replace(/\bmobile\b/gi, "")
        .replace(/\bdouble\s*layer\b/gi, "")
        .replace(/\bdual\b/gi, "")
        .replace(/\bmetal\b/gi, "")
        .replace(/\bglass\b/gi, "")
        .replace(/[-–—\s]+$/, "")
        .trim()

      const baseDesignSlug = slugify(baseDesignName)

      // Has 3 variants in CSV: METAL, GLASS, DOUBLE LAYER 3D
      const hasVariantOptions = raw.variants.some((v: any) =>
        v.option1.includes("METAL") || v.option1.includes("GLASS") || v.option1.includes("DOUBLE")
      )

      const caseConfigs = hasVariantOptions
        ? [
            {
              caseType: "dual-case" as const,
              nameSuffix: "Dual Protection Case",
              catId: catMap["dual-case"],
              variantName: "DOUBLE LAYER 3D",
              defaultPrice: 599,
            },
            {
              caseType: "glass-case" as const,
              nameSuffix: "Tempered Glass Case",
              catId: catMap["glass-case"],
              variantName: "GLASS",
              defaultPrice: 499,
            },
            {
              caseType: "metal-case" as const,
              nameSuffix: "Metal Frame Case",
              catId: catMap["metal-case"],
              variantName: "METAL",
              defaultPrice: 399,
            },
          ]
        : [
            // Single case (e.g. Cristiano Ronaldo Iconic Red Edition Double Layer Case)
            {
              caseType: (lowerTitle.includes("metal") ? "metal-case" : lowerTitle.includes("glass") ? "glass-case" : "dual-case") as any,
              nameSuffix: lowerTitle.includes("metal") ? "Metal Frame Case" : lowerTitle.includes("glass") ? "Tempered Glass Case" : "Dual Protection Case",
              catId: lowerTitle.includes("metal") ? catMap["metal-case"] : lowerTitle.includes("glass") ? catMap["glass-case"] : catMap["dual-case"],
              variantName: "DEFAULT",
              defaultPrice: 599,
            },
          ]

      for (const cfg of caseConfigs) {
        const prodName = `${baseDesignName} ${cfg.nameSuffix}`
        const prodSlug = `${baseDesignSlug}-${cfg.caseType}`

        const existing = await Product.findOne({ slug: prodSlug })
        if (existing) {
          skippedCount++
          continue
        }

        const variant = raw.variants.find((v: any) => v.option1.includes(cfg.variantName)) || raw.variants[0]
        const price = variant?.price || cfg.defaultPrice
        const comparePrice = variant?.comparePrice || price * 1.6

        await Product.create({
          name: prodName,
          slug: prodSlug,
          description: raw.body || `Premium ${cfg.nameSuffix} with vibrant, long-lasting high definition print.`,
          shortDescription: prodName,
          sku: variant?.sku || `PSS-${baseDesignSlug}-${cfg.caseType}`.toUpperCase(),
          price,
          comparePrice,
          category: cfg.catId,
          brand: defaultBrand._id,
          deviceModels: defaultDeviceIds,
          images: downloadedImageIds,
          stock: 100,
          isActive: true,
          isFeatured: importedCount < 6,
          tags: [...raw.tags, cfg.caseType, "phone-case", "mobile-cover"],
          caseType: cfg.caseType,
          designSlug: baseDesignSlug,
          ratings: { average: 4.8, count: 24 + Math.floor(Math.random() * 30) },
        })
        importedCount++
        console.log(`[Imported Case]: ${prodName}`)
      }
    } else {
      // B. NON-CASE PRODUCTS (Mugs, Tumblers, Mousepads, Tote Bags, Frames, Coasters)
      let catId = catMap["covers"]
      let caseType: any = "other"
      let defaultPrice = 399
      let name = cleanTitle

      if (isMug) {
        catId = catMap["mugs"]
        caseType = "mug"
        defaultPrice = 349
        if (!name.toLowerCase().includes("mug")) name += " Ceramic Mug"
      } else if (isTumbler) {
        catId = catMap["tumblers"]
        caseType = "tumbler"
        defaultPrice = 599
      } else if (isMousepad) {
        catId = catMap["mousepads"]
        caseType = "other"
        defaultPrice = 499
        if (!name.toLowerCase().includes("mousepad") && !name.toLowerCase().includes("pad")) name += " Pro Gaming Mousepad"
      } else if (isToteBag) {
        catId = catMap["tote-bags"]
        caseType = "other"
        defaultPrice = 399
      } else if (isFrame) {
        catId = catMap["frames"]
        caseType = "frame"
        defaultPrice = 699
      } else if (isCoaster) {
        catId = catMap["coasters"]
        caseType = "other"
        defaultPrice = 299
      }

      const prodSlug = slugify(name)
      const existing = await Product.findOne({ slug: prodSlug })
      if (existing) {
        skippedCount++
        continue
      }

      const firstVar = raw.variants[0]
      const price = firstVar?.price || defaultPrice
      const comparePrice = firstVar?.comparePrice || price * 1.5

      await Product.create({
        name,
        slug: prodSlug,
        description: raw.body || `Premium handcrafted ${name} made with durable materials and vibrant art.`,
        shortDescription: name,
        sku: firstVar?.sku || `PSS-${prodSlug.slice(0, 15)}`.toUpperCase(),
        price,
        comparePrice,
        category: catId,
        brand: defaultBrand._id,
        deviceModels: [],
        images: downloadedImageIds,
        stock: 100,
        isActive: true,
        isFeatured: importedCount < 6,
        tags: [...raw.tags, caseType],
        caseType,
        designSlug: slugify(name),
        ratings: { average: 4.8, count: 18 + Math.floor(Math.random() * 25) },
      })
      importedCount++
      console.log(`[Imported Product]: ${name}`)
    }
  }

  console.log("\n================ CATALOG SYNC COMPLETE ================")
  console.log(`Total Products Newly Imported: ${importedCount}`)
  console.log(`Skipped (Already in DB):      ${skippedCount}`)
  console.log(`Standardized Existing:        ${updatedExisting}`)
  console.log("=======================================================\n")

  await mongoose.disconnect()
}

// If invoked directly from CLI
if (require.main === module) {
  const csvArg = process.argv[2] || path.join(__dirname, "../../../products_export.csv")
  runCatalogSync(csvArg).catch(console.error)
}
