import nodemailer from "nodemailer"
import { logger } from "../utils/logger"

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

const sendEmail = async (to: string, subject: string, html: string) => {
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM_EMAIL || "Printed Soul Store <noreply@printedsoul.com>",
      to,
      subject,
      html,
    })
    logger.info(`Email sent to ${to}: ${subject}`)
  } catch (error: any) {
    logger.error(`Email failed to ${to}: ${error.message}`)
    throw error
  }
}

const baseTemplate = (content: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f4f4f5; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 32px; text-align: center; }
    .header h1 { color: #fff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.5px; }
    .header p { color: #a5b4fc; margin: 8px 0 0; font-size: 14px; }
    .body { padding: 32px; color: #374151; line-height: 1.6; }
    .body h2 { color: #111827; font-size: 20px; margin-top: 0; }
    .btn { display: inline-block; background: #4f46e5; color: #fff !important; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; margin: 16px 0; }
    .order-table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    .order-table th { background: #f9fafb; padding: 10px 12px; text-align: left; font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
    .order-table td { padding: 12px; border-top: 1px solid #f3f4f6; }
    .total-row td { font-weight: 700; border-top: 2px solid #e5e7eb; }
    .status-badge { display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; background: #d1fae5; color: #065f46; }
    .footer { background: #f9fafb; padding: 20px 32px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #f3f4f6; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🖨️ Printed Soul Store</h1>
      <p>Premium Phone Cases & Accessories</p>
    </div>
    <div class="body">${content}</div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} Printed Soul Store. All rights reserved.</p>
      <p>If you have questions, reply to this email.</p>
    </div>
  </div>
</body>
</html>`

export const emailService = {
  async sendOtp(to: string, otp: string) {
    const html = baseTemplate(`
      <h2>Your Login OTP 🔐</h2>
      <p>Here is your One-Time Password (OTP) to login:</p>
      <h1 style="letter-spacing: 5px; font-size: 32px; color: #111;">${otp}</h1>
      <p style="color: #666; font-size: 12px;">This OTP is valid for 10 minutes. Do not share it with anyone.</p>
    `)
    await sendEmail(to, "Your Printed Soul Store Login OTP", html)
  },

  async sendWelcome(to: string, name: string) {
    const html = baseTemplate(`
      <h2>Welcome, ${name}! 🎉</h2>
      <p>Thanks for joining Printed Soul Store. Your account is ready.</p>
      <p>Explore our collection of premium phone cases designed for your device.</p>
      <a href="${process.env.CLIENT_URL}/products" class="btn">Shop Now</a>
    `)
    await sendEmail(to, "Welcome to Printed Soul Store!", html)
  },

  async sendOrderConfirmation(to: string, name: string, order: any) {
    const itemRows = order.items.map((item: any) => `
      <tr>
        <td>${item.name}</td>
        <td style="text-align:center">${item.quantity}</td>
        <td style="text-align:right">₹${(item.price * item.quantity).toFixed(2)}</td>
      </tr>`).join("")

    const html = baseTemplate(`
      <h2>Order Confirmed! 🎊</h2>
      <p>Hi ${name}, your order <strong>#${order.orderNumber}</strong> has been placed successfully.</p>
      <p><span class="status-badge">✓ Confirmed</span></p>
      <table class="order-table">
        <thead><tr><th>Item</th><th>Qty</th><th>Amount</th></tr></thead>
        <tbody>
          ${itemRows}
          <tr class="total-row"><td colspan="2">Total</td><td style="text-align:right">₹${order.totalAmount.toFixed(2)}</td></tr>
        </tbody>
      </table>
      <p><strong>Payment:</strong> ${order.paymentMethod === "cod" ? "Cash on Delivery" : "Online (Razorpay)"}</p>
      <a href="${process.env.CLIENT_URL}/account/orders/${order._id}" class="btn">Track Order</a>
    `)
    await sendEmail(to, `Order Confirmed — #${order.orderNumber}`, html)
  },

  async sendShippingNotification(to: string, name: string, order: any) {
    const html = baseTemplate(`
      <h2>Your order is on the way! 🚚</h2>
      <p>Hi ${name}, order <strong>#${order.orderNumber}</strong> has been shipped.</p>
      ${order.trackingNumber ? `<p><strong>Tracking Number:</strong> ${order.trackingNumber}</p>` : ""}
      <a href="${process.env.CLIENT_URL}/account/orders/${order._id}" class="btn">Track Order</a>
    `)
    await sendEmail(to, `Order Shipped — #${order.orderNumber}`, html)
  },

  async sendDeliveryConfirmation(to: string, name: string, order: any) {
    const html = baseTemplate(`
      <h2>Order Delivered! 🎁</h2>
      <p>Hi ${name}, your order <strong>#${order.orderNumber}</strong> has been delivered. Hope you love it!</p>
      <p>Leave a review and help other customers.</p>
      <a href="${process.env.CLIENT_URL}/account/orders/${order._id}" class="btn">Write a Review</a>
    `)
    await sendEmail(to, `Delivered — #${order.orderNumber}`, html)
  },

  async sendPasswordReset(to: string, name: string, resetUrl: string) {
    const html = baseTemplate(`
      <h2>Reset Your Password 🔑</h2>
      <p>Hi ${name}, we received a request to reset your password. Click the button below. This link expires in 10 minutes.</p>
      <a href="${resetUrl}" class="btn">Reset Password</a>
      <p style="color:#9ca3af;font-size:13px;margin-top:16px">If you didn't request this, ignore this email.</p>
    `)
    await sendEmail(to, "Password Reset — Printed Soul Store", html)
  },
}
