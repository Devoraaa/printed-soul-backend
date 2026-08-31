import express from "express"
import { upload } from "../utils/upload"
import { Queue } from "bullmq"
import { Design } from "../models/Design"
import { Product } from "../models/Product"
import { protect, authorize } from "../middlewares/authMiddleware"

const router = express.Router()

const connection = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: parseInt(process.env.REDIS_PORT || "6379", 10),
}
const mockupQueue = new Queue("mockup-generation", { connection })

router.use(protect)
router.use(authorize("admin", "superadmin"))

router.post("/templates/upload", upload.single("template"), (req: any, res: any) => {
  if (!req.file) return res.status(400).json({ error: "template image is required" })
  const imageUrl = `/uploads/${req.file.filename}`
  res.json({ url: imageUrl })
})

router.post("/designs", upload.single("design"), async (req: any, res: any) => {
  try {
    const { title, categoryId, phoneModelIds, price, comparePrice, stock, description, caseType } = req.body
    const modelIds = JSON.parse(phoneModelIds || "[]")

    if (!req.file) return res.status(400).json({ error: "design image is required" })
    if (modelIds.length === 0) return res.status(400).json({ error: "select at least one phone model" })

    const filename = req.file.filename
    const imageUrl = `/uploads/${filename}`

    // ── Auto-resolve category ────────────────────────────────────────────────
    // Map caseType → friendly category name
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
    }
    const { Category } = await import("../models/Category")
    const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")

    let resolvedCategoryId = (categoryId && categoryId !== "null" && categoryId !== "undefined") ? categoryId : null

    async function getOrCreateCategory(name: string, slug: string) {
      // 1. Try to find active category
      let c = await Category.findOne({ slug })
      
      // 2. Try to find soft-deleted category (plugin requires exact true match to bypass)
      if (!c) {
        c = await Category.findOne({ slug, isDeleted: true })
        if (c) {
          // Restore it
          ;(c as any).isDeleted = false
          ;(c as any).deletedAt = null
          await c.save()
        }
      }
      
      // 3. Create if completely missing
      if (!c) {
        c = await Category.create({ name, slug, isActive: true })
      }
      return c._id.toString()
    }

    if (!resolvedCategoryId && caseType && CASE_TYPE_CATEGORY[caseType]) {
      const catName = CASE_TYPE_CATEGORY[caseType]
      resolvedCategoryId = await getOrCreateCategory(catName, slugify(catName))
    }

    if (!resolvedCategoryId) {
      resolvedCategoryId = await getOrCreateCategory("Phone Cover", "phone-cover")
    }

    // ── Build designSlug from title ─────────────────────────────────────────
    const designSlug = slugify(title)

    // ── Build full product title (design + case type label) ─────────────────
    const caseLabel = caseType ? CASE_TYPE_CATEGORY[caseType] : ""
    const fullTitle = caseLabel ? `${title} - ${caseLabel}` : title

    const design = await Design.create({
      title: fullTitle,
      imageUrl,
      categoryId: resolvedCategoryId,
      totalModels: modelIds.length,
      status: "processing",
    })

    // ── Queue jobs — pass all per-product data ──────────────────────────────
    const jobExtras: any = { designSlug, caseType: caseType || "hard-case" }
    if (price)        jobExtras.price = parseFloat(price)
    if (comparePrice) jobExtras.comparePrice = parseFloat(comparePrice)
    if (stock)        jobExtras.stock = parseInt(stock)
    if (description)  jobExtras.description = description

    await mockupQueue.addBulk(
      modelIds.map((phoneModelId: string) => ({
        name: "generate-mockup",
        data: { designId: design._id.toString(), phoneModelId, ...jobExtras },
      }))
    )

    res.status(201).json(design)
  } catch (err: any) {
    console.error("Automation Route Error:", err)
    res.status(500).json({ message: err.message || "Failed to create design job" })
  }
})


router.post("/designs/:id/add-models", async (req: any, res: any) => {
  try {
    const { id } = req.params
    const { phoneModelIds } = req.body

    // Find models we already generated for this design
    const existing = await Product.find({ "title": { $regex: id } }) // This is a bit hacky, normally you'd query by a designId on Product
    // Let's add designId to Product model eventually, but for now we just push the jobs
    // To properly skip, we need to know what models exist. Let's just queue them all for now or rely on UPSERT.
    
    // Instead of querying Product, we can just upsert.
    const newModelIds = phoneModelIds

    if (newModelIds.length === 0) {
      return res.json({ message: "No new models to generate", added: 0 })
    }

    await Design.findByIdAndUpdate(id, { $inc: { totalModels: newModelIds.length }, status: "processing" })
    await mockupQueue.addBulk(
      newModelIds.map((phoneModelId: string) => ({
        name: "generate-mockup",
        data: { designId: id, phoneModelId },
      }))
    )

    res.json({ message: "Jobs queued", added: newModelIds.length })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "Failed to queue new models" })
  }
})

router.get("/designs/:id/status", async (req: any, res: any) => {
  try {
    const design = await Design.findById(req.params.id)
    if (!design) return res.status(404).json({ error: "Not found" })
    res.json({
      status: design.status,
      generatedCount: design.generatedCount,
      failedCount: design.failedCount,
      totalModels: design.totalModels,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "Failed to get status" })
  }
})

export default router
