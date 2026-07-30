import mongoose, { Schema, Document } from "mongoose"
import { softDeletePlugin } from "../utils/softDelete"

export interface IDeviceModel extends Document {
  brand: mongoose.Types.ObjectId
  name: string
  slug: string
  displayName: string
  isActive: boolean
  releaseYear?: number
  basePrice?: number
  comparePrice?: number
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

const deviceModelSchema = new Schema<IDeviceModel>(
  {
    brand: { type: Schema.Types.ObjectId, ref: "Brand", required: [true, "Brand is required"] },
    name: { type: String, required: [true, "Device name is required"], trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    displayName: { type: String, required: true, trim: true },
    isActive: { type: Boolean, default: true },
    releaseYear: { type: Number },
    basePrice: { type: Number, default: 499 },
    comparePrice: { type: Number, default: 999 },
  templates: [{
    id: { type: String, required: true },
    name: { type: String, required: true },
    templateImageUrl: { type: String, required: true },
    overlayImageUrl: { type: String },
    blendMode: { type: String, default: 'over' },
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
  }],
  },
  { timestamps: true }
)

deviceModelSchema.plugin(softDeletePlugin)

export const DeviceModel = mongoose.model<IDeviceModel>("DeviceModel", deviceModelSchema)
