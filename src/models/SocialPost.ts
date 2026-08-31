import mongoose, { Schema, Document } from "mongoose"

export interface ISocialPost extends Document {
  platform: "instagram" | "facebook"
  type: "reel" | "post"
  url: string
  isActive: boolean
  order: number
  createdBy?: mongoose.Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

const socialPostSchema = new Schema(
  {
    platform: { 
      type: String, 
      enum: ["instagram", "facebook"], 
      required: true 
    },
    type: { 
      type: String, 
      enum: ["reel", "post"], 
      required: true 
    },
    url: { 
      type: String, 
      required: true 
    },
    isActive: { 
      type: Boolean, 
      default: true 
    },
    order: { 
      type: Number, 
      default: 0 
    },
    createdBy: { 
      type: Schema.Types.ObjectId, 
      ref: "User" 
    },
  },
  { timestamps: true }
)

export const SocialPost = mongoose.model<ISocialPost>("SocialPost", socialPostSchema)
