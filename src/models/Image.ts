import mongoose, { Schema, Document } from "mongoose"

export interface IImage extends Document {
  filename: string
  contentType: string
  data?: Buffer
  url?: string
  size: number
  uploadedBy?: mongoose.Types.ObjectId
  createdAt: Date
}

const imageSchema = new Schema<IImage>(
  {
    filename: { type: String, required: true },
    contentType: { type: String, required: true },
    data: { type: Buffer },
    url: { type: String },
    size: { type: Number, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

export const Image = mongoose.model<IImage>("Image", imageSchema)
