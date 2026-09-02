/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SHOPIFY CSV → PRINTED SOUL MIGRATION SCRIPT (WITH SMART CATEGORIES)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import "dotenv/config"
import fs from "fs"
import path from "path"
import os from "os"
import csvParser from "csv-parser"
import mongoose from "mongoose"
import axios from "axios"
import FormData from "form-data"
import jwt from "jsonwebtoken"
import { parseProductName } from "../src/utils/productNameParser"

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/printedsoul"
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000/api"
const JWT_SECRET  = process.env.JWT_SECRET || "koi_bhi_secret_key_daal_do"

// ─── MONGOOSE MODELS ──────────────────────────────────────────────────────────
const categorySchema = new mongoose.Schema({ name: String, slug: String, image: String, parent: mongoose.Schema.Types.ObjectId, isProtected: Boolean }, { timestamps: true })
const brandSchema = new mongoose.Schema({ name: String, slug: String, logo: String }, { timestamps: true })
const productSchema = new mongoose.Schema({
  name: String, slug: String, description: String, price: Number, comparePrice: Number, sku: { type: String, default: () => Math.random().toString(36).substring(2, 10).toUpperCase() },
  images: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Image' }], stock: Number, category: mongoose.Schema.Types.ObjectId, brand: mongoose.Schema.Types.ObjectId,
  deviceModels: [{ type: mongoose.Schema.Types.ObjectId, ref: 'DeviceModel' }],
  tags: [String], isActive: Boolean, ratings: { average: { type: Number, default: 0 }, count: { type: Number, default: 0 } },
  shopifyId: { type: String, sparse: true },
  isDeleted: { type: Boolean, default: false },
  status: { type: String, default: "active" }
}, { timestamps: true })
const userSchema = new mongoose.Schema({
  name: { type: String, required: true }, email: { type: String, required: true },
  password: { type: String, select: false }, phone: { type: String, default: "0000000000" },
  role: { type: String, default: "user" }, isVerified: { type: Boolean, default: true },
}, { timestamps: true })
const deviceModelSchema = new mongoose.Schema({
  brand: { type: mongoose.Schema.Types.ObjectId, ref: "Brand" },
  name: String, slug: String, displayName: String, isActive: { type: Boolean, default: true }
}, { timestamps: true })

const Category = mongoose.models.Category || mongoose.model("Category", categorySchema)
const Brand    = mongoose.models.Brand    || mongoose.model("Brand", brandSchema)
const Product  = mongoose.models.Product  || mongoose.model("Product", productSchema)
const User     = mongoose.models.User     || mongoose.model("User", userSchema)
const DeviceModel = mongoose.models.DeviceModel || mongoose.model("DeviceModel", deviceModelSchema)

function slugify(s: string) { return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") }

async function readCSV(filePath: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const results: any[] = []
    fs.createReadStream(filePath).pipe(csvParser())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (err) => reject(err))
  })
}

async function uploadImage(url: string, token: string): Promise<string | null> {
  try {
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 30000 })
    const ct  = (res.headers["content-type"] || "image/jpeg") as string
    const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : "jpg"
    const tmp = path.join(os.tmpdir(), `shopify_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`)
    fs.writeFileSync(tmp, Buffer.from(res.data))
    const form = new FormData()
    form.append("image", fs.createReadStream(tmp), { filename: `img.${ext}`, contentType: ct })
    const up = await axios.post(`${BACKEND_URL}/images/upload`, form, { headers: { ...form.getHeaders(), Authorization: `Bearer ${token}` } })
    fs.unlinkSync(tmp)
    return up.data?.data?.id || up.data?.id || null
  } catch (e: any) { return null }
}

// caseType → human-readable category name
const CASE_TYPE_CATEGORY: Record<string, string> = {
  "dual-case":   "Dual Case",
  "metal-case":  "Metal Case",
  "glass-case":  "Glass Case",
  "hard-case":   "Hard Case",
  "soft-case":   "Soft Case",
  "wallet-case": "Wallet Case",
  "frame":       "Frames & Art",
  "tumbler":     "Tumblers",
  "mug":         "Mugs",
  "other":       "Other Accessories",
}

