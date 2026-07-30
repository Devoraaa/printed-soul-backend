import mongoose, { Schema, Document } from "mongoose"

export interface IAddress extends Document {
  user: mongoose.Types.ObjectId
  label: string
  fullName: string
  phone: string
  street: string
  city: string
  state: string
  pincode: string
  country: string
  isDefault: boolean
}

const addressSchema = new Schema<IAddress>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    label: { type: String, default: "Home", trim: true },
    fullName: { type: String, required: [true, "Full name is required"], trim: true },
    phone: { type: String, required: [true, "Phone number is required"] },
    street: { type: String, required: [true, "Street address is required"] },
    city: { type: String, required: [true, "City is required"] },
    state: { type: String, required: [true, "State is required"] },
    pincode: { type: String, required: [true, "Pincode is required"] },
    country: { type: String, default: "India" },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
)

export const Address = mongoose.model<IAddress>("Address", addressSchema)
