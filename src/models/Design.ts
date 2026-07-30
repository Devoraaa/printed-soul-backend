import mongoose, { Schema, Document } from "mongoose"

export interface IDesign extends Document {
  title: string
  categoryId?: mongoose.Types.ObjectId
  imageUrl: string
  totalModels: number
  generatedCount: number
  failedCount: number
  status: "processing" | "done" | "partial_failure"
  createdAt: Date
  updatedAt: Date
}

const designSchema = new Schema<IDesign>(
  {
    title: { type: String, required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: "Category" },
    imageUrl: { type: String, required: true },
    totalModels: { type: Number, default: 0 },
    generatedCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    status: { type: String, enum: ["processing", "done", "partial_failure"], default: "processing" },
  },
  { timestamps: true }
)

export const Design = mongoose.model<IDesign>("Design", designSchema)
