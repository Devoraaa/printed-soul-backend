import Razorpay from "razorpay"
import crypto from "crypto"
import { logger } from "../utils/logger"

// ==========================================
// RAZORPAY SETUP — just add 2 keys to .env
// RAZORPAY_KEY_ID=rzp_live_xxx
// RAZORPAY_KEY_SECRET=xxx
// ==========================================

let razorpayInstance: Razorpay | null = null

const getRazorpay = (): Razorpay => {
  if (!razorpayInstance) {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new Error("Razorpay keys not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env")
    }
    razorpayInstance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    })
  }
  return razorpayInstance
}

export const razorpayService = {
  /**
   * Create a Razorpay order
   * Returns razorpayOrderId + amount for frontend checkout
   */
  async createOrder(amount: number, currency: string = "INR", receipt: string) {
    const razorpay = getRazorpay()
    const options = {
      amount: Math.round(amount * 100), // Razorpay expects paise
      currency,
      receipt,
    }
    const order = await razorpay.orders.create(options)
    logger.info(`Razorpay order created: ${order.id} for ₹${amount}`)
    return order
  },

  /**
   * Verify payment signature from Razorpay webhook/callback
   * Returns true if signature is valid
   */
  verifyPayment(razorpayOrderId: string, razorpayPaymentId: string, razorpaySignature: string): boolean {
    const secret = process.env.RAZORPAY_KEY_SECRET as string
    const body = `${razorpayOrderId}|${razorpayPaymentId}`
    const expectedSignature = crypto.createHmac("sha256", secret).update(body).digest("hex")
    const isValid = expectedSignature === razorpaySignature
    if (!isValid) logger.warn(`Razorpay signature mismatch for order ${razorpayOrderId}`)
    return isValid
  },

  /**
   * Get public key for frontend Razorpay checkout initialization
   */
  getPublicKey(): string {
    return process.env.RAZORPAY_KEY_ID || ""
  },
}
