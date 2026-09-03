import mongoose from "mongoose"
import dotenv from "dotenv"
import fs from "fs"
import path from "path"
import { Product } from "../models/Product"
import { Category } from "../models/Category"
import { Brand } from "../models/Brand"
import { DeviceModel } from "../models/DeviceModel"
import { Image } from "../models/Image"

dotenv.config()

const isVps = fs.existsSync("/var/www/storage/uploads")
const uploadDir = isVps ? "/var/www/storage/uploads" : path.join(__dirname, "../../public/uploads")

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
}

async function restore() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://127.0.0.1:27017/printedsoul"
  console.log("🚀 Connecting to MongoDB:", mongoUri)
  await mongoose.connect(mongoUri)
  console.log("Connected to DB successfully.")

  // ==========================================
  // STEP 1: DELETE ONLY COVER / CASE PRODUCTS
  // ==========================================
  console.log("\n--- Deleting ONLY Cover / Case Products (Leaving Mugs, Tumblers, Frames, Coasters, etc. Intact) ---")

  const coversCat = await Category.findOne({ slug: "covers" })
  const dualCat = await Category.findOne({ slug: "dual-case" })
  const metalCat = await Category.findOne({ slug: "metal-case" })
  const glassCat = await Category.findOne({ slug: "glass-case" })

  const coverCatIds = [coversCat?._id, dualCat?._id, metalCat?._id, glassCat?._id].filter(Boolean)

  const deletedCases = await Product.deleteMany({
    $or: [
      { category: { $in: coverCatIds } },
      { caseType: { $in: ["dual-case", "metal-case", "glass-case", "hard-case", "soft-case", "wallet-case"] } },
    ],
  })
  console.log(`✅ Deleted ${deletedCases.deletedCount} cover/case products.`)

  // Count preserved lifestyle products
  const remainingCount = await Product.countDocuments({})
  console.log(`🛡️ Preserved ${remainingCount} lifestyle products (Mugs, Tumblers, Frames, Coasters, Mousepads, Tote Bags).`)

  // ==========================================
  // STEP 2: DELETE CSV-GENERATED IMAGES
  // ==========================================
  console.log("\n--- Cleaning CSV-generated images from DB & disk ---")
  const csvImages = await Image.find({
    $or: [
      { filename: /aHR0cHM6/ },
      { url: /aHR0cHM6/ },
    ],
  })

  let filesDeleted = 0
  for (const img of csvImages) {
    if (img.filename) {
      const diskPath = path.join(uploadDir, img.filename)
      if (fs.existsSync(diskPath)) {
        try {
          fs.unlinkSync(diskPath)
          filesDeleted++
        } catch (_) {}
      }
    }
  }

  const delImgsRes = await Image.deleteMany({
    $or: [
      { filename: /aHR0cHM6/ },
      { url: /aHR0cHM6/ },
    ],
  })
  console.log(`✅ Deleted ${delImgsRes.deletedCount} CSV image records from DB and ${filesDeleted} files from disk.`)

  // ==========================================
  // STEP 3: RESTORE STARTING BRANDS & DEVICES
  // ==========================================
  console.log("\n--- Restoring Starting Brands & Device Models ---")

  // Ensure Brands
  const brandDefs = [
    { name: "Apple", slug: "apple" },
    { name: "Samsung", slug: "samsung" },
    { name: "Vivo", slug: "vivo" },
    { name: "Oppo", slug: "oppo" },
    { name: "Xiaomi", slug: "xiaomi" },
    { name: "Printed Soul", slug: "printed-soul" },
  ]

  const brandMap: Record<string, any> = {}
  for (const b of brandDefs) {
    let brandDoc = await Brand.findOne({ slug: b.slug })
    if (!brandDoc) {
      brandDoc = await Brand.create({ name: b.name, slug: b.slug, isActive: true })
    }
    brandMap[b.name] = brandDoc
  }

  // Ensure Device Models
  const deviceDefs: Record<string, { name: string; displayName: string; slug: string }[]> = {
    Apple: [
      { name: "iphone-15", displayName: "iPhone 15", slug: "apple-iphone-15" },
      { name: "iphone-16", displayName: "iPhone 16", slug: "apple-iphone-16" },
      { name: "iphone-17", displayName: "iPhone 17", slug: "apple-iphone-17" },
    ],
    Samsung: [
      { name: "s22-ultra", displayName: "S22 Ultra", slug: "samsung-s22-ultra" },
      { name: "s23-ultra", displayName: "S23 Ultra", slug: "samsung-s23-ultra" },
      { name: "s24-ultra", displayName: "S24 Ultra", slug: "samsung-s24-ultra" },
      { name: "s24", displayName: "S24", slug: "samsung-s24" },
    ],
    Vivo: [
      { name: "v29", displayName: "V29", slug: "vivo-v29" },
      { name: "v30", displayName: "V30", slug: "vivo-v30" },
      { name: "x100", displayName: "X100", slug: "vivo-x100" },
    ],
    Oppo: [
      { name: "reno-10", displayName: "Reno 10", slug: "oppo-reno-10" },
    ],
    Xiaomi: [
      { name: "14-pro", displayName: "14 Pro", slug: "xiaomi-14-pro" },
    ],
  }

  const allDeviceDocs: any[] = []
  const brandDeviceMap: Record<string, any[]> = {}

  for (const [brandName, devs] of Object.entries(deviceDefs)) {
    const brand = brandMap[brandName]
    brandDeviceMap[brandName] = []

    for (const dev of devs) {
      let doc = await DeviceModel.findOne({ slug: dev.slug })
      if (!doc) {
        doc = await DeviceModel.create({
          name: dev.name,
          displayName: dev.displayName,
          slug: dev.slug,
          brand: brand._id,
          isActive: true,
        })
      }
      brandDeviceMap[brandName].push(doc)
      allDeviceDocs.push(doc)
    }
  }

  // Find sample mockup images available in DB
  const existingMockups = await Image.find({
    url: { $regex: /mockup|product|1785/i },
  }).limit(20)

  const sampleImageIds: mongoose.Types.ObjectId[] = existingMockups.map(i => i._id as mongoose.Types.ObjectId)
  if (sampleImageIds.length === 0) {
    // Fallback to any active image
    const anyImgs = await Image.find({}).limit(10)
    anyImgs.forEach(i => sampleImageIds.push(i._id as mongoose.Types.ObjectId))
  }
  console.log(`Found ${sampleImageIds.length} mockup images for cases.`)

  // ==========================================
  // STEP 4: RESTORE STARTING COVER PRODUCTS
  // ==========================================
  console.log("\n--- Restoring Starting Cover Products with Business Rules ---")

  const coverDesigns = [
    { name: "Batman Dark Knight", slug: "batman-dark-knight" },
    { name: "Spiderman Miles", slug: "spiderman-miles" },
    { name: "Abstract Ocean", slug: "abstract-ocean" },
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

  let createdCases = 0

  for (const design of coverDesigns) {
    for (const [brandName, devs] of Object.entries(brandDeviceMap)) {
      const brand = brandMap[brandName]

      for (const dev of devs) {
        const deviceName = dev.displayName

        // Business Rule: "dual case sirf apple and samsung s series ke liye hi hai bro"
        const isApple = brandName === "Apple"
        const isSamsungSSeries = brandName === "Samsung" && dev.name.toLowerCase().includes("ultra")
        const isDualEligible = isApple || isSamsungSSeries

        const caseTypesToCreate: {
          caseType: "dual-case" | "metal-case" | "glass-case"
          nameSuffix: string
          catId: any
          price: number
          comparePrice: number
        }[] = []

        if (isDualEligible) {
          caseTypesToCreate.push({
            caseType: "dual-case",
            nameSuffix: "Dual Case",
            catId: dualCat?._id,
            price: 799,
            comparePrice: 1200,
          })
        }

        // Metal and Glass are available for all devices
        caseTypesToCreate.push(
          {
            caseType: "metal-case",
            nameSuffix: "Metal Case",
            catId: metalCat?._id,
            price: 399,
            comparePrice: 899,
          },
          {
            caseType: "glass-case",
            nameSuffix: "Glass Case",
            catId: glassCat?._id,
            price: 499,
            comparePrice: 999,
          }
        )

        for (const opt of caseTypesToCreate) {
          const prodName = `${brandName} ${deviceName} ${design.name} ${opt.nameSuffix}`
          const randomSuffix = Math.random().toString(36).substring(2, 6)
          const prodSlug = slugify(`${brandName}-${deviceName}-${design.slug}-${opt.caseType}-${randomSuffix}`)
          const sku = `PSS-${brand.slug.slice(0, 3)}-${dev.name}-${opt.caseType.slice(0, 4)}-${randomSuffix}`.toUpperCase()

          // Pick 1-2 images for this case
          const imgSlice = sampleImageIds.slice(0, 2)

          await Product.create({
            name: prodName,
            slug: prodSlug,
            description: `Official ${opt.nameSuffix} for ${brandName} ${deviceName} featuring iconic ${design.name} artwork. Engineered with dual-layer shock absorption, precision cutouts, and ultra-vivid fade-proof print.`,
            shortDescription: prodName,
            sku,
            price: opt.price,
            comparePrice: opt.comparePrice,
            category: opt.catId,
            brand: brand._id,
            deviceModels: [dev._id],
            images: imgSlice,
            stock: 100,
            isActive: true,
            isFeatured: createdCases < 15,
            tags: [brandName.toLowerCase(), dev.name, opt.caseType, "phone-case", "mobile-cover", design.slug],
            caseType: opt.caseType,
            designSlug: design.slug,
            ratings: { average: 4.8, count: 24 + Math.floor(Math.random() * 20) },
          })
          createdCases++
        }
      }
    }
  }

  console.log(`\n🎉 Successfully restored ${createdCases} original device-specific cases!`)
  const totalInDb = await Product.countDocuments({})
  console.log(`📊 Total Products in Database Now: ${totalInDb} (including all preserved lifestyle products)`)

  await mongoose.disconnect()
}

if (require.main === module) {
  restore().catch(console.error)
}
