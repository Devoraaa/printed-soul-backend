import { Router } from "express"
import { 
  sendOtp, verifyOtp, getMe, updateMe, logout, 
  adminLogin, createAdmin, getAdmins, updatePassword, 
  sendEmailChangeOtp, verifyEmailChangeOtp,
  loginWithPassword, sendLoginOtp, verifyLoginOtp,
  sendSignupOtp, verifySignupOtp
} from "../controllers/authController"
import { protect, authorize } from "../middlewares/authMiddleware"

const router = Router()

// Customer Auth (Dual: Password + OTP)
router.post("/login/password", loginWithPassword)
router.post("/login/send-otp", sendLoginOtp)
router.post("/login/verify-otp", verifyLoginOtp)
router.post("/signup/send-otp", sendSignupOtp)
router.post("/signup/verify-otp", verifySignupOtp)

// Legacy / Direct OTP fallback
router.post("/send-otp", sendOtp)
router.post("/verify-otp", verifyOtp)
router.post("/logout", logout)

// Admin Auth
router.post("/admin/login", adminLogin)
router.post("/admin/create", protect, authorize("superadmin"), createAdmin)
router.get("/admin/list", protect, authorize("superadmin", "admin"), getAdmins)

router.get("/me", protect, getMe)
router.put("/me", protect, updateMe)
router.put("/update-password", protect, updatePassword)
router.post("/change-email/send-otp", protect, sendEmailChangeOtp)
router.post("/change-email/verify-otp", protect, verifyEmailChangeOtp)

export default router
