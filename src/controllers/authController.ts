import { Request, Response, NextFunction } from "express"
import jwt from "jsonwebtoken"
import crypto from "crypto"
import { User } from "../models/User"
import { ApiError } from "../api/ApiError"
import { ApiResponse } from "../api/ApiResponse"
import { asyncHandler } from "../api/asyncHandler"
import { emailService } from "../services/emailService"

const signToken = (id: string) =>
  jwt.sign({ id }, process.env.JWT_SECRET as string, {
    expiresIn: process.env.JWT_EXPIRE || "30d",
  } as jwt.SignOptions)

const sendTokenResponse = (user: any, statusCode: number, res: Response) => {
  const token = signToken(user._id)
  const cookieExpireDays = parseInt(process.env.JWT_COOKIE_EXPIRE || "30")
  res
    .status(statusCode)
    .cookie("token", token, {
      expires: new Date(Date.now() + cookieExpireDays * 24 * 60 * 60 * 1000),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    })
    .json(
      ApiResponse.success(
        { _id: user._id, name: user.name, email: user.email, role: user.role, phone: user.phone, avatar: user.avatar },
        "Authentication successful",
        { token }
      )
    )
}

// ── OTP Authentication ──────────────────────────────────────────────────────

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString()

export const sendOtp = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { email, name, phone } = req.body
  if (!email) return next(new ApiError(400, "Email is required"))

  let user = await User.findOne({ email })
  
  if (!user) {
    if (!name || !phone) {
      return next(new ApiError(400, "New user registration requires name and phone number"))
    }
    user = await User.create({ name, email, phone, isVerified: false })
  }

  const otp = generateOTP()
  user.otp = crypto.createHash("sha256").update(otp).digest("hex")
  user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000) // 10 mins
  await user.save({ validateBeforeSave: false })

  // Send OTP via Email
  try {
    await emailService.sendOtp(email, otp)
    res.json(ApiResponse.success({ isNewUser: !user.isVerified }, "OTP sent successfully to email"))
  } catch (error: any) {
    user.otp = undefined
    user.otpExpiry = undefined
    await user.save({ validateBeforeSave: false })
    return next(new ApiError(500, "Error sending email: " + (error.message || String(error))))
  }
})

export const verifyOtp = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { email, otp } = req.body
  if (!email || !otp) return next(new ApiError(400, "Please provide email and OTP"))

  const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex")
  
  const user = await User.findOne({
    email,
    otp: hashedOtp,
    otpExpiry: { $gt: Date.now() }
  }).select("+otp +otpExpiry")

  if (!user) {
    return next(new ApiError(401, "Invalid or expired OTP"))
  }

  user.otp = undefined
  user.otpExpiry = undefined
  user.isVerified = true
  await user.save({ validateBeforeSave: false })

  sendTokenResponse(user, 200, res)
})

// ── Admin Authentication ────────────────────────────────────────────────────

export const adminLogin = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { email, password } = req.body
  if (!email || !password) return next(new ApiError(400, "Please provide email and password"))

  const user = await User.findOne({ email }).select("+password")
  if (!user || !(await user.matchPassword(password))) {
    return next(new ApiError(401, "Invalid credentials"))
  }

  if (user.role === "user") {
    return next(new ApiError(403, "Access denied. Admin only."))
  }

  sendTokenResponse(user, 200, res)
})

export const createAdmin = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { name, email, password, phone, role } = req.body
  if (!name || !email || !password || !phone) {
    return next(new ApiError(400, "Please provide name, email, password, and phone"))
  }

  const existing = await User.findOne({ email })
  if (existing) return next(new ApiError(400, "Email already in use"))

  const assignedRole = role === "superadmin" ? "superadmin" : "admin"
  
  const adminUser = await User.create({
    name,
    email,
    password,
    phone,
    role: assignedRole,
    isVerified: true
  })

  res.status(201).json(ApiResponse.success(
    { _id: adminUser._id, name: adminUser.name, email: adminUser.email, role: adminUser.role },
    "Admin created successfully"
  ))
})

export const getAdmins = asyncHandler(async (req: Request, res: Response) => {
  const admins = await User.find({ role: { $in: ["admin", "superadmin"] } }).select("-password")
  res.json(ApiResponse.success(admins, "Admins retrieved"))
})

export const getMe = asyncHandler(async (req: any, res: Response) => {
  const user = await User.findById(req.user.id)
  res.json(ApiResponse.success(user, "Profile retrieved"))
})

export const updateMe = asyncHandler(async (req: any, res: Response) => {
  const allowed = ["name", "phone", "avatar"]
  const updates: any = {}
  allowed.forEach((field) => { if (req.body[field] !== undefined) updates[field] = req.body[field] })

  const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true, runValidators: true })
  res.json(ApiResponse.success(user, "Profile updated"))
})

export const logout = asyncHandler(async (req: Request, res: Response) => {
  res.cookie("token", "none", { expires: new Date(Date.now() + 10 * 1000), httpOnly: true })
  res.json(ApiResponse.success({}, "Logged out successfully"))
})
