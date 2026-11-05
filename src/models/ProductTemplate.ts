import mongoose, { Schema, Document } from "mongoose"

export interface IProductTemplate extends Document {
  category: mongoose.Types.ObjectId
  name: string
  slug: string
  displayName: string
  isActive: boolean
  basePrice?: number
  comparePrice?: number
  description?: string
  templates?: {
    id: string
    name: string
    templateImageUrl: string
    overlayImageUrl?: string
    blendMode?: string
    printArea?: { x: number; y: number; width: number; height: number; borderRadius?: number }
    cameraArea?: { x: number; y: number; width: number; height: number; borderRadius?: number }
  }[]
  createdAt: Date
  updatedAt: Date
}

const productTemplateSchema = new Schema<IProductTemplate>(
  {
    category: { type: Schema.Types.ObjectId, ref: "Category", required: [true, "Category is required"] },
    name: { type: String, required: [true, "Product model/size name is required"], trim: true },
    slug: { type: String, required: true, lowercase: true },
    displayName: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    basePrice: { type: Number, default: 499 },
    comparePrice: { type: Number, default: 999 },
    description: { type: String, default: "" },
    templates: [
      {
        id: { type: String, required: true },
        name: { type: String, required: true },
        templateImageUrl: { type: String, required: true },
        overlayImageUrl: { type: String },
        blendMode: { type: String, default: "over" },
        printArea: {
          x: { type: Number },
          y: { type: Number },
          width: { type: Number },
          height: { type: Number },
          borderRadius: { type: Number, default: 0 },
        },
        cameraArea: {
          x: { type: Number },
          y: { type: Number },
          width: { type: Number },
          height: { type: Number },
          borderRadius: { type: Number, default: 0 },
        },
      },
    ],
  },
  { timestamps: true }
)

productTemplateSchema.index({ category: 1, slug: 1 })

export const ProductTemplate = mongoose.model<IProductTemplate>("ProductTemplate", productTemplateSchema)
