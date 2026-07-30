import mongoose from "mongoose"
import dotenv from "dotenv"
import path from "path"
import { User } from "../models/User"

dotenv.config({ path: path.resolve(__dirname, "../../.env") })

async function resetAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string)
    console.log("Connected to DB")

    let admin = await User.findOne({ email: "admin@printedsoul.com" })

    if (!admin) {
      console.log("No admin found. Creating one...")
      admin = new User({
        name: "Admin User",
        email: "admin@printedsoul.com",
        phone: "9999999999",
        role: "superadmin",
        isVerified: true
      })
    }

    admin.password = "admin123"
    await admin.save()

    console.log(`Password for ${admin.email} has been reset to: admin123`)
    process.exit(0)
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
}

resetAdmin()
