/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SHOPIFY → PRINTED SOUL FULL MIGRATION SCRIPT (NGROK OAUTH)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import "dotenv/config"
import axios from "axios"
import mongoose from "mongoose"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import FormData from "form-data"
import express from "express"
import fs from "fs"
import path from "path"
import os from "os"

const SHOPIFY_STORE = process.env.SHOPIFY_STORE || ""
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID || ""
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET || ""
const MONGODB_URI   = process.env.MONGODB_URI   || "mongodb://127.0.0.1:27017/printedsoul"
const BACKEND_URL   = process.env.BACKEND_URL   || "http://localhost:5000"

const NGROK_URL = "https://deluge-defensive-cresting.ngrok-free.dev"

if (!SHOPIFY_STORE || !CLIENT_ID || !CLIENT_SECRET) {
  console.error("❌  Set SHOPIFY_STORE, SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET in .env"); process.exit(1)
}

let shopify: any;
let backend: any;

// ─── MONGOOSE MODELS ──────────────────────────────────────────────────────────
const categorySchema = new mongoose.Schema({ name: String, slug: String, image: String, parent: mongoose.Schema.Types.ObjectId, isProtected: Boolean }, { timestamps: true })
const brandSchema = new mongoose.Schema({ name: String, slug: String, logo: String }, { timestamps: true })
const productSchema = new mongoose.Schema({
  name: String, slug: String, description: String, price: Number, comparePrice: Number,
  images: [String], stock: Number, category: mongoose.Schema.Types.ObjectId, brand: mongoose.Schema.Types.ObjectId,
  tags: [String], isActive: Boolean, ratings: { average: { type: Number, default: 0 }, count: { type: Number, default: 0 } },
  shopifyId: { type: String, sparse: true },
}, { timestamps: true })
const addressSchema = new mongoose.Schema({
  label: { type: String, default: "Home" }, fullName: String, phone: String, street: String,
  city: String, state: String, pincode: String, country: { type: String, default: "India" }, isDefault: { type: Boolean, default: false },
}, { _id: false })
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true }, email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, select: false }, phone: { type: String, default: "0000000000" },
  role: { type: String, enum: ["user","admin","superadmin"], default: "user" }, isVerified: { type: Boolean, default: true },
  shopifyId: { type: String, sparse: true },
}, { timestamps: true })
const savedAddressSchema = new mongoose.Schema({ user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, ...addressSchema.obj }, { timestamps: true })

const Category = mongoose.models.Category || mongoose.model("Category", categorySchema)
const Brand    = mongoose.models.Brand    || mongoose.model("Brand", brandSchema)
const Product  = mongoose.models.Product  || mongoose.model("Product", productSchema)
const User     = mongoose.models.User     || mongoose.model("User", userSchema)
const Address  = mongoose.models.Address  || mongoose.model("Address", savedAddressSchema)

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function slugify(s: string) { return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") }

async function uploadImage(url: string): Promise<string | null> {
  try {
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 30000 })
    const ct  = (res.headers["content-type"] || "image/jpeg") as string
    const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : "jpg"
    const tmp = path.join(os.tmpdir(), `shopify_${Date.now()}.${ext}`)
    fs.writeFileSync(tmp, Buffer.from(res.data))
    const form = new FormData()
    form.append("image", fs.createReadStream(tmp), { filename: `img.${ext}`, contentType: ct })
    const up = await backend.post("/images/upload", form, { headers: form.getHeaders() })
    fs.unlinkSync(tmp)
    return up.data?.data?.id || up.data?.id || null
  } catch (e: any) { return null }
}

async function shopifyGetAll(ep: string, key: string, qs = ""): Promise<any[]> {
  let all: any[] = [], cursor = ""
  do {
    const url = cursor ? `${ep}?limit=250&page_info=${cursor}` : `${ep}?limit=250${qs}`
    const r = await shopify.get(url)
    all = all.concat(r.data[key] || [])
    const m = (r.headers.link || "").match(/<[^>]+page_info=([^&>]+)[^>]*>;\s*rel="next"/)
    cursor = m ? m[1] : ""
  } while (cursor)
  return all
}

