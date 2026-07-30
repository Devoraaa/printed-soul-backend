import { Image } from "../models/Image"
import mongoose from "mongoose"

export const imageService = {
  /**
   * Save image buffer to MongoDB
   */
  async saveImage(
    filename: string,
    originalname: string,
    mimetype: string,
    size: number,
    uploadedBy?: string
  ): Promise<string> {
    const image = await Image.create({
      filename: originalname,
      contentType: mimetype,
      url: `/uploads/${filename}`,
      size: size,
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
      const id = await imageService.saveImage(file.filename, file.originalname, file.mimetype, file.size, uploadedBy)
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
