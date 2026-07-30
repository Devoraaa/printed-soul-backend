import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

async function clearDB() {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/printedsoul";
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to DB.");

    console.log("Dropping database to free up space...");
    await mongoose.connection.db!.dropDatabase();
    console.log("Database dropped successfully! Space should be freed.");

    process.exit(0);
  } catch (error) {
    console.error("Failed to drop database:", error);
    process.exit(1);
  }
}

clearDB();
