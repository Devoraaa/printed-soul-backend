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
    const { title, categoryId, phoneModelIds } = req.body
    const modelIds = JSON.parse(phoneModelIds || "[]")

    if (!req.file) return res.status(400).json({ error: "design image is required" })
    if (modelIds.length === 0) return res.status(400).json({ error: "select at least one phone model" })

    // If using multer.diskStorage, req.file.path exists, but we want a relative URL
    // Actually our upload middleware saves it to public/uploads and we need to strip 'public'
    const filename = req.file.filename
    const imageUrl = `/uploads/${filename}`

    const design = await Design.create({
      title,
      categoryId,
      imageUrl,
      totalModels: modelIds.length,
      status: "processing",
    })

    await mockupQueue.addBulk(
      modelIds.map((phoneModelId: string) => ({
        name: "generate-mockup",
        data: { designId: design._id.toString(), phoneModelId },
      }))
    )

    res.status(201).json(design)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "Failed to create design job" })
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
