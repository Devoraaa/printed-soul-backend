import mongoose from "mongoose"

const tickerSchema = new mongoose.Schema(
  {
    items: {
      type: [String],
      default: [
        "⚡ Free Express Delivery Across India on Orders Above ₹499",
        "🛡️ 9H Toughened Glass & Shockproof Armor Protection",
        "🎁 Use Code SPECIAL200 for Instant ₹200 OFF",
        "★ 10,000+ Happy Customers & 4.9/5 Rating",
        "🇮🇳 100% Precision Crafted & Printed In India",
        "🔄 7-Day Easy Replacement Guarantee",
      ],
    },
    rawText: {
      type: String,
      default: "⚡ Free Express Delivery Across India on Orders Above ₹499\n🛡️ 9H Toughened Glass & Shockproof Armor Protection\n🎁 Use Code SPECIAL200 for Instant ₹200 OFF\n★ 10,000+ Happy Customers & 4.9/5 Rating\n🇮🇳 100% Precision Crafted & Printed In India\n🔄 7-Day Easy Replacement Guarantee",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
)

export const Ticker = mongoose.model("Ticker", tickerSchema)
