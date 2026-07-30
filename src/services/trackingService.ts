import axios from "axios"

export interface CourierTrackingInfo {
  courierPartner: string
  trackingNumber: string
  trackingUrl: string
  estimatedDelivery?: Date
}

let cachedShiprocketToken: { token: string; expiresAt: number } | null = null

export const trackingService = {
  /**
   * Generates a direct tracking URL based on courier partner and AWB number
   */
  generateTrackingUrl(courierPartner: string = "Shiprocket", trackingNumber: string): string {
    const courier = (courierPartner || "Shiprocket").toLowerCase().trim()
    const awb = encodeURIComponent(trackingNumber.trim())

    if (courier.includes("delhivery")) {
      return `https://www.delhivery.com/track/package/${awb}`
    } else if (courier.includes("bluedart")) {
      return `https://www.bluedart.com/tracking?waybill=${awb}`
    } else if (courier.includes("dtdc")) {
      return `https://www.dtdc.in/tracking/tracking_results.asp?TknNo=${awb}`
    } else if (courier.includes("post") || courier.includes("speedpost")) {
      return `https://www.indiapost.gov.in/_layouts/15/dop.portal.tracking/trackconsignment.aspx`
    } else if (courier.includes("ecom")) {
      return `https://ecomexpress.in/tracking/?awb_field=${awb}`
    } else if (courier.includes("shadowfax")) {
      return `https://track.shadowfax.in/${awb}`
    }

    // Default Shiprocket tracking URL
    return `https://shiprocket.co/tracking/${awb}`
  },

  /**
   * Helper to obtain Shiprocket JWT token
   */
  async getShiprocketToken(): Promise<string | null> {
    const email = process.env.SHIPROCKET_EMAIL
    const password = process.env.SHIPROCKET_PASSWORD

    if (!email || !password) {
      return null
    }

    if (cachedShiprocketToken && cachedShiprocketToken.expiresAt > Date.now()) {
      return cachedShiprocketToken.token
    }

    try {
      const res = await axios.post("https://apiv2.shiprocket.in/v1/external/auth/login", {
        email,
        password,
      })

      const token = res.data?.token
      if (token) {
        // Cache token for 9 days (Shiprocket tokens expire in 10 days)
        cachedShiprocketToken = {
          token,
          expiresAt: Date.now() + 9 * 24 * 60 * 60 * 1000,
        }
        return token
      }
      return null
    } catch (err: any) {
      console.error("Shiprocket Login Error:", err.response?.data || err.message)
      return null
    }
  },

  /**
   * Push order directly to Shiprocket API to create shipment & generate AWB
   */
  async createShiprocketOrder(order: any): Promise<{ success: boolean; shiprocketOrderId?: number; shipmentId?: number; awbCode?: string; message?: string }> {
    const token = await trackingService.getShiprocketToken()
    if (!token) {
      return { success: false, message: "Shiprocket API credentials (SHIPROCKET_EMAIL, SHIPROCKET_PASSWORD) not configured in .env" }
    }

    const orderDate = new Date(order.createdAt || Date.now())
      .toISOString()
      .replace("T", " ")
      .substring(0, 16)

    const rawPhone = String(order.shippingAddress.phone || "").replace(/\D/g, "")
    const cleanPhone = rawPhone.length > 10 ? rawPhone.slice(-10) : rawPhone || "9876543210"

    const nameParts = (order.shippingAddress.fullName || "Customer").trim().split(" ")
    const firstName = nameParts[0] || "Customer"
    const lastName = nameParts.slice(1).join(" ") || "."

    const addressStreet = order.shippingAddress.street || "Main Street"
    const addressCity = order.shippingAddress.city || "Mumbai"
    const addressState = order.shippingAddress.state || "Maharashtra"
    const addressPincode = String(order.shippingAddress.pincode || "400001").replace(/\D/g, "")
    const addressCountry = order.shippingAddress.country || "India"
    const customerEmail = order.user?.email || "customer@printedsoul.in"

    const payload = {
      order_id: order.orderNumber,
      order_date: orderDate,
      pickup_location: process.env.SHIPROCKET_PICKUP_LOCATION || "Primary",
      billing_customer_name: firstName,
      billing_last_name: lastName,
      billing_address: addressStreet,
      billing_city: addressCity,
      billing_pincode: addressPincode,
      billing_state: addressState,
      billing_country: addressCountry,
      billing_email: customerEmail,
      billing_phone: cleanPhone,
      shipping_is_billing: true,
      shipping_customer_name: firstName,
      shipping_last_name: lastName,
      shipping_address: addressStreet,
      shipping_city: addressCity,
      shipping_pincode: addressPincode,
      shipping_state: addressState,
      shipping_country: addressCountry,
      shipping_email: customerEmail,
      shipping_phone: cleanPhone,
      order_items: order.items.map((item: any) => ({
        name: item.name,
        sku: item.product?.toString() || item.name,
        units: item.quantity,
        selling_price: item.price,
      })),
      payment_method: order.paymentMethod === "cod" ? "COD" : "Prepaid",
      sub_total: order.totalAmount,
      length: 15,
      breadth: 10,
      height: 3,
      weight: 0.35,
    }

    try {
      const res = await axios.post("https://apiv2.shiprocket.in/v1/external/orders/create/adhoc", payload, {
        headers: { Authorization: `Bearer ${token}` },
      })

      const data = res.data
      return {
        success: true,
        shiprocketOrderId: data.order_id,
        shipmentId: data.shipment_id,
        awbCode: data.awb_code || undefined,
        message: "Order created successfully in Shiprocket",
      }
    } catch (err: any) {
      console.error("Shiprocket Create Order Error:", err.response?.data || err.message)
      return {
        success: false,
        message: err.response?.data?.message || err.message || "Failed to create order in Shiprocket",
      }
    }
  },

  /**
   * Fetch real-time AWB status from Shiprocket API
   */
  async fetchShiprocketStatus(awb: string): Promise<any> {
    const token = await trackingService.getShiprocketToken()
    if (!token) return null

    try {
      const res = await axios.get(`https://apiv2.shiprocket.in/v1/external/courier/track/awb/${encodeURIComponent(awb)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return res.data
    } catch (err: any) {
      console.error("Shiprocket Track AWB Error:", err.response?.data || err.message)
      return null
    }
  },
}