async function run() {
  console.log("\n🚀 STARTING SMART CSV MIGRATION...")
  await mongoose.connect(MONGODB_URI)
  
  let adminUser = await User.findOne({ role: { $in: ["admin", "superadmin"] } })
  if (!adminUser) adminUser = await User.create({ name: "Admin", email: "admin@printedsoul.com", password: "temp", role: "admin" })
  const adminToken = jwt.sign({ id: adminUser._id }, JWT_SECRET, { expiresIn: "1h" })

  const rootDir = path.join(__dirname, "../../")
  const files = fs.readdirSync(rootDir).filter(f => f.startsWith("products_export") && f.endsWith(".csv")).map(f => path.join(rootDir, f))
  
  if (files.length === 0) { console.error("❌ Koi CSV file nahi mili root folder mein!"); process.exit(1) }
  
  console.log(`📂 Found ${files.length} CSV file(s). Reading data...`)
  const productsByHandle: Record<string, any> = {}
  
  for (const file of files) {
    const rows = await readCSV(file)
    for (const row of rows) {
      const handle = row['Handle']
      if (!handle) continue

      if (!productsByHandle[handle]) {
        productsByHandle[handle] = {
          handle, title: row['Title'], description: row['Body (HTML)'] || '', vendor: row['Vendor'] || 'Printed Soul',
          tags: row['Tags'] ? row['Tags'].split(',').map((t: string) => t.trim()) : [],
          status: row['Status'] || (row['Published'] === 'true' ? 'active' : 'draft'),
          price: parseFloat(row['Variant Price']) || 499,
          comparePrice: parseFloat(row['Variant Compare At Price']) || undefined,
          images: [], totalStock: 0
        }
      }

      if (row['Image Src']) productsByHandle[handle].images.push({ src: row['Image Src'], pos: parseInt(row['Image Position']) || 1 })
      if (row['Title']) productsByHandle[handle].totalStock += parseInt(row['Variant Inventory Qty']) || 10
    }
  }

  const handles = Object.keys(productsByHandle)
  console.log(`🛍️ Found ${handles.length} unique products. Processing...`)

  // Pre-fetch all device models to auto-link mobile covers
  const allDeviceModels = await DeviceModel.find({}, '_id')
  const allDeviceModelIds = allDeviceModels.map(d => d._id)

  let pOk = 0, pFail = 0
  for (let i = 0; i < handles.length; i++) {
    const pData = productsByHandle[handles[i]]
    if (!pData.title) continue

    process.stdout.write(`   [${i+1}/${handles.length}] ${pData.title.slice(0,40).padEnd(42)} `)

    // Use the SAME parser as the admin/backend — ensures identical designSlug + caseType
    const parsed = parseProductName(pData.title)
    const slug = slugify(pData.title)

    if (await Product.findOne({ slug })) { console.log("↩️ skip"); continue }

    try {
      // 1. Category from caseType
      const categoryName = CASE_TYPE_CATEGORY[parsed.caseType] || "Other Accessories"
      let cat = await Category.findOne({ slug: slugify(categoryName) })
      if (!cat) cat = await Category.create({ name: categoryName, slug: slugify(categoryName) })

      // 2. Assign device models ONLY for mobile cases
      const assignedDeviceModels = parsed.isMobileCase ? allDeviceModelIds : []

      // 3. Download Images
      const imgIds: string[] = []
      const sortedImgs = pData.images.sort((a: any, b: any) => a.pos - b.pos).slice(0, 5)
      for (const img of sortedImgs) { const id = await uploadImage(img.src, adminToken); if (id) imgIds.push(id) }

      // 4. Save Product with designSlug + caseType
      let prodBrand = await Brand.findOne({ slug: slugify(pData.vendor) })
      if (!prodBrand) prodBrand = await Brand.create({ name: pData.vendor, slug: slugify(pData.vendor) })

      await Product.create({
        name: pData.title, slug, description: (pData.description || "").replace(/<[^>]*>/g, "").trim() || "Amazing product",
        price: pData.price, comparePrice: pData.comparePrice > pData.price ? pData.comparePrice : undefined,
        images: imgIds, stock: Math.max(pData.totalStock, 10),
        category: cat._id, brand: prodBrand._id, deviceModels: assignedDeviceModels,
        tags: pData.tags, isActive: pData.status === 'active',
        designSlug: parsed.designSlug,
        caseType: parsed.caseType,
      })
      console.log(`✅ [${categoryName}] | design: ${parsed.designSlug}`)
      pOk++
    } catch (e: any) {
      console.log(`❌ ${e.message?.slice(0, 50)}`)
      pFail++
    }
  }

  console.log("\n🎉 MIGRATION COMPLETE!")
  console.log(`✅ Created: ${pOk} | ❌ Failed: ${pFail}`)
  process.exit(0)
}

run().catch(e => { console.error("\n💥 Fatal:", e); process.exit(1) })
