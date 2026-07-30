import mongoose from "mongoose";
import dotenv from "dotenv";
import { Product } from "../models/Product";
import { Category } from "../models/Category";

dotenv.config();

async function fixCategories() {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/printedsoul";
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to DB.");

    // Define correct categories
    const categoriesToCreate = [
      "Glass Case",
      "Metal Case",
      "Dual Protection Case",
      "Mouse Pads",
      "Wall Art",
      "Coasters",
      "Tumblers",
      "Tote Bags",
      "Coffee Mugs"
    ];

    const categoryMap = new Map();

    for (const name of categoriesToCreate) {
      const slug = name.toLowerCase().replace(/ /g, "-");
      let category = await Category.findOne({ slug });
      if (!category) {
        category = await Category.create({ name, slug, description: `${name} Collection`, isActive: true });
      } else {
        // Also fix names if they were messed up
        category.name = name;
        await category.save();
      }
      categoryMap.set(name, category._id);
    }

    // Default for things that match nothing
    const defaultCategory = await Category.findOne({ slug: "premium-cases" });

    // Fetch all products
    const products = await Product.find({});
    console.log(`Found ${products.length} products to re-categorize.`);

    let updatedCount = 0;

    for (const product of products) {
      const title = product.name.toLowerCase();
      let newCategoryId = defaultCategory?._id;

      // Categorization logic based on title keywords
      if (title.includes("mouse pad")) {
        newCategoryId = categoryMap.get("Mouse Pads");
      } else if (title.includes("frame") || title.includes("wall art") || title.includes("canvas") || title.includes("artwork")) {
        newCategoryId = categoryMap.get("Wall Art");
      } else if (title.includes("coaster")) {
        newCategoryId = categoryMap.get("Coasters");
      } else if (title.includes("tumbler")) {
        newCategoryId = categoryMap.get("Tumblers");
      } else if (title.includes("tote bag")) {
        newCategoryId = categoryMap.get("Tote Bags");
      } else if (title.includes("mug")) {
        newCategoryId = categoryMap.get("Coffee Mugs");
      } else if (title.includes("double layer")) {
        newCategoryId = categoryMap.get("Dual Protection Case");
      } else if (title.includes("metal case")) {
        newCategoryId = categoryMap.get("Metal Case");
      } else if (title.includes("glass") || title.includes("glossy") || title.includes("cover") || title.includes("case")) {
        // Fallback for cases that aren't double layer or metal
        // If it's a mobile cover but not double layer, we can assign it to Glass Case as requested (premium)
        newCategoryId = categoryMap.get("Glass Case");
      }

      if (newCategoryId && product.category.toString() !== newCategoryId.toString()) {
        product.category = newCategoryId;
        await product.save();
        updatedCount++;
        console.log(`Re-categorized: ${product.name} -> ${Array.from(categoryMap.entries()).find(([k, v]) => v.toString() === newCategoryId.toString())?.[0]}`);
      }
    }

    console.log(`Successfully re-categorized ${updatedCount} products.`);
    process.exit(0);
  } catch (error) {
    console.error("Failed to fix categories:", error);
    process.exit(1);
  }
}

fixCategories();
