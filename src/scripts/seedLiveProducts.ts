import mongoose from "mongoose";
import dotenv from "dotenv";
import { Product } from "../models/Product";
import { Category } from "../models/Category";
import { Brand } from "../models/Brand";
import { Image } from "../models/Image";

dotenv.config();

const SHOPIFY_URL = "https://printedsoulstore.in/products.json?limit=250";

import path from "path";
import fs from "fs/promises";

async function downloadImage(url: string, filename: string): Promise<mongoose.Types.ObjectId | null> {
  try {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Save to disk
    const uploadDir = path.join(__dirname, "../../public/uploads");
    await fs.mkdir(uploadDir, { recursive: true });
    const filepath = path.join(uploadDir, filename);
    await fs.writeFile(filepath, buffer);

    let contentType = "image/jpeg";
    if (url.toLowerCase().includes(".png")) contentType = "image/png";
    if (url.toLowerCase().includes(".webp")) contentType = "image/webp";

    const newImage = new Image({
      filename,
      contentType,
      url: `/uploads/${filename}`,
      size: buffer.length,
    });
    
    await newImage.save();
    return newImage._id as mongoose.Types.ObjectId;
  } catch (err) {
    console.error(`Failed to create image record ${url}:`, err);
    return null;
  }
}

async function seed() {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/printedsoul";
    await mongoose.connect(MONGODB_URI);
    console.log("Connected to DB.");

    console.log("Clearing existing products, categories, brands, and images...");
    await Product.deleteMany({});
    await Category.deleteMany({});
    await Brand.deleteMany({});
    await Image.deleteMany({});
    console.log("Cleared.");

    console.log("Fetching live products...");
    const response = await fetch(SHOPIFY_URL);
    const data = (await response.json()) as any;
    const shopifyProducts = data.products;
    console.log(`Fetched ${shopifyProducts.length} products.`);

    // Extract unique categories based on keywords in titles
    const categoryKeywords = ["Glass Case", "Metal Case", "Dual Protection Case", "Silicone Case", "Hard Case"];
    const categoryMap = new Map();

    for (const keyword of categoryKeywords) {
      const slug = keyword.toLowerCase().replace(/ /g, "-");
      const category = await Category.create({ name: keyword, slug, description: `${keyword} Collection`, isActive: true });
      categoryMap.set(keyword, category._id);
    }

    // Default category for things that don't match
    const defaultCategory = await Category.create({ name: "Premium Cases", slug: "premium-cases", description: "All Premium Cases", isActive: true });

    // Extract unique brands from tags or keywords (iPhone, Samsung, OnePlus, etc.)
    const brandKeywords = ["iPhone", "Samsung", "OnePlus", "Google Pixel", "Xiaomi", "Vivo", "Oppo"];
    const brandMap = new Map();

    for (const keyword of brandKeywords) {
      const slug = keyword.toLowerCase().replace(/ /g, "-");
      const brand = await Brand.create({ name: keyword, slug, description: `${keyword} Covers`, isActive: true });
      brandMap.set(keyword, brand._id);
    }
    const defaultBrand = await Brand.create({ name: "Universal", slug: "universal", description: "Universal Fits", isActive: true });

    let count = 0;
    
    // Process products in batches to avoid memory overload
    for (const sp of shopifyProducts) {
      count++;
      console.log(`[${count}/${shopifyProducts.length}] Processing ${sp.title}`);

      // Determine Category
      let categoryId = defaultCategory._id;
      for (const keyword of categoryKeywords) {
        if (sp.title.toLowerCase().includes(keyword.toLowerCase())) {
          categoryId = categoryMap.get(keyword);
          break;
        }
      }

      // Determine Brand
      let brandId = defaultBrand._id;
      for (const keyword of brandKeywords) {
        if (sp.title.toLowerCase().includes(keyword.toLowerCase())) {
          brandId = brandMap.get(keyword);
          break;
        }
      }

      // Extract price
      let price = 799;
      let comparePrice = 1200;
      if (sp.variants && sp.variants.length > 0) {
        price = parseFloat(sp.variants[0].price) || price;
        comparePrice = sp.variants[0].compare_at_price ? parseFloat(sp.variants[0].compare_at_price) : price * 1.5;
      }

      // Download images (Limit to 2 to speed up)
      const imageIds = [];
      const imagesToProcess = sp.images?.slice(0, 2) || [];
      for (let i = 0; i < imagesToProcess.length; i++) {
        let imgUrl = imagesToProcess[i].src;
        // Fix url scheme if it starts with //
        if (imgUrl.startsWith("//")) imgUrl = "https:" + imgUrl;
        
        const imgId = await downloadImage(imgUrl, `product-${sp.id}-${i}.jpg`);
        if (imgId) imageIds.push(imgId);
      }

      const productToInsert = {
        name: sp.title,
        slug: sp.handle || sp.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
        description: sp.body_html || "Premium printed mobile case.",
        shortDescription: sp.title,
        sku: sp.variants?.[0]?.sku || `SKU-${sp.id}`,
        price,
        comparePrice,
        category: categoryId,
        brand: brandId,
        images: imageIds,
        stock: 100,
        isActive: true,
        isFeatured: count <= 12, // Make the first 12 featured
        tags: sp.tags || [],
        ratings: { average: 4.8, count: Math.floor(Math.random() * 50) + 10 }
      };

      try {
        await Product.create(productToInsert);
      } catch (e: any) {
        // If slug collision, append random
        if (e.code === 11000) {
           productToInsert.slug = `${productToInsert.slug}-${Math.floor(Math.random() * 10000)}`;
           await Product.create(productToInsert);
        } else {
           console.error("Error inserting product:", sp.title, e.message);
        }
      }
    }

    console.log("Seeding complete!");
    process.exit(0);
  } catch (error) {
    console.error("Seeding failed:", error);
    process.exit(1);
  }
}

seed();
