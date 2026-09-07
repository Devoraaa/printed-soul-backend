import { Router, Request, Response } from "express"
import { logger } from "../utils/logger"

const router = Router()

router.post("/", async (req: Request, res: Response) => {
  try {
    const { name, email, subject, message } = req.body
    if (!name || !email || !message) {
      return res.status(400).json({ success: false, message: "Name, email, and message are required." })
    }
    logger.info(`📬 Contact: [${subject || 'General'}] from ${name} <${email}>: ${String(message).substring(0, 100)}`)
    res.json({ success: true, message: "Thank you! We'll get back to you within 24 hours." })
  } catch (error) {
    logger.error("Contact form error:", error)
    res.status(500).json({ success: false, message: "Something went wrong. Please try again." })
  }
})

export default router