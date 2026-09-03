import { Image } from "../models/Image"
import mongoose from "mongoose"
import path from "path"
import fs from "fs"
import sharp from "sharp"

const uploadDir = path.join(__dirname, "../../public/uploads")

export const imageService = {
  /**
   * Save image buffer/file and guarantee WebP optimization
   */
  async saveImage(
    filename: string,
    originalname: string,
    mimetype: string,
    size: number,
    uploadedBy?: string
  ): Promise<string> {
    let finalFilename = filename
    let finalMimetype = mimetype
    let finalSize = size

    // If filename is not WebP, check if file exists on disk and convert to WebP
    if (!filename.toLowerCase().endsWith(".webp")) {
      const diskPath = path.join(uploadDir, filename)
      if (fs.existsSync(diskPath)) {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
        const webpFilename = `${uniqueSuffix}.webp`
        const targetPath = path.join(uploadDir, webpFilename)

        try {
          const info = await sharp(diskPath)
            .rotate()
            .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
            .webp({ quality: 85, effort: 5, smartSubsample: true })
            .toFile(targetPath)

          // Delete raw temporary file
          try {
            await fs.promises.unlink(diskPath)
          } catch {}

          finalFilename = webpFilename
          finalMimetype = "image/webp"
          finalSize = info.size
        } catch (err) {
          console.error("imageService: failed to convert to WebP", err)
        }
      }
    }

    const image = await Image.create({
      filename: originalname.replace(/\.[^/.]+$/, "") + ".webp",
      contentType: finalMimetype,
      url: `/uploads/${finalFilename}`,
      size: finalSize,
      uploadedBy: uploadedBy ? new mongoose.Types.ObjectId(uploadedBy) : undefined,
    })
    return image._id.toString()
  },

  /**
   * Save multiple images
   */
  async saveImages(
    files: Express.Multer.File[],
    uploadedBy?: string
  ): Promise<string[]> {
    const ids: string[] = []
    for (const file of files) {
      const id = await imageService.saveImage(
        file.filename,
        file.originalname,
        file.mimetype,
        file.size,
        uploadedBy
      )
      ids.push(id)
    }
    return ids
  },

  /**
   * Delete image by ID
   */
  async deleteImage(imageId: string): Promise<void> {
    await Image.findByIdAndDelete(imageId)
  },

  /**
   * Delete multiple images
   */
  async deleteImages(imageIds: string[]): Promise<void> {
    await Image.deleteMany({ _id: { $in: imageIds } })
  },
}