// ─── MIGRATION LOGIC ─────────────────────────────────────────────────────────
async function runMigration(accessToken: string) {
  console.log("\n🚀  STARTING MIGRATION PROCESS...")
  
  shopify = axios.create({
    baseURL: `https://${SHOPIFY_STORE}/admin/api/2024-01`,
    headers: { "X-Shopify-Access-Token": accessToken },
  });

  await mongoose.connect(MONGODB_URI)
  
  let adminUser = await User.findOne({ role: { $in: ["admin", "superadmin"] } })
  if (!adminUser) adminUser = await User.create({ name: "Migration Admin", email: "migration@printedsoul.com", password: "temp", role: "admin" })
  const adminToken = jwt.sign({ id: adminUser._id }, process.env.JWT_SECRET || "koi_bhi_secret_key_daal_do", { expiresIn: "1h" })
  
  backend = axios.create({ baseURL: `${BACKEND_URL}/api`, headers: { Authorization: `Bearer ${adminToken}` } })

  // STEP 1: Categories
  console.log("\n📂  Step 1: Importing Collections as Categories...")
  const allCols = [ ...(await shopifyGetAll("/custom_collections", "custom_collections")), ...(await shopifyGetAll("/smart_collections", "smart_collections")) ]
  const colMap: Record<string, mongoose.Types.ObjectId> = {}
  let rootCat = await Category.findOne({ slug: "phone-cover" })
  if (!rootCat) rootCat = await Category.create({ name: "Phone Cover", slug: "phone-cover", isProtected: true })
  
  for (const col of allCols) {
    const slug = slugify(col.title)
    let cat = await Category.findOne({ slug })
    if (!cat) {
      process.stdout.write(`    📸  ${col.title}... `); const imgId = col.image?.src ? await uploadImage(col.image.src) : null; console.log(imgId ? "✅" : "⚠️")
      cat = await Category.create({ name: col.title, slug, image: imgId || undefined, parent: /mobile|case|cover|phone/i.test(col.title) ? rootCat._id : undefined })
    }
    colMap[String(col.id)] = cat._id
  }

  // STEP 2: Products
  console.log("\n🛍️   Step 2: Importing Products...")
  const prodColMap: Record<string, mongoose.Types.ObjectId> = {}
  for (const col of allCols) {
    if (!colMap[String(col.id)]) continue
    try {
      const ps = await shopifyGetAll(`/collections/${col.id}/products`, "products")
      ps.forEach((p: any) => { if (!prodColMap[String(p.id)]) prodColMap[String(p.id)] = colMap[String(col.id)] })
    } catch {}
  }

  const prods = await shopifyGetAll("/products", "products", "&status=active")
  let pOk = 0, pSkip = 0, pFail = 0
  for (let i = 0; i < prods.length; i++) {
    const sp = prods[i]
    process.stdout.write(`    [${String(i+1).padStart(3," ")}/${prods.length}] ${sp.title.slice(0,50).padEnd(52)}`)
    if (await Product.findOne({ shopifyId: String(sp.id) })) { console.log("↩️  skip"); pSkip++; continue }
    try {
      const v = sp.variants?.[0]
      const price = parseFloat(v?.price || "0"), cmpPrc = parseFloat(v?.compare_at_price || "0")
      const imgIds: string[] = []
      for (const img of (sp.images || []).slice(0, 8)) { const id = await uploadImage(img.src); if (id) imgIds.push(id) }
      let brandId: mongoose.Types.ObjectId | undefined
      if (sp.vendor && !["Printed Soul Store","Default Vendor",""].includes(sp.vendor)) {
        let b = await Brand.findOne({ name: sp.vendor }); if (!b) b = await Brand.create({ name: sp.vendor, slug: slugify(sp.vendor) }); brandId = b._id
      }
      let slug = slugify(sp.title)
      const cnt = await Product.countDocuments({ slug: { $regex: `^${slug}(-\\d+)?$` } })
      if (cnt) slug = `${slug}-${cnt + 1}`
      await Product.create({
        shopifyId: String(sp.id), name: sp.title, slug, description: (sp.body_html || "").replace(/<[^>]*>/g, "").trim(),
        price, comparePrice: cmpPrc > price ? cmpPrc : undefined, images: imgIds,
        stock: Math.max(sp.variants?.reduce((s: number, v2: any) => s + Math.max(parseInt(v2.inventory_quantity || "0"), 0), 0) || 0, 10),
        category: prodColMap[String(sp.id)] || rootCat?._id, brand: brandId, tags: (sp.tags || "").split(",").map((t: string) => t.trim()).filter(Boolean),
        isActive: sp.status === "active", ratings: { average: 0, count: 0 }
      }); console.log(`✅  ₹${price}`); pOk++
    } catch (e: any) { console.log(`❌  failed`); pFail++ }
  }

  // STEP 3: Customers
  console.log("\n👥  Step 3: Importing Customers...")
  const customers = await shopifyGetAll("/customers", "customers")
  const defaultPass = await bcrypt.hash("PrintedSoul@2025", 10)
  let cOk = 0, cSkip = 0, cFail = 0
  for (let i = 0; i < customers.length; i++) {
    const sc = customers[i]
    process.stdout.write(`    [${String(i+1).padStart(3," ")}/${customers.length}] ${(sc.email || "no-email").slice(0,45).padEnd(47)}`)
    if (!sc.email) { console.log("⚠️  no email"); cSkip++; continue }
    if (await User.findOne({ $or: [{ email: sc.email }, { shopifyId: String(sc.id) }] })) { console.log("↩️  exists"); cSkip++; continue }
    try {
      const phone = (sc.phone || sc.addresses?.[0]?.phone || "").replace(/\D/g, "").slice(-10) || "0000000000"
      const user = await User.create({
        shopifyId: String(sc.id), name: `${sc.first_name || ""} ${sc.last_name || ""}`.trim() || "Customer",
        email: sc.email.toLowerCase(), phone: phone || "0000000000", password: defaultPass, role: "user", isVerified: sc.verified_email || false,
      })
      if (sc.addresses?.length > 0) {
        await Address.insertMany(sc.addresses.slice(0, 5).map((a: any, idx: number) => ({
          user: user._id, label: a.address_type || (idx === 0 ? "Home" : "Other"),
          fullName: `${a.first_name || ""} ${a.last_name || ""}`.trim() || user.name, phone: (a.phone || phone).replace(/\D/g, "").slice(-10) || "0000000000",
          street: `${a.address1 || ""} ${a.address2 || ""}`.trim() || "Address", city: a.city || "Mumbai", state: a.province || "Maharashtra",
          pincode: (a.zip || "400001").replace(/\D/g, "") || "400001", country: "India", isDefault: idx === 0,
        })), { ordered: false })
      }
      console.log(`✅  ${user.name}`); cOk++
    } catch (e: any) { console.log(`❌  failed`); cFail++ }
  }

  console.log("\n" + "═".repeat(65) + "\n🎉  MIGRATION COMPLETE!\n" + "─".repeat(65))
  console.log(`    Products  → ✅ ${pOk} created | ↩️  ${pSkip} skipped | ❌ ${pFail} failed`)
  console.log(`    Customers → ✅ ${cOk} created | ↩️  ${cSkip} skipped | ❌ ${cFail} failed`)
  console.log("─".repeat(65) + "\n    ⚠️  Imported customers password: PrintedSoul@2025\n" + "═".repeat(65))
  
  process.exit(0)
}

