import mongoose, { Schema, Document } from "mongoose"
import { softDeletePlugin } from "../utils/softDelete"

export interface IBrand extends Document {
  name: string
  slug: string
  logo?: mongoose.Types.ObjectId
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const brandSchema = new Schema<IBrand>(
  {
    name: { type: String, required: [true, "Brand name is required"], trim: true, unique: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    logo: { type: Schema.Types.ObjectId, ref: "Image" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
)

brandSchema.plugin(softDeletePlugin)

export const Brand = mongoose.model<IBrand>("Brand", brandSchema)
