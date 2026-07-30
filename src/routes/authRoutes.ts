import { Router } from "express"
import { sendOtp, verifyOtp, getMe, updateMe, logout, adminLogin, createAdmin, getAdmins } from "../controllers/authController"
import { protect, authorize } from "../middlewares/authMiddleware"

const router = Router()

router.post("/send-otp", sendOtp)
router.post("/verify-otp", verifyOtp)
router.post("/logout", logout)

// Admin Auth
router.post("/admin/login", adminLogin)
router.post("/admin/create", protect, authorize("superadmin"), createAdmin)
router.get("/admin/list", protect, authorize("superadmin", "admin"), getAdmins)

router.get("/me", protect, getMe)
router.put("/me", protect, updateMe)

export default router
