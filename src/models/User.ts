import mongoose, { Schema, Document } from "mongoose"
import bcrypt from "bcryptjs"
import { softDeletePlugin } from "../utils/softDelete"

export interface IUser extends Document {
  name: string
  email: string
  password?: string
  phone: string
  role: "user" | "admin" | "superadmin"
  avatar?: string
  isVerified: boolean
  otp?: string
  otpExpiry?: Date
  emailVerificationToken?: string
  resetPasswordToken?: string
  resetPasswordExpire?: Date
  matchPassword(enteredPassword: string): Promise<boolean>
  createdAt: Date
  updatedAt: Date
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: [true, "Name is required"], trim: true },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, "Invalid email"],
    },
    password: { type: String, minlength: 6, select: false },
    phone: { type: String, required: [true, "Phone number is required"], trim: true },
    role: { type: String, enum: ["user", "admin", "superadmin"], default: "user" },
    avatar: { type: String, default: null },
    isVerified: { type: Boolean, default: false },
    otp: { type: String, select: false },
    otpExpiry: { type: Date, select: false },
    emailVerificationToken: { type: String, select: false },
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpire: { type: Date, select: false },
  },
  { timestamps: true }
)

userSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next()
  const salt = await bcrypt.genSalt(10)
  this.password = await bcrypt.hash(this.password, salt)
  next()
})

userSchema.methods.matchPassword = async function (enteredPassword: string) {
  if (!this.password) return false
  return bcrypt.compare(enteredPassword, this.password)
}

userSchema.plugin(softDeletePlugin)

export const User = mongoose.model<IUser>("User", userSchema)
