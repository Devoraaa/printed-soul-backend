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

// ── OTP Authentication (Legacy & Fallback) ──────────────────────────────────

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString()

export const sendOtp = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { email, name, phone } = req.body
  if (!email) return next(new ApiError(400, "Email is required"))

  const cleanEmail = email.trim().toLowerCase()
  let user = await User.findOne({ email: cleanEmail })
  
  if (!user) {
    if (!name || !phone) {
      return next(new ApiError(404, "No account found with this email address. Please sign up."))
    }
    user = await User.create({ name, email: cleanEmail, phone, isVerified: false })
  }

  const otp = generateOTP()
  user.otp = crypto.createHash("sha256").update(otp).digest("hex")
  user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000) // 10 mins
  await user.save({ validateBeforeSave: false })

  // Send OTP via Email
  try {
    await emailService.sendOtp(cleanEmail, otp)
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

  const cleanEmail = email.trim().toLowerCase()
  const hashedOtp = crypto.createHash("sha256").update(otp.trim()).digest("hex")
  
  const user = await User.findOne({
    email: cleanEmail,
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

// ── Customer Login with Password ────────────────────────────────────────────
export const loginWithPassword = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { email, password } = req.body
  if (!email || !password) {
    return next(new ApiError(400, "Please provide email and password"))
  }

  const cleanEmail = email.trim().toLowerCase()
  const user = await User.findOne({ email: cleanEmail }).select("+password")

  if (!user) {
    return next(new ApiError(404, "No account found with this email address. Please check your email or Sign Up."))
  }

  if (!user.password) {
    return next(new ApiError(400, "This account was created without a password. Please log in using OTP."))
  }

  const isMatch = await user.matchPassword(password)
  if (!isMatch) {
    return next(new ApiError(401, "Incorrect password. Please try again."))
  }

  sendTokenResponse(user, 200, res)
})

// ── Customer Login with OTP (Strict: Rejects Wrong/Unregistered Emails) ─────
export const sendLoginOtp = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { email } = req.body
  if (!email) return next(new ApiError(400, "Email is required"))

  const cleanEmail = email.trim().toLowerCase()
  const user = await User.findOne({ email: cleanEmail })

  // STRICT REQUIREMENT: Do NOT send OTP if email is not found in database!
  if (!user) {
    return next(new ApiError(404, "No account found with this email address. Please check your email or Sign Up."))
  }

  const otp = generateOTP()
  user.otp = crypto.createHash("sha256").update(otp).digest("hex")
  user.otpExpiry = new Date(Date.now() + 10 * 60 * 1000) // 10 mins
  await user.save({ validateBeforeSave: false })

  try {
    await emailService.sendOtp(cleanEmail, otp)
    res.json(ApiResponse.success({}, "Login OTP sent to your registered email"))
  } catch (error: any) {
    user.otp = undefined
    user.otpExpiry = undefined
    await user.save({ validateBeforeSave: false })
    return next(new ApiError(500, "Error sending email: " + (error.message || String(error))))
  }
})

export const verifyLoginOtp = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { email, otp } = req.body
  if (!email || !otp) return next(new ApiError(400, "Please provide email and OTP"))

  const cleanEmail = email.trim().toLowerCase()
  const hashedOtp = crypto.createHash("sha256").update(otp.trim()).digest("hex")

  const user = await User.findOne({
    email: cleanEmail,
    otp: hashedOtp,
    otpExpiry: { $gt: Date.now() },
  }).select("+otp +otpExpiry")

  if (!user) {
    return next(new ApiError(401, "Invalid or expired OTP. Please try again."))
  }

  user.otp = undefined
  user.otpExpiry = undefined
  user.isVerified = true
  await user.save({ validateBeforeSave: false })

  sendTokenResponse(user, 200, res)
})

// ── Customer Sign Up with OTP & Password ───────────────────────────────────
export const sendSignupOtp = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { name, email, phone, password } = req.body
  if (!name || !email || !phone || !password) {
    return next(new ApiError(400, "Please fill in all fields: Name, Email, Phone, and Password"))
  }

  const cleanEmail = email.trim().toLowerCase()
  const cleanPhone = phone.replace(/\D/g, "")

  if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
    return next(new ApiError(400, "Please enter a valid 10-digit Indian mobile number"))
  }

  // Strict password validation
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/
  if (!passwordRegex.test(password)) {
    return next(
      new ApiError(
        400,
        "Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character"
      )
    )
  }

  const existing = await User.findOne({ email: cleanEmail })
  if (existing && existing.isVerified) {
    return next(new ApiError(400, "An account with this email already exists. Please log in."))
  }

  const otp = generateOTP()
  const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex")
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000)

  if (existing && !existing.isVerified) {
    existing.name = name.trim()
    existing.phone = cleanPhone
    existing.password = password
    existing.otp = hashedOtp
    existing.otpExpiry = otpExpiry
    await existing.save()
  } else {
    await User.create({
      name: name.trim(),
      email: cleanEmail,
      phone: cleanPhone,
      password,
      isVerified: false,
      otp: hashedOtp,
      otpExpiry,
    })
  }

  try {
    await emailService.sendOtp(cleanEmail, otp)
    res.json(ApiResponse.success({}, `Verification OTP sent to ${cleanEmail}`))
  } catch (error: any) {
    return next(new ApiError(500, "Error sending verification email: " + (error.message || String(error))))
  }
})

