import multer from "multer"
import { ApiError } from "../api/ApiError"

import path from "path"
import fs from "fs"
import { v4 as uuid } from "uuid"

const storage = multer.diskStorage({
  destination: (req: any, file: any, cb: any) => {
    cb(null, path.join(__dirname, "../../public/uploads"))
  },
  filename: (req: any, file: any, cb: any) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
    cb(null, uniqueSuffix + path.extname(file.originalname))
  },
})

const fileFilter = (req: any, file: any, cb: any) => {
  const allowedMimes = ["image/jpeg", "image/jpg", "image/png", "image/webp"]
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new ApiError(400, "Only JPEG, PNG and WebP images are allowed"))
  }
}

export const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter,
})

export async function uploadBuffer(filePath: string, buffer: Buffer, contentType: string): Promise<string> {
  const dir = path.join(__dirname, "../../public/uploads")
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  
  // ensure the path doesn't contain leading slashes that would break join
  const safePath = filePath.replace(/^\/+/, "")
  const fullPath = path.join(dir, safePath)
  
  const fileDir = path.dirname(fullPath)
  if (!fs.existsSync(fileDir)) {
    fs.mkdirSync(fileDir, { recursive: true })
  }

  await fs.promises.writeFile(fullPath, buffer)
  return `/uploads/${safePath}`
}
