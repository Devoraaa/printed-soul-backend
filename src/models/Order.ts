import mongoose, { Schema, Document } from "mongoose"

export interface IAddress {
  label: string
  fullName: string
  phone: string
  street: string
  city: string
  state: string
  pincode: string
  country: string
  isDefault: boolean
}

export interface IOrderItem {
  product: mongoose.Types.ObjectId
  name: string
  price: number
  quantity: number
  image?: string
}

export type OrderStatus = "pending" | "processing" | "packed" | "shipped" | "delivered" | "cancelled"
export type PaymentMethod = "payu"
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded"

export interface IOrder extends Document {
  orderNumber: string
  user: mongoose.Types.ObjectId
  items: IOrderItem[]
  shippingAddress: IAddress
  paymentMethod: PaymentMethod
  paymentStatus: PaymentStatus
  payuTxnId?: string
  payuMihpayId?: string
  razorpayOrderId?: string
  razorpayPaymentId?: string
  razorpaySignature?: string
  itemsTotal: number
  shippingCharge: number
  totalAmount: number
  status: OrderStatus
  statusHistory: { status: OrderStatus; timestamp: Date; note?: string }[]
  trackingNumber?: string
  courierPartner?: string
  trackingUrl?: string
  estimatedDelivery?: Date
  notes?: string
  cancelReason?: string
  createdAt: Date
  updatedAt: Date
}

const addressSchema = new Schema<IAddress>(
  {
    label: { type: String, default: "Home" },
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    country: { type: String, default: "India" },
    isDefault: { type: Boolean, default: false },
  },
  { _id: false }
)

const orderItemSchema = new Schema<IOrderItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
    image: { type: String },
  },
  { _id: false }
)

const orderSchema = new Schema<IOrder>(
  {
    orderNumber: { type: String, unique: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    items: [orderItemSchema],
    shippingAddress: { type: addressSchema, required: true },
    paymentMethod: { type: String, enum: ["payu"], default: "payu" },
    paymentStatus: { type: String, enum: ["pending", "paid", "failed", "refunded"], default: "pending" },
    payuTxnId: { type: String },
    payuMihpayId: { type: String },
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    razorpaySignature: { type: String },
    itemsTotal: { type: Number, required: true },
    shippingCharge: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },
    status: {
      type: String,
      enum: ["pending", "processing", "packed", "shipped", "delivered", "cancelled"],
      default: "pending",
      index: true,
    },
    statusHistory: [
      {
        status: { type: String },
        timestamp: { type: Date, default: Date.now },
        note: { type: String },
      },
    ],
    trackingNumber: { type: String },
    courierPartner: { type: String, default: "Shiprocket" },
    trackingUrl: { type: String },
    estimatedDelivery: { type: Date },
    notes: { type: String },
    cancelReason: { type: String },
  },
  { timestamps: true }
)

// Auto-generate order number before save
orderSchema.pre("save", async function (next) {
  if (!this.orderNumber) {
    const count = await mongoose.model("Order").countDocuments()
    this.orderNumber = `PSS-${String(count + 1).padStart(6, "0")}`
  }
  // Push initial status to history
  if (this.isNew) {
    this.statusHistory.push({ status: this.status, timestamp: new Date() })
  }
  next()
})

export const Order = mongoose.model<IOrder>("Order", orderSchema)
