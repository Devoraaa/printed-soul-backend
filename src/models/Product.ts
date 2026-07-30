import mongoose, { Schema, Document } from "mongoose"
import { softDeletePlugin } from "../utils/softDelete"

export interface IProduct extends Document {
  name: string
  slug: string
  description: string
  shortDescription?: string
  sku: string
  price: number
  comparePrice?: number
  category: mongoose.Types.ObjectId
  brand: mongoose.Types.ObjectId
  deviceModels: mongoose.Types.ObjectId[]
  images: mongoose.Types.ObjectId[]
  stock: number
  lowStockThreshold: number
  status: "draft" | "active" | "archived"
  isActive: boolean
  isFeatured: boolean
  tags: string[]
  ratings: { average: number; count: number }
  weight?: number
  priority: number
  createdAt: Date
  updatedAt: Date
}

const productSchema = new Schema<IProduct>(
  {
    name: { type: String, required: [true, "Product name is required"], trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    description: { type: String, required: [true, "Description is required"] },
    shortDescription: { type: String },
    sku: { type: String, required: true, unique: true, uppercase: true },
    price: { type: Number, required: [true, "Price is required"], min: 0 },
    comparePrice: { type: Number, min: 0 },
    category: { type: Schema.Types.ObjectId, ref: "Category", required: true },
    brand: { type: Schema.Types.ObjectId, ref: "Brand", required: false },
    deviceModels: [{ type: Schema.Types.ObjectId, ref: "DeviceModel" }],
    images: [{ type: Schema.Types.ObjectId, ref: "Image" }],
    stock: { type: Number, required: true, default: 0, min: 0 },
    lowStockThreshold: { type: Number, default: 5 },
    status: { type: String, enum: ["draft", "active", "archived"], default: "active", index: true },
    isActive: { type: Boolean, default: true, index: true },
    isFeatured: { type: Boolean, default: false },
    tags: [{ type: String, lowercase: true }],
    ratings: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      count: { type: Number, default: 0 },
    },
    weight: { type: Number },
    priority: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
)

// Indexes for search performance
productSchema.index({ name: "text", description: "text", tags: "text" })
productSchema.index({ category: 1, brand: 1 })
productSchema.index({ deviceModels: 1 })
productSchema.index({ price: 1 })

productSchema.plugin(softDeletePlugin)

export const Product = mongoose.model<IProduct>("Product", productSchema)
