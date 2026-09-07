import { Router, Request, Response } from "express"
import { Product } from "../models/Product"
import { Category } from "../models/Category"
import { Brand } from "../models/Brand"
import { Image } from "../models/Image"

const router = Router()
const BASE_URL = "https://printedsoul.in"

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<":
        return "&lt;"
      case ">":
        return "&gt;"
      case "&":
        return "&amp;"
      case "'":
        return "&apos;"
      case '"':
        return "&quot;"
      default:
        return c
    }
  })
}

router.get("/sitemap.xml", async (req: Request, res: Response) => {
  try {
    // 1. Fetch live DB data in parallel
    const [products, categories, brands] = await Promise.all([
      Product.find({ isActive: true, status: "active", isDeleted: false })
        .select("slug name updatedAt images price caseType")
        .populate("images", "filename url")
        .lean(),
      Category.find({ isActive: true, isDeleted: false })
        .select("slug name updatedAt parentCategory")
        .lean(),
      Brand.find({ isActive: true, isDeleted: false })
        .select("slug name updatedAt")
        .lean(),
    ])

    const now = new Date().toISOString().split("T")[0]

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n`
    xml += `        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n`

    // 2. Core Static Landing Pages
    const staticPages = [
      { url: `${BASE_URL}/`, priority: "1.0", changefreq: "daily" },
      { url: `${BASE_URL}/products`, priority: "0.9", changefreq: "daily" },
      { url: `${BASE_URL}/phone-covers`, priority: "0.9", changefreq: "weekly" },
      { url: `${BASE_URL}/products?category=covers`, priority: "0.9", changefreq: "daily" },
      { url: `${BASE_URL}/products?category=covers&amp;subCategory=dual-case`, priority: "0.85", changefreq: "weekly" },
      { url: `${BASE_URL}/products?category=covers&amp;subCategory=glass-case`, priority: "0.85", changefreq: "weekly" },
      { url: `${BASE_URL}/products?category=covers&amp;subCategory=metal-case`, priority: "0.85", changefreq: "weekly" },
    ]

    for (const page of staticPages) {
      xml += `  <url>\n`
      xml += `    <loc>${page.url}</loc>\n`
      xml += `    <lastmod>${now}</lastmod>\n`
      xml += `    <changefreq>${page.changefreq}</changefreq>\n`
      xml += `    <priority>${page.priority}</priority>\n`
      xml += `  </url>\n`
    }

    // 3. Category Pages
    for (const cat of categories) {
      if (!cat.slug) continue
      const catUrl = `${BASE_URL}/products?category=${escapeXml(cat.slug)}`
      const lastmod = cat.updatedAt ? new Date(cat.updatedAt).toISOString().split("T")[0] : now
      xml += `  <url>\n`
      xml += `    <loc>${catUrl}</loc>\n`
      xml += `    <lastmod>${lastmod}</lastmod>\n`
      xml += `    <changefreq>weekly</changefreq>\n`
      xml += `    <priority>0.8</priority>\n`
      xml += `  </url>\n`
    }

    // 4. Popular Brand Phone Cover Pages
    for (const brand of brands) {
      if (!brand.slug) continue
      const brandUrl = `${BASE_URL}/products?category=covers&amp;brand=${escapeXml(brand.slug)}`
      const lastmod = brand.updatedAt ? new Date(brand.updatedAt).toISOString().split("T")[0] : now
      xml += `  <url>\n`
      xml += `    <loc>${brandUrl}</loc>\n`
      xml += `    <lastmod>${lastmod}</lastmod>\n`
      xml += `    <changefreq>weekly</changefreq>\n`
      xml += `    <priority>0.8</priority>\n`
      xml += `  </url>\n`
    }

    // 5. Product Detail Pages with Images
    for (const prod of products) {
      if (!prod.slug) continue
      const prodUrl = `${BASE_URL}/products/${escapeXml(prod.slug)}`
      const lastmod = prod.updatedAt ? new Date(prod.updatedAt).toISOString().split("T")[0] : now

      xml += `  <url>\n`
      xml += `    <loc>${prodUrl}</loc>\n`
      xml += `    <lastmod>${lastmod}</lastmod>\n`
      xml += `    <changefreq>weekly</changefreq>\n`
      xml += `    <priority>0.85</priority>\n`

      // Add product images for Google Images search ranking
      if (Array.isArray(prod.images) && prod.images.length > 0) {
        for (const img of prod.images.slice(0, 3)) {
          const imgObj = img as any
          const imgUrl = imgObj.url
            ? (imgObj.url.startsWith("http") ? imgObj.url : `${BASE_URL}${imgObj.url}`)
            : imgObj.filename
            ? `${BASE_URL}/uploads/${imgObj.filename}`
            : null

          if (imgUrl) {
            xml += `    <image:image>\n`
            xml += `      <image:loc>${escapeXml(imgUrl)}</image:loc>\n`
            xml += `      <image:title>${escapeXml(prod.name || "Printed Soul Product")}</image:title>\n`
            xml += `    </image:image>\n`
          }
        }
      }

      xml += `  </url>\n`
    }

    xml += `</urlset>`

    res.header("Content-Type", "application/xml")
    res.header("Cache-Control", "public, max-age=3600")
    return res.send(xml)
  } catch (error: any) {
    console.error("Error generating sitemap:", error)
    return res.status(500).send("Error generating sitemap")
  }
})

export default router
