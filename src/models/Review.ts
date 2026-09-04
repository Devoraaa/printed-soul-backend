import mongoose, { Schema, Document } from "mongoose"

export interface IReview extends Document {
  product: mongoose.Types.ObjectId
  user: mongoose.Types.ObjectId
  rating: number
  title?: string
  comment: string
  isApproved: boolean
  isVerifiedPurchase?: boolean
  createdAt: Date
}

const reviewSchema = new Schema<IReview>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    rating: { type: Number, required: [true, "Rating is required"], min: 1, max: 5 },
    title: { type: String, trim: true },
    comment: { type: String, required: [true, "Review comment is required"], trim: true },
    isApproved: { type: Boolean, default: true },
    isVerifiedPurchase: { type: Boolean, default: false },
  },
  { timestamps: true }
)

reviewSchema.index({ product: 1, user: 1 }, { unique: true }) // one review per user per product

// Update product ratings after save
reviewSchema.post("save", async function () {
  const Product = mongoose.model("Product")
  const stats = await mongoose.model("Review").aggregate([
    { $match: { product: this.product, isApproved: true } },
    { $group: { _id: "$product", avgRating: { $avg: "$rating" }, count: { $sum: 1 } } },
  ])
  if (stats.length > 0) {
    await Product.findByIdAndUpdate(this.product, {
      "ratings.average": Math.round(stats[0].avgRating * 10) / 10,
      "ratings.count": stats[0].count,
    })
  }
})

export const Review = mongoose.model<IReview>("Review", reviewSchema)
