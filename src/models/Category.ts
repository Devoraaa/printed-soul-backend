import mongoose, { Schema, Document } from "mongoose"
import { softDeletePlugin } from "../utils/softDelete"

export interface ICategory extends Document {
  name: string
  slug: string
  description?: string
  image?: mongoose.Types.ObjectId
  parentCategory?: mongoose.Types.ObjectId
  isActive: boolean
  isProtected: boolean   // If true, this category cannot be deleted
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}

const categorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: [true, "Category name is required"], trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    description: { type: String },
    image: { type: Schema.Types.ObjectId, ref: "Image" },
    parentCategory: { type: Schema.Types.ObjectId, ref: "Category", default: null },
    isActive: { type: Boolean, default: true },
    isProtected: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
)

categorySchema.plugin(softDeletePlugin)

export const Category = mongoose.model<ICategory>("Category", categorySchema)
