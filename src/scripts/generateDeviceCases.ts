import mongoose from "mongoose"
import dotenv from "dotenv"
import { Product } from "../models/Product"
import { Category } from "../models/Category"
import { Brand } from "../models/Brand"
import { DeviceModel } from "../models/DeviceModel"

dotenv.config()

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

// 10 Case Designs from CSV
const CASE_DESIGNS = [
  { name: "Virat X Superman", slug: "virat-x-superman" },
  { name: "God's Plan", slug: "gods-plan" },
  { name: "Virat Champion", slug: "virat" },
  { name: "Neymar Jr Legacy Edition", slug: "neymar-jr-legacy-edition" },
  { name: "Virat Kohli Champion's Journey", slug: "virat-kohli-champions-journey" },
  { name: "Virat Kohli Royal Legacy", slug: "virat-kohli-royal-legacy" },
  { name: "Lamine Yamal Barça Legacy Edition", slug: "lamine-yamal-barca-legacy-edition" },
  { name: "Cristiano Ronaldo Iconic Red Edition", slug: "cristiano-ronaldo-iconic-red-edition" },
  { name: "Virat Era Collector's Edition", slug: "virat-era-collectors-edition" },
  { name: "Customised Photo Printed", slug: "customised-photo-printed" },
]

async function generateDeviceCases() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://127.0.0.1:27017/printedsoul"
  console.log("Connecting to MongoDB:", mongoUri)
  await mongoose.connect(mongoUri)
  console.log("Connected to MongoDB!")

  // Categories
  const dualCat = await Category.findOne({ slug: "dual-case" })
  const metalCat = await Category.findOne({ slug: "metal-case" })
  const glassCat = await Category.findOne({ slug: "glass-case" })

  if (!dualCat || !metalCat || !glassCat) {
    throw new Error("Missing case categories in database")
  }

  // Devices & Brands
  const devices = await DeviceModel.find({ isActive: true }).populate("brand")
  console.log(`Found ${devices.length} active devices.`)

  // Step 1: Collect images for each design
  const designImages: Record<string, mongoose.Types.ObjectId[]> = {}
  for (const d of CASE_DESIGNS) {
    // Find any existing product with this designSlug or matching name
    const existing = await Product.findOne({
      $or: [
        { designSlug: d.slug },
        { designSlug: d.slug.replace("barca", "bara") },
        { name: new RegExp(d.name, "i") },
      ],
      images: { $exists: true, $not: { $size: 0 } },
    })

    if (existing && existing.images?.length > 0) {
      designImages[d.slug] = existing.images
      console.log(`Design [${d.name}] has ${existing.images.length} images.`)
    } else {
      console.warn(`No images found for [${d.name}]!`)
    }
  }

  // Step 2: Delete the 16 generic placeholder cases with Printed Soul brand
  const psBrand = await Brand.findOne({ slug: "printed-soul" })
  if (psBrand) {
    const deleted = await Product.deleteMany({
      brand: psBrand._id,
      caseType: { $in: ["dual-case", "metal-case", "glass-case"] },
    })
    console.log(`Deleted ${deleted.deletedCount} generic placeholder cases with Printed Soul brand.`)
  }

  let createdCount = 0
  let skippedCount = 0

  // Step 3: Generate device-specific cases according to business rules
  for (const design of CASE_DESIGNS) {
    const images = designImages[design.slug] || []

    for (const dev of devices) {
      const brand = dev.brand as any
      if (!brand) continue

      const brandName = brand.name.trim()
      const deviceName = (dev.displayName || dev.name).trim()

      // Business Rule:
      // "dual case sirf apple and samsung s series ke liye hi hai bro"
      const isApple = brandName.toLowerCase().includes("apple")
      const isSamsungSSeries = brandName.toLowerCase().includes("samsung") && (
        deviceName.toLowerCase().includes("s22") ||
        deviceName.toLowerCase().includes("s23") ||
        deviceName.toLowerCase().includes("s24")
      )
      const supportsDual = isApple || isSamsungSSeries

      const caseOptions: {
        caseType: "dual-case" | "metal-case" | "glass-case"
        nameSuffix: string
        category: mongoose.Types.ObjectId
        price: number
      }[] = []

      if (supportsDual) {
        caseOptions.push({
          caseType: "dual-case",
          nameSuffix: "Dual Case",
          category: dualCat._id as mongoose.Types.ObjectId,
          price: 599,
        })
      }

      // All devices support Metal & Glass
      caseOptions.push(
        {
          caseType: "metal-case",
          nameSuffix: "Metal Case",
          category: metalCat._id as mongoose.Types.ObjectId,
          price: 399,
        },
        {
          caseType: "glass-case",
          nameSuffix: "Glass Case",
          category: glassCat._id as mongoose.Types.ObjectId,
          price: 499,
        }
      )

      for (const opt of caseOptions) {
        // Standard Name Formula: [Brand] [Device] [Design Name] [Case Type]
        // e.g. "Apple iPhone 15 Virat X Superman Dual Case"
        const prodName = `${brandName} ${deviceName} ${design.name} ${opt.nameSuffix}`
        const prodSlug = slugify(`${brandName}-${deviceName}-${design.name}-${opt.caseType}`)

        const existing = await Product.findOne({ slug: prodSlug })
        if (existing) {
          skippedCount++
          continue
        }

        const randomCode = Math.random().toString(36).substring(2, 6).toUpperCase()
        const sku = `PSS-${brand.slug.slice(0, 3)}-${dev.slug}-${opt.caseType.slice(0, 4)}-${randomCode}`.toUpperCase()

        await Product.create({
          name: prodName,
          slug: prodSlug,
          description: `Premium ${opt.nameSuffix} for ${brandName} ${deviceName} featuring exclusive ${design.name} artwork. Engineered with precision cutouts, shock absorption, and fade-proof print.`,
          shortDescription: prodName,
          sku,
          price: opt.price,
          comparePrice: 999,
          category: opt.category,
          brand: brand._id,
          deviceModels: [dev._id],
          images: images,
          stock: 100,
          isActive: true,
          isFeatured: createdCount < 12,
          tags: [brandName.toLowerCase(), dev.slug, opt.caseType, "phone-case", "mobile-cover"],
          caseType: opt.caseType,
          designSlug: design.slug,
          ratings: { average: 4.8, count: 20 + Math.floor(Math.random() * 30) },
        })

        createdCount++
      }
    }
  }

  console.log("\n================ GENERATION COMPLETE ================")
  console.log(`Total Products Created: ${createdCount}`)
  console.log(`Skipped (Already in DB): ${skippedCount}`)
  const totalProducts = await Product.countDocuments({})
  console.log(`Total Products in Database Now: ${totalProducts}`)
  console.log("=====================================================\n")

  await mongoose.disconnect()
}

generateDeviceCases().catch(console.error)
