import crypto from "crypto"

export interface PayuPaymentParams {
  txnid: string
  amount: number
  productinfo: string
  firstname: string
  email: string
  phone: string
  surl: string
  furl: string
}

export const payuService = {
  /**
   * Get PayU environment configuration
   */
  getConfig() {
    const key = process.env.PAYU_MERCHANT_KEY || "TEST_KEY"
    const salt = process.env.PAYU_MERCHANT_SALT || "TEST_SALT"
    const env = process.env.PAYU_ENV || "sandbox"
    const actionUrl = env === "production" 
      ? "https://secure.payu.in/_payment" 
      : "https://test.payu.in/_payment"

    return { key, salt, env, actionUrl }
  },

  /**
   * Generates SHA-512 hash for PayU Payment Request
   * Formula: sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||salt)
   */
  generatePaymentHash(params: PayuPaymentParams): { hash: string; key: string; actionUrl: string } {
    const { key, salt, actionUrl } = payuService.getConfig()
    
    // Amount string must match the exact amount string sent in form payload
    const amountStr = String(params.amount)

    const hashString = `${key}|${params.txnid}|${amountStr}|${params.productinfo}|${params.firstname}|${params.email}|||||||||||${salt}`
    
    const hash = crypto.createHash("sha512").update(hashString).digest("hex")

    return {
      hash,
      key,
      actionUrl
    }
  },

  /**
   * Verifies SHA-512 hash from PayU Response
   * Formula: sha512(salt|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
   */
  verifyResponseHash(resBody: any): boolean {
    const { key, salt } = payuService.getConfig()

    const {
      status,
      txnid,
      amount,
      productinfo,
      firstname,
      email,
      hash: responseHash,
      additionalCharges
    } = resBody

    if (!responseHash || !status || !txnid) return false

    const formattedAmount = Number(amount).toFixed(2)

    let hashString = `${salt}|${status}|||||||||||${email}|${firstname}|${productinfo}|${formattedAmount}|${txnid}|${key}`

    // If additional charges applied by PayU (e.g. gateway fees)
    if (additionalCharges) {
      hashString = `${additionalCharges}|${hashString}`
    }

    const calculatedHash = crypto.createHash("sha512").update(hashString).digest("hex")

    return calculatedHash.toLowerCase() === responseHash.toLowerCase()
  }
}
