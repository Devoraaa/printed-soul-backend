import mongoose from "mongoose"
import dotenv from "dotenv"
import { Category } from "./models/Category"
import path from "path"

dotenv.config({ path: path.resolve(__dirname, "../.env") })

/**
 * Seeds the protected "Phone Cover" category.
 * This category CANNOT be deleted from admin panel.
 * Run once: npx ts-node src/seedPhoneCover.ts
 */
const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string)
    console.log("✅ Connected to DB...")

    const existing = await Category.findOne({ slug: "phone-cover" })
    if (existing) {
      // Ensure it's marked as protected even if it was created before this script
      if (!existing.isProtected) {
        existing.isProtected = true
        await existing.save()
        console.log("🔒 Existing 'Phone Cover' category is now protected!")
      } else {
        console.log("✅ 'Phone Cover' category already exists and is protected.")
      }
      process.exit(0)
    }

    await Category.create({
      name: "Phone Cover",
      slug: "phone-cover",
      description: "Premium custom phone cases and covers for all models.",
      isActive: true,
      isProtected: true,
      sortOrder: 0,
    })

    console.log("🎉 Protected 'Phone Cover' category created successfully!")
    console.log("   → You can now add sub-categories: 'Dual Case', 'Glass Cover', 'Metal Cover'")
    console.log("   → This category CANNOT be deleted from admin panel.")
    process.exit(0)
  } catch (error) {
    console.error("❌ Error:", error)
    process.exit(1)
  }
}

seed()
