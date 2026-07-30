import mongoose from "mongoose"

const bannerSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    imageUrl: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Image",
      required: true,
    },
    link: {
      type: String,
      trim: true,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0,
    },
    type: {
      type: String,
      enum: ["hero", "promo"],
      default: "hero",
    },
  },
  { timestamps: true }
)

export const Banner = mongoose.model("Banner", bannerSchema)