export const verifySignupOtp = asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { email, otp } = req.body
  if (!email || !otp) return next(new ApiError(400, "Please provide email and OTP"))

  const cleanEmail = email.trim().toLowerCase()
  const hashedOtp = crypto.createHash("sha256").update(otp.trim()).digest("hex")

  const user = await User.findOne({
    email: cleanEmail,
    otp: hashedOtp,
    otpExpiry: { $gt: Date.now() },
  }).select("+otp +otpExpiry")

  if (!user) {
    return next(new ApiError(401, "Invalid or expired OTP. Please try again."))
  }

  user.otp = undefined
  user.otpExpiry = undefined
  user.isVerified = true
  await user.save({ validateBeforeSave: false })

  try {
    await emailService.sendWelcome(user.email, user.name)
  } catch {}

  sendTokenResponse(user, 201, res)
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

// ── Strict Password Updation ────────────────────────────────────────────────
export const updatePassword = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
  const { currentPassword, newPassword, confirmPassword } = req.body

  if (!newPassword || !confirmPassword) {
    return next(new ApiError(400, "Please provide new password and confirm password"))
  }

  if (newPassword !== confirmPassword) {
    return next(new ApiError(400, "New password and confirm password do not match"))
  }

  // Strict Password Complexity:
  // - Minimum 8 characters
  // - At least 1 uppercase letter
  // - At least 1 lowercase letter
  // - At least 1 number
  // - At least 1 special character
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/
  if (!passwordRegex.test(newPassword)) {
    return next(
      new ApiError(
        400,
        "Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character"
      )
    )
  }

  const user = await User.findById(req.user.id).select("+password")
  if (!user) return next(new ApiError(404, "User not found"))

  // If user already has a password set, verify their current password
  if (user.password) {
    if (!currentPassword) {
      return next(new ApiError(400, "Please provide your current password"))
    }
    const isMatch = await user.matchPassword(currentPassword)
    if (!isMatch) {
      return next(new ApiError(400, "Current password is incorrect"))
    }
    if (currentPassword === newPassword) {
      return next(new ApiError(400, "New password cannot be the same as current password"))
    }
  }

  user.password = newPassword
  await user.save()

  res.json(ApiResponse.success({}, "Password updated successfully"))
})

// ── Email Change with OTP Verification ──────────────────────────────────────
export const sendEmailChangeOtp = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
  const { newEmail } = req.body
  if (!newEmail) return next(new ApiError(400, "New email is required"))

  const cleanEmail = newEmail.trim().toLowerCase()
  const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/
  if (!emailRegex.test(cleanEmail)) {
    return next(new ApiError(400, "Please provide a valid email address"))
  }

  const user = await User.findById(req.user.id)
  if (!user) return next(new ApiError(404, "User not found"))

  if (user.email.toLowerCase() === cleanEmail) {
    return next(new ApiError(400, "New email cannot be the same as your current email"))
  }

  const existing = await User.findOne({ email: cleanEmail, _id: { $ne: user._id } })
  if (existing) {
    return next(new ApiError(400, "This email address is already registered to another account"))
  }

  const otp = generateOTP()
  user.pendingEmail = cleanEmail
  user.emailOtp = crypto.createHash("sha256").update(otp).digest("hex")
  user.emailOtpExpiry = new Date(Date.now() + 10 * 60 * 1000) // 10 mins
  await user.save({ validateBeforeSave: false })

  try {
    await emailService.sendEmailChangeOtp(cleanEmail, otp)
    res.json(ApiResponse.success({}, `Verification code sent to ${cleanEmail}`))
  } catch (err: any) {
    user.pendingEmail = undefined
    user.emailOtp = undefined
    user.emailOtpExpiry = undefined
    await user.save({ validateBeforeSave: false })
    return next(new ApiError(500, "Failed to send verification email: " + (err.message || String(err))))
  }
})

export const verifyEmailChangeOtp = asyncHandler(async (req: any, res: Response, next: NextFunction) => {
  const { newEmail, otp } = req.body
  if (!newEmail || !otp) return next(new ApiError(400, "Email and OTP are required"))

  const cleanEmail = newEmail.trim().toLowerCase()
  const hashedOtp = crypto.createHash("sha256").update(otp.trim()).digest("hex")

  const user = await User.findOne({
    _id: req.user.id,
    pendingEmail: cleanEmail,
    emailOtp: hashedOtp,
    emailOtpExpiry: { $gt: new Date() }
  }).select("+pendingEmail +emailOtp +emailOtpExpiry")

  if (!user) {
    return next(new ApiError(400, "Invalid or expired OTP. Please request a new code."))
  }

  // Ensure email wasn't taken during OTP entry
  const alreadyTaken = await User.findOne({ email: cleanEmail, _id: { $ne: user._id } })
  if (alreadyTaken) {
    return next(new ApiError(400, "This email address is already in use by another account"))
  }

  user.email = cleanEmail
  user.pendingEmail = undefined
  user.emailOtp = undefined
  user.emailOtpExpiry = undefined
  user.isVerified = true
  await user.save({ validateBeforeSave: false })

  sendTokenResponse(user, 200, res)
})
