import express from "express"
import { protect, authorize } from "../middlewares/authMiddleware"
import {
  getSocialPosts,
  getActiveSocialPosts,
  createSocialPost,
  updateSocialPost,
  deleteSocialPost
} from "../controllers/socialPostController"

const router = express.Router()

router.route("/")
  .get(protect, authorize("admin", "superadmin"), getSocialPosts)
  .post(protect, authorize("admin", "superadmin"), createSocialPost)

router.get("/active", getActiveSocialPosts)

router.route("/:id")
  .put(protect, authorize("admin", "superadmin"), updateSocialPost)
  .delete(protect, authorize("admin", "superadmin"), deleteSocialPost)

export default router