// ─── LOCAL OAUTH SERVER ───────────────────────────────────────────────────────
const app = express()
const PORT = 3000

app.get("/login", (req, res) => {
  const scopes = "read_products,read_product_listings,read_inventory,read_customers"
  const redirectUri = `${NGROK_URL}/callback`
  const url = `https://${SHOPIFY_STORE}/admin/oauth/authorize?client_id=${CLIENT_ID}&scope=${scopes}&redirect_uri=${redirectUri}`
  res.redirect(url)
})

app.get("/callback", async (req, res) => {
  const code = req.query.code as string
  if (!code) return res.send("❌ Error: No code provided")
  
  try {
    const tokenRes = await axios.post(`https://${SHOPIFY_STORE}/admin/oauth/access_token`, {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code
    })
    
    res.send(`
      <div style="font-family:sans-serif; text-align:center; padding-top:50px;">
        <h1 style="color: #4CAF50;">✅ App Installed Successfully!</h1>
        <p>The migration has started in your terminal. You can close this window now.</p>
      </div>
    `)
    
    console.log("✅  Access Token Generated!")
    runMigration(tokenRes.data.access_token)
  } catch (err: any) {
    res.send("❌ Failed to get access token: " + (err.response?.data?.error_description || err.message))
  }
})

app.listen(PORT, () => {
  console.log("═".repeat(65))
  console.log("🚨 ALMOST THERE! Bas yahi last step hai:")
  console.log("═".repeat(65))
  console.log("Ek naya tab open karo browser mein aur yeh url open karo:")
  console.log(`\n    ${NGROK_URL}/login\n`)
  console.log("Install App click karne ke baad migration shuru ho jayega!")
  console.log("═".repeat(65))
})
