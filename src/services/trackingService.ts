// trackingService.ts — Delhivery One only
// Shiprocket completely removed.
// All shipment operations are in delhiveryService.ts

export const trackingService = {
  /**
   * Generate tracking URL — defaults to Delhivery
   */
  generateTrackingUrl(courierPartner: string = "Delhivery", trackingNumber: string): string {
    const courier = (courierPartner || "Delhivery").toLowerCase().trim()
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
    }

    // Fallback — Delhivery
    return `https://www.delhivery.com/track/package/${awb}`
  },
}
