import { Request, Response } from "express"
import { SocialPost } from "../models/SocialPost"

// @desc    Get all social posts (Admin)
// @route   GET /api/social-posts
// @access  Private/Admin
export const getSocialPosts = async (req: Request, res: Response) => {
  try {
    const posts = await SocialPost.find().sort({ order: 1, createdAt: -1 })
    res.json({ success: true, data: posts })
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" })
  }
}

// @desc    Get active social posts (Public)
// @route   GET /api/social-posts/active
// @access  Public
export const getActiveSocialPosts = async (req: Request, res: Response) => {
  try {
    const posts = await SocialPost.find({ isActive: true }).sort({ order: 1, createdAt: -1 })
    res.json({ success: true, data: posts })
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" })
  }
}

// @desc    Create a social post
// @route   POST /api/social-posts
// @access  Private/Admin
export const createSocialPost = async (req: Request, res: Response) => {
  try {
    const { platform, type, url, isActive, order } = req.body

    const post = await SocialPost.create({
      platform,
      type,
      url,
      isActive,
      order,
      createdBy: (req as any).user._id
    })

    res.status(201).json({ success: true, data: post })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
}

// @desc    Update a social post
// @route   PUT /api/social-posts/:id
// @access  Private/Admin
export const updateSocialPost = async (req: Request, res: Response) => {
  try {
    const post = await SocialPost.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true })
    if (!post) {
      return res.status(404).json({ success: false, message: "Post not found" })
    }
    res.json({ success: true, data: post })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
}

// @desc    Delete a social post
// @route   DELETE /api/social-posts/:id
// @access  Private/Admin
export const deleteSocialPost = async (req: Request, res: Response) => {
  try {
    const post = await SocialPost.findByIdAndDelete(req.params.id)
    if (!post) {
      return res.status(404).json({ success: false, message: "Post not found" })
    }
    res.json({ success: true, message: "Post removed" })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
}
