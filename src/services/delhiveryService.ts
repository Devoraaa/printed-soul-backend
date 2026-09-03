import axios from "axios"

// ─── Delhivery One API Service ─────────────────────────────────────────────
// Docs: https://developer.delhivery.com/docs/
// Auth: Bearer token from Delhivery One Dashboard → Settings → API Access
// ──────────────────────────────────────────────────────────────────────────

const BASE_URL = process.env.DELHIVERY_BASE_URL || "https://track.delhivery.com"
const TOKEN = process.env.DELHIVERY_TOKEN || ""
const PICKUP_NAME = process.env.DELHIVERY_PICKUP_LOCATION || "Printed_Soul_Warehouse"

function headers() {
  return {
    "Authorization": `Token ${TOKEN}`,
    "Content-Type": "application/json",
  }
}

export const delhiveryService = {
  /**
   * Generate a Delhivery tracking URL for a given waybill number
   */
  generateTrackingUrl(awb: string): string {
    return `https://www.delhivery.com/track/package/${encodeURIComponent(awb.trim())}`
  },

  /**
   * Create a shipment on Delhivery One after successful PayU payment.
   * Returns { success, awbCode, message }
   */
  async createShipment(order: any): Promise<{
    success: boolean
    awbCode?: string
    waybillId?: string
    message?: string
  }> {
    if (!TOKEN) {
      return { success: false, message: "DELHIVERY_TOKEN not set in .env" }
    }

    const addr = order.shippingAddress
    const rawPhone = String(addr.phone || "").replace(/\D/g, "")
    const cleanPhone = rawPhone.length > 10 ? rawPhone.slice(-10) : rawPhone || "9999999999"
    const pincode = String(addr.pincode || "").replace(/\D/g, "")
    const totalWeight = Math.max(0.35, order.items.reduce((s: number, _: any) => s + 0.35, 0)) // 350g per item

    // Delhivery shipment payload
    const shipmentData = {
      shipments: [
        {
          name: addr.fullName || "Customer",
          add: addr.street || "Main Road",
          city: addr.city || "Mumbai",
          state: addr.state || "Maharashtra",
          country: addr.country || "India",
          pin: pincode,
          phone: cleanPhone,
          order: order.orderNumber,
          payment_mode: "Prepaid", // Always Prepaid — COD removed
          return_pin: "",
          return_city: "",
          return_phone: "",
          return_name: "",
          return_add: "",
          return_state: "",
          return_country: "India",
          products_desc: order.items.map((i: any) => i.name).join(", ").substring(0, 100),
          hsn_code: "",
          cod_amount: 0,                  // Always 0 — no COD
          order_date: new Date(order.createdAt || Date.now()).toISOString().split("T")[0],
          total_amount: order.totalAmount,
          seller_add: "",
          seller_name: "Printed Soul Store",
          seller_inv: order.orderNumber,
          quantity: order.items.reduce((s: number, i: any) => s + i.quantity, 0),
          waybill: "",                    // Delhivery will generate
          shipment_width: 12,
          shipment_height: 3,
          weight: totalWeight,
          seller_gst_tin: process.env.DELHIVERY_GST || "",
          shipping_mode: "Surface",
          address_type: "home",
        },
      ],
      pickup_location: { name: PICKUP_NAME },
    }

    try {
      const res = await axios.post(
        `${BASE_URL}/api/cmu/create.json`,
        `format=json&data=${encodeURIComponent(JSON.stringify(shipmentData))}`,
        {
          headers: {
            "Authorization": `Token ${TOKEN}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      )

      const data = res.data
      console.log("Delhivery createShipment response:", JSON.stringify(data))

      // Delhivery returns packages array
      const pkg = data?.packages?.[0]
      if (pkg && pkg.waybill) {
        return {
          success: true,
          awbCode: pkg.waybill,
          waybillId: pkg.waybill,
          message: `Shipment created successfully (AWB: ${pkg.waybill})`,
        }
      }

      // Check for errors in response
      const errMsg = data?.packages?.[0]?.error
        || data?.rmk
        || JSON.stringify(data)
      return { success: false, message: errMsg }
    } catch (err: any) {
      const errDetail = err.response?.data || err.message
      console.error("Delhivery createShipment error:", errDetail)
      return {
        success: false,
        message: typeof errDetail === "string" ? errDetail : JSON.stringify(errDetail),
      }
    }
  },

  /**
   * Cancel a Delhivery shipment by AWB number.
   */
  async cancelShipment(awbCode: string): Promise<{ success: boolean; message?: string }> {
    if (!TOKEN) {
      return { success: false, message: "DELHIVERY_TOKEN not set in .env" }
    }
    if (!awbCode) {
      return { success: false, message: "No AWB code to cancel" }
    }

    try {
      // Delhivery cancel endpoint (Official JSON format)
      const res = await axios.post(
        `${BASE_URL}/api/p/edit`,
        {
          waybill: awbCode,
          cancellation: "true",
        },
        {
          headers: {
            "Authorization": `Token ${TOKEN}`,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "PrintedSoulStore/1.0",
          },
        }
      )
      console.log("Delhivery cancelShipment response:", JSON.stringify(res.data))
      const isSuccess = res.data?.status === true || res.data?.remark?.toLowerCase().includes("cancelled")
      return { 
        success: isSuccess, 
        message: res.data?.remark || `Shipment ${awbCode} cancellation processed` 
      }
    } catch (err: any) {
      const errDetail = err.response?.data || err.message
      console.error("Delhivery cancelShipment error:", errDetail)
      return {
        success: false,
        message: typeof errDetail === "string" ? errDetail : JSON.stringify(errDetail),
      }
    }
  },

  /**
   * Fetch live tracking status for an AWB from Delhivery
   */
  async trackShipment(awbCode: string): Promise<any> {
    if (!TOKEN || !awbCode) return null
    try {
      const res = await axios.get(
        `${BASE_URL}/api/v1/packages/json/?waybill=${encodeURIComponent(awbCode)}`,
        { headers: headers() }
      )
      return res.data
    } catch (err: any) {
      console.error("Delhivery trackShipment error:", err.response?.data || err.message)
      return null
    }
  },
}
