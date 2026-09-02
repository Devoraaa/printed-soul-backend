import mongoose from "mongoose"
import dotenv from "dotenv"
import path from "path"

// Load env
dotenv.config({ path: path.join(__dirname, "../.env") })

import { Category } from "../src/models/Category"
import { Brand } from "../src/models/Brand"
import { DeviceModel } from "../src/models/DeviceModel"
import { Product } from "../src/models/Product"

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/printedsoul"

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")

async function seed() {
  console.log("🚀 Connecting to DB...")
  await mongoose.connect(MONGODB_URI)

  console.log("🧹 Wiping old catalog data...")
  // Only wiping catalog, not users/orders/etc to be safe
  await Category.deleteMany({})
  await Brand.deleteMany({})
  await DeviceModel.deleteMany({})
  await Product.deleteMany({})

  console.log("📁 Creating Categories...")
  // Root Categories
  const coversCat = await Category.create({ name: "Covers", slug: "covers", sortOrder: 1 })
  const framesCat = await Category.create({ name: "Frames", slug: "frames", sortOrder: 2 })
  const mugsCat = await Category.create({ name: "Mugs", slug: "mugs", sortOrder: 3 })
  const tumblersCat = await Category.create({ name: "Tumblers", slug: "tumblers", sortOrder: 4 })

  // Sub Categories
  const dualCaseCat = await Category.create({ name: "Dual Case", slug: "dual-case", parentCategory: coversCat._id })
  const metalCaseCat = await Category.create({ name: "Metal Case", slug: "metal-case", parentCategory: coversCat._id })
  const glassCaseCat = await Category.create({ name: "Glass Case", slug: "glass-case", parentCategory: coversCat._id })

  console.log("🏷️ Creating Brands...")
  const bApple = await Brand.create({ name: "Apple", slug: "apple" })
  const bSamsung = await Brand.create({ name: "Samsung", slug: "samsung" })
  const bVivo = await Brand.create({ name: "Vivo", slug: "vivo" })
  const bOppo = await Brand.create({ name: "Oppo", slug: "oppo" })
  const bXiaomi = await Brand.create({ name: "Xiaomi", slug: "xiaomi" })

  console.log("📱 Creating Device Models...")
  const createModel = async (brand: any, displayName: string, name: string) => 
    DeviceModel.create({ brand: brand._id, name, slug: slugify(`${brand.name} ${name}`), displayName })

  const dIphone15 = await createModel(bApple, "iPhone 15", "iphone-15")
  const dIphone16 = await createModel(bApple, "iPhone 16", "iphone-16")
  const dIphone17 = await createModel(bApple, "iPhone 17", "iphone-17")
  
  const dS22U = await createModel(bSamsung, "S22 Ultra", "s22-ultra")
  const dS23U = await createModel(bSamsung, "S23 Ultra", "s23-ultra")
  const dS24U = await createModel(bSamsung, "S24 Ultra", "s24-ultra")
  const dS24 = await createModel(bSamsung, "S24", "s24") // Normal S24 for testing
  
  const dV29 = await createModel(bVivo, "V29", "v29")
  const dV30 = await createModel(bVivo, "V30", "v30")
  const dX100 = await createModel(bVivo, "X100", "x100")
  
  const dReno10 = await createModel(bOppo, "Reno 10", "reno-10")
  const dMi14 = await createModel(bXiaomi, "14 Pro", "14-pro")

  // Groupings based on rules
  const allModels = [dIphone15, dIphone16, dIphone17, dS22U, dS23U, dS24U, dS24, dV29, dV30, dX100, dReno10, dMi14]
  
  // Dual Case Rule: ONLY iPhone and Samsung S Series ULTRA
  const dualCaseModels = [dIphone15, dIphone16, dIphone17, dS22U, dS23U, dS24U]
  
  // Metal/Glass Case Rule: ALL models
  const allCaseModels = allModels

  console.log("🎨 Creating Dummy Products...")
  const createProduct = async (title: string, designSlug: string, cat: any, caseType: string, models: any[], price: number, brand?: any) => {
    return Product.create({
      name: title,
      slug: slugify(`${title}-${caseType}-${Math.random().toString(36).substring(2,6)}`),
      designSlug,
      caseType,
      category: cat._id,
      brand: brand ? brand._id : undefined,
      description: `Premium dummy product for ${title}. Showcasing the amazing ${caseType} quality.`,
      price,
      comparePrice: price + 400,
      stock: 100,
      sku: `DUMMY-${Math.random().toString(36).substring(2,8).toUpperCase()}`,
      deviceModels: models.map(m => m._id),
      status: "active",
      isActive: true,
      isDeleted: false
    })
  }

  // Cover Designs
  const coverDesigns = [
    { name: "Batman Dark Knight", slug: "batman-dark-knight" },
    { name: "Spiderman Miles", slug: "spiderman-miles" },
    { name: "Abstract Ocean", slug: "abstract-ocean" }
  ]

  const brands = [bApple, bSamsung, bVivo, bOppo, bXiaomi]
  const brandModels = {
    "Apple": [dIphone15, dIphone16, dIphone17],
    "Samsung": [dS22U, dS23U, dS24U, dS24],
    "Vivo": [dV29, dV30, dX100],
    "Oppo": [dReno10],
    "Xiaomi": [dMi14]
  }

  for (const design of coverDesigns) {
    for (const brand of brands) {
      const modelsForBrand = brandModels[brand.name as keyof typeof brandModels]
      
      for (const model of modelsForBrand) {
        // Dual Case Rule: ONLY Apple and Samsung S Series Ultra
        const isDualCaseEligible = (brand.name === "Apple" && model.name.toLowerCase().includes("iphone")) || 
                                   (brand.name === "Samsung" && model.name.toLowerCase().includes("ultra"))

        if (isDualCaseEligible) {
          await createProduct(`${brand.name} ${model.displayName} ${design.name} Dual Case`, design.slug, dualCaseCat, "dual-case", [model], 799, brand)
        }
        
        // Metal Case Variant (All Models)
        await createProduct(`${brand.name} ${model.displayName} ${design.name} Metal Case`, design.slug, metalCaseCat, "metal-case", [model], 899, brand)
        
        // Glass Case Variant (All Models)
        await createProduct(`${brand.name} ${model.displayName} ${design.name} Glass Case`, design.slug, glassCaseCat, "glass-case", [model], 999, brand)
      }
    }
  }

  // Other Category Products
  await createProduct("Family Memory Frame", "family-memory-frame", framesCat, "frame", [], 1299)
  await createProduct("Goku Coffee Mug", "goku-coffee-mug", mugsCat, "mug", [], 399)
  await createProduct("Neon Vibes Tumbler", "neon-vibes-tumbler", tumblersCat, "tumbler", [], 1499)

  console.log("✅ All dummy data created successfully!")
  process.exit(0)
}

seed().catch(e => {
  console.error("❌ Seeding Failed:", e)
  process.exit(1)
})
