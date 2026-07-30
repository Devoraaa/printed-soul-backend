import mongoose, { Schema, Document } from "mongoose"

export interface ICartItem {
  product: mongoose.Types.ObjectId
  quantity: number
  price: number
}

export interface ICart extends Document {
  user: mongoose.Types.ObjectId
  items: ICartItem[]
  totalAmount: number
  updatedAt: Date
}

const cartItemSchema = new Schema<ICartItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    quantity: { type: Number, required: true, min: 1, default: 1 },
    price: { type: Number, required: true, min: 0 },
  },
  { _id: false }
)

const cartSchema = new Schema<ICart>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    items: [cartItemSchema],
    totalAmount: { type: Number, default: 0 },
  },
  { timestamps: true }
)

// Auto-calculate total before save
cartSchema.pre("save", function (next) {
  this.totalAmount = this.items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  next()
})

export const Cart = mongoose.model<ICart>("Cart", cartSchema)
