import express, { Express, Request, Response } from "express"
import dotenv from "dotenv"
import cors from "cors"
import helmet from "helmet"
import morgan from "morgan"
import cookieParser from "cookie-parser"
import rateLimit from "express-rate-limit"

import path from "path"
dotenv.config({ path: path.resolve(__dirname, "../.env") }) // Reload env configuration instantly now

import { connectDB } from "./config/db"
import { errorHandler } from "./middlewares/errorHandler"
import { logger } from "./utils/logger"

// Routes
import authRoutes from "./routes/authRoutes"
import productRoutes from "./routes/productRoutes"
import orderRoutes from "./routes/orderRoutes"
import cartRoutes from "./routes/cartRoutes"
import catalogRoutes from "./routes/catalogRoutes"
import userRoutes from "./routes/userRoutes"
import adminRoutes from "./routes/adminRoutes"
import imageRoutes from "./routes/imageRoutes"
import automationRoutes from "./routes/automationRoutes"
import bannerRoutes from "./routes/bannerRoutes"
import botRoutes from "./routes/botRoutes"

// Initialize background workers
import "./workers/mockupWorker"

// Connect to MongoDB
if (process.env.MONGODB_URI) {
  connectDB()
} else {
  logger.warn("MONGODB_URI not set — skipping database connection")
}

const app: Express = express()
const port = process.env.PORT || 5000

// ── Security ──────────────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }))

app.use(cors({
  origin: (origin, callback) => {
    // Allowed origins: local dev + VPS domains from .env
    const allowed = [
      "http://localhost:5173",   // frontend dev
      "http://localhost:5174",   // admin dev
      process.env.CLIENT_URL,    // frontend VPS (e.g. https://printedsoul.com)
      process.env.ADMIN_URL,     // admin VPS   (e.g. https://admin.printedsoul.com)
    ].filter(Boolean) as string[]

    // Allow server-to-server requests (no origin) and whitelisted origins
    if (!origin || allowed.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error(`CORS: origin '${origin}' not allowed`))
    }
  },
  credentials: true,
}))

// General rate limiter
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, message: "Too many requests" })
app.use("/api", limiter)

// Stricter limiter for auth
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: "Too many auth attempts" })
app.use("/api/auth/login", authLimiter)
app.use("/api/auth/register", authLimiter)

// ── Body Parsing ──────────────────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ extended: true, limit: "10mb" }))
app.use(cookieParser())

// ── Logging ───────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== "test") {
  app.use(morgan("combined", { stream: { write: (msg) => logger.http(msg.trim()) } }))
}

// ── Static Files ──────────────────────────────────────────────────────────
app.use("/uploads", express.static(path.join(__dirname, "../public/uploads")))

// ── Health Check ──────────────────────────────────────────────────────────
app.get("/api/health", (req: Request, res: Response) => {
  res.json({ status: "ok", message: "Printed Soul Store API is running", timestamp: new Date() })
})

// ── API Routes ────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes)
app.use("/api/products", productRoutes)
app.use("/api/orders", orderRoutes)
app.use("/api/cart", cartRoutes)
app.use("/api/catalog", catalogRoutes)
app.use("/api/user", userRoutes)
app.use("/api/admin", adminRoutes)
app.use("/api/admin/automation", automationRoutes)
app.use("/api/images", imageRoutes)
app.use("/api/banners", bannerRoutes)
app.use("/api/bot", botRoutes)

// ── 404 ───────────────────────────────────────────────────────────────────
app.use("*", (req: Request, res: Response) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` })
})

// ── Global Error Handler ──────────────────────────────────────────────────
app.use(errorHandler)

// ── Start Server ──────────────────────────────────────────────────────────
app.listen(port, () => {
  logger.info(`🚀 Printed Soul Store API running on port ${port}`)
  logger.info(`📦 Environment: ${process.env.NODE_ENV || "development"}`)
})

export default app
