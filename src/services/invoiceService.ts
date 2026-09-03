import PDFDocument from "pdfkit"
import { Response } from "express"

export interface InvoiceItem {
  name: string
  quantity: number
  price: number
}

export interface InvoiceOrder {
  orderNumber: string
  createdAt?: string | Date
  paymentMethod: string
  paymentStatus: string
  payuTxnId?: string
  payuMihpayId?: string
  courierPartner?: string
  trackingNumber?: string
  shippingAddress: {
    fullName: string
    phone?: string
    street: string
    city: string
    state: string
    pincode: string
    country?: string
  }
  user?: {
    name?: string
    email?: string
    phone?: string
  }
  items: InvoiceItem[]
  itemsTotal: number
  shippingCharge: number
  totalAmount: number
}

function formatDate(dateInput?: string | Date): string {
  if (!dateInput) return new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
  return new Date(dateInput).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

/**
 * Builds the PDF document structure in memory
 */
export function buildInvoiceDocument(order: InvoiceOrder): PDFKit.PDFDocument {
  const doc = new PDFDocument({
    size: "A4",
    margin: 40,
    info: {
      Title: `Invoice-${order.orderNumber}`,
      Author: "Printed Soul Store",
      Subject: "Tax Invoice",
    },
  })

  const pageWidth = 595.28
  const margin = 40
  const contentWidth = pageWidth - margin * 2 // 515.28

  // ── HEADER ─────────────────────────────────────────────────────────────
  // Brand Logo & Title
  doc.fontSize(22).font("Helvetica-Bold").fillColor("#111827").text("PRINTED SOUL", margin, 40)
  doc.fontSize(9).font("Helvetica").fillColor("#6B7280").text("Premium Phone Cases & Lifestyle Accessories", margin, 66)
  doc.fontSize(8).fillColor("#9CA3AF").text("Website: www.printedsoul.in  |  Support: support@printedsoul.in", margin, 78)

  // Invoice Title on Right
  doc.fontSize(16).font("Helvetica-Bold").fillColor("#111827").text("TAX INVOICE", margin, 40, { align: "right", width: contentWidth })
  doc.fontSize(9).font("Helvetica-Bold").fillColor("#4F46E5").text(`INV-${order.orderNumber}`, margin, 62, { align: "right", width: contentWidth })
  doc.fontSize(9).font("Helvetica").fillColor("#4B5563").text(`Date: ${formatDate(order.createdAt)}`, margin, 76, { align: "right", width: contentWidth })

  // Divider line
  doc.moveTo(margin, 98).lineTo(pageWidth - margin, 98).lineWidth(1).strokeColor("#E5E7EB").stroke()

  // ── DETAILS SECTION (TWO COLUMNS) ──────────────────────────────────────
  const sectionTop = 112
  const colWidth = (contentWidth - 20) / 2 // ~247

  // Left Column: Customer & Shipping
  doc.rect(margin, sectionTop, colWidth, 100).fillAndStroke("#F9FAFB", "#E5E7EB")
  doc.fontSize(9).font("Helvetica-Bold").fillColor("#4B5563").text("BILLED & SHIPPED TO", margin + 12, sectionTop + 10)

  const customerName = order.shippingAddress?.fullName || order.user?.name || "Valued Customer"
  const customerPhone = order.shippingAddress?.phone || order.user?.phone || ""
  const street = order.shippingAddress?.street || ""
  const cityState = `${order.shippingAddress?.city || ""}, ${order.shippingAddress?.state || ""} - ${order.shippingAddress?.pincode || ""}`

  doc.fontSize(10).font("Helvetica-Bold").fillColor("#111827").text(customerName, margin + 12, sectionTop + 26, { width: colWidth - 24 })
  doc.fontSize(8.5).font("Helvetica").fillColor("#4B5563")
  if (customerPhone) doc.text(`Phone: ${customerPhone}`, margin + 12, sectionTop + 40, { width: colWidth - 24 })
  doc.text(street, margin + 12, sectionTop + 54, { width: colWidth - 24, height: 26, ellipsis: true })
  doc.text(cityState, margin + 12, sectionTop + 82, { width: colWidth - 24 })

  // Right Column: Order & Payment Info
  const rightColX = margin + colWidth + 20
  doc.rect(rightColX, sectionTop, colWidth, 100).fillAndStroke("#F9FAFB", "#E5E7EB")
  doc.fontSize(9).font("Helvetica-Bold").fillColor("#4B5563").text("ORDER & PAYMENT DETAILS", rightColX + 12, sectionTop + 10)

  doc.fontSize(8.5).font("Helvetica").fillColor("#374151")
  doc.text("Order ID:", rightColX + 12, sectionTop + 28)
  doc.font("Helvetica-Bold").text(`#${order.orderNumber}`, rightColX + 80, sectionTop + 28)

  doc.font("Helvetica").text("Payment:", rightColX + 12, sectionTop + 44)
  const isPaid = order.paymentStatus === "paid" || order.paymentStatus === "refunded"
  doc.font("Helvetica-Bold").fillColor(isPaid ? "#059669" : "#D97706").text(
    `${order.paymentStatus.toUpperCase()} (${order.paymentMethod === "cod" ? "COD" : "PayU Online"})`,
    rightColX + 80,
    sectionTop + 44
  )

  doc.font("Helvetica").fillColor("#374151").text("Txn / Ref:", rightColX + 12, sectionTop + 60)
  doc.text(order.payuTxnId || "N/A", rightColX + 80, sectionTop + 60, { width: colWidth - 92, ellipsis: true })

  doc.text("Logistics:", rightColX + 12, sectionTop + 76)
  const courierText = order.trackingNumber ? `${order.courierPartner || "Delhivery"} (${order.trackingNumber})` : "Standard Courier"
  doc.font("Helvetica-Bold").text(courierText, rightColX + 80, sectionTop + 76, { width: colWidth - 92, ellipsis: true })

  // ── ITEMS TABLE ────────────────────────────────────────────────────────
  const tableTop = sectionTop + 115

  // Table Header Background
  doc.rect(margin, tableTop, contentWidth, 22).fill("#111827")
  doc.fontSize(8.5).font("Helvetica-Bold").fillColor("#FFFFFF")
  doc.text("#", margin + 10, tableTop + 6, { width: 25 })
  doc.text("ITEM DESCRIPTION", margin + 35, tableTop + 6, { width: 270 })
  doc.text("PRICE", margin + 310, tableTop + 6, { width: 65, align: "right" })
  doc.text("QTY", margin + 385, tableTop + 6, { width: 45, align: "center" })
  doc.text("TOTAL", margin + 435, tableTop + 6, { width: 70, align: "right" })

  let currentY = tableTop + 22
  doc.font("Helvetica").fillColor("#111827")

  order.items.forEach((item, index) => {
    const isEven = index % 2 === 0
    if (isEven) {
      doc.rect(margin, currentY, contentWidth, 24).fill("#F9FAFB")
    }

    doc.fontSize(8.5).font("Helvetica").fillColor("#4B5563").text(String(index + 1), margin + 10, currentY + 7, { width: 25 })
    doc.font("Helvetica-Bold").fillColor("#111827").text(item.name, margin + 35, currentY + 7, { width: 270, ellipsis: true })
    doc.font("Helvetica").fillColor("#374151").text(`INR ${item.price.toFixed(2)}`, margin + 310, currentY + 7, { width: 65, align: "right" })
    doc.text(String(item.quantity), margin + 385, currentY + 7, { width: 45, align: "center" })
    doc.font("Helvetica-Bold").text(`INR ${(item.price * item.quantity).toFixed(2)}`, margin + 435, currentY + 7, { width: 70, align: "right" })

    // Row bottom line
    doc.moveTo(margin, currentY + 24).lineTo(pageWidth - margin, currentY + 24).lineWidth(0.5).strokeColor("#E5E7EB").stroke()
    currentY += 24
  })

  // ── TOTALS SECTION ─────────────────────────────────────────────────────
  currentY += 15
  const summaryBoxWidth = 220
  const summaryBoxX = pageWidth - margin - summaryBoxWidth

  doc.rect(summaryBoxX, currentY, summaryBoxWidth, 80).fillAndStroke("#F9FAFB", "#E5E7EB")

  doc.fontSize(8.5).font("Helvetica").fillColor("#4B5563")
  doc.text("Items Subtotal:", summaryBoxX + 12, currentY + 10)
  doc.font("Helvetica-Bold").fillColor("#111827").text(`INR ${order.itemsTotal.toFixed(2)}`, summaryBoxX + 110, currentY + 10, { align: "right", width: 98 })

  doc.font("Helvetica").fillColor("#4B5563").text("Shipping Charges:", summaryBoxX + 12, currentY + 28)
  const shippingText = order.shippingCharge === 0 ? "FREE" : `INR ${order.shippingCharge.toFixed(2)}`
  doc.font("Helvetica-Bold").fillColor(order.shippingCharge === 0 ? "#059669" : "#111827").text(shippingText, summaryBoxX + 110, currentY + 28, { align: "right", width: 98 })

  doc.moveTo(summaryBoxX + 12, currentY + 46).lineTo(summaryBoxX + summaryBoxWidth - 12, currentY + 46).lineWidth(0.5).strokeColor("#D1D5DB").stroke()

  doc.fontSize(11).font("Helvetica-Bold").fillColor("#111827").text("Total Amount:", summaryBoxX + 12, currentY + 54)
  doc.fontSize(12).font("Helvetica-Bold").fillColor("#4F46E5").text(`INR ${order.totalAmount.toFixed(2)}`, summaryBoxX + 110, currentY + 54, { align: "right", width: 98 })

  // Left-hand Note / GST remark
  doc.fontSize(8).font("Helvetica-Bold").fillColor("#4B5563").text("GST & TAX INFORMATION:", margin, currentY + 10)
  doc.fontSize(8).font("Helvetica").fillColor("#6B7280").text("• All prices are inclusive of applicable GST / State Taxes.", margin, currentY + 24)
  doc.text("• Return / Replacement policy applies as per store terms.", margin, currentY + 36)
  doc.text("• Keep this invoice handy for any customer warranty or tracking support.", margin, currentY + 48)

  // ── FOOTER ─────────────────────────────────────────────────────────────
  const footerY = 770
  doc.moveTo(margin, footerY).lineTo(pageWidth - margin, footerY).lineWidth(0.5).strokeColor("#E5E7EB").stroke()
  doc.fontSize(8).font("Helvetica").fillColor("#9CA3AF").text(
    "This is an electronically generated Tax Invoice and does not require a physical signature.",
    margin,
    footerY + 10,
    { align: "center", width: contentWidth }
  )
  doc.fontSize(7.5).fillColor("#9CA3AF").text(
    "Printed Soul Store  •  support@printedsoul.in  •  www.printedsoul.in",
    margin,
    footerY + 22,
    { align: "center", width: contentWidth }
  )

  return doc
}

/**
 * Streams the invoice directly to the Express HTTP Response.
 * Zero files are written to disk. The server storage stays 100% clean!
 */
export function streamInvoicePdf(order: InvoiceOrder, res: Response): void {
  const doc = buildInvoiceDocument(order)
  
  res.setHeader("Content-Type", "application/pdf")
  res.setHeader("Content-Disposition", `attachment; filename="Invoice-${order.orderNumber}.pdf"`)
  
  doc.pipe(res)
  doc.end()
}

/**
 * Generates an in-memory PDF Buffer.
 * Used for email attachments (Nodemailer) with zero disk usage!
 */
export function generateInvoiceBuffer(order: InvoiceOrder): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = buildInvoiceDocument(order)
    const chunks: Buffer[] = []

    doc.on("data", (chunk: Buffer) => chunks.push(chunk))
    doc.on("end", () => resolve(Buffer.concat(chunks)))
    doc.on("error", (err: Error) => reject(err))

    doc.end()
  })
}
