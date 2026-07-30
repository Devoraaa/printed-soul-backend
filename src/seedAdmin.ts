import mongoose from "mongoose"
import dotenv from "dotenv"
import bcrypt from "bcryptjs"
import { User } from "./models/User"
import path from "path"

dotenv.config({ path: path.resolve(__dirname, "../.env") })

const seedAdmin = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string)
    console.log("Connected to DB for seeding...")

    const existingAdmin = await User.findOne({ email: "admin@printedsoulstore.in" })
    if (existingAdmin) {
      console.log("Admin already exists!")
      process.exit(0)
    }

    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash("Admin@123", salt)

    await User.create({
      name: "Super Admin",
      email: "admin@printedsoulstore.in",
      password: hashedPassword,
      phone: "9999999999",
      role: "superadmin",
      isVerified: true
    })

    console.log("Super admin created successfully!")
    console.log("Email: admin@printedsoulstore.in")
    console.log("Password: Admin@123")
    
    process.exit(0)
  } catch (error) {
    console.error("Error seeding admin:", error)
    process.exit(1)
  }
}

seedAdmin()
