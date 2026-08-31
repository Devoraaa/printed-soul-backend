/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PRODUCT NAME PARSER
 * Intelligently extracts designSlug and caseType from a product name.
 * Case-insensitive. Works at import time and at admin create/update time.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type CaseType =
  | "dual-case"
  | "metal-case"
  | "glass-case"
  | "hard-case"
  | "soft-case"
  | "wallet-case"
  | "frame"
  | "tumbler"
  | "mug"
  | "other"

export interface ParsedProduct {
  designName: string   // "Ronaldo Legacy Collage"
  designSlug: string   // "ronaldo-legacy-collage"
  caseType: CaseType
  isMobileCase: boolean
}

// ── Brand prefixes to strip ──────────────────────────────────────────────────
const BRAND_PREFIXES = [
  /^printed\s*soul\s*[-–—:]\s*/i,
  /^printedsoul\s*/i,
  /^printed\s*soul\s+/i,
]

// ── Case type patterns (order matters — more specific first) ─────────────────
// Each entry: { regex to match, canonical CaseType }
const CASE_TYPE_PATTERNS: { pattern: RegExp; type: CaseType }[] = [
  // Dual / Double Layer
  { pattern: /double\s*layer(\s+mobile)?\s*cover/i,   type: "dual-case" },
  { pattern: /dual[\s-]layer(\s+mobile)?\s*cover/i,   type: "dual-case" },
  { pattern: /dual[\s-]case/i,                         type: "dual-case" },
  { pattern: /double[\s-]case/i,                       type: "dual-case" },
  { pattern: /2[\s-]in[\s-]1\s*case/i,                 type: "dual-case" },

  // Metal
  { pattern: /metal[\s-]frame(\s+mobile)?\s*cover/i,  type: "metal-case" },
  { pattern: /metal[\s-]case/i,                        type: "metal-case" },
  { pattern: /metal[\s-]cover/i,                       type: "metal-case" },
  { pattern: /aluminum[\s-]case/i,                     type: "metal-case" },

  // Glass / Tempered
  { pattern: /tempered[\s-]glass\s*case/i,             type: "glass-case" },
  { pattern: /glass[\s-]case/i,                        type: "glass-case" },
  { pattern: /glass[\s-]cover/i,                       type: "glass-case" },
  { pattern: /glass[\s-]back\s*cover/i,                type: "glass-case" },

  // Wallet
  { pattern: /wallet[\s-]case/i,                       type: "wallet-case" },
  { pattern: /flip[\s-]case/i,                         type: "wallet-case" },
  { pattern: /folio[\s-]case/i,                        type: "wallet-case" },

  // Hard / Matte
  { pattern: /hard[\s-]case/i,                         type: "hard-case" },
  { pattern: /matte[\s-]case/i,                        type: "hard-case" },
  { pattern: /polycarbonate[\s-]case/i,                type: "hard-case" },

  // Soft / Silicone / TPU
  { pattern: /soft[\s-]case/i,                         type: "soft-case" },
  { pattern: /silicone[\s-]case/i,                     type: "soft-case" },
  { pattern: /tpu[\s-]case/i,                          type: "soft-case" },
  { pattern: /rubber[\s-]case/i,                       type: "soft-case" },

  // Frames & Art
  { pattern: /metal[\s-]frame/i,                       type: "frame" },
  { pattern: /wall[\s-]art/i,                          type: "frame" },
  { pattern: /poster\b/i,                              type: "frame" },
  { pattern: /\bframe\b/i,                             type: "frame" },

  // Drinkware
  { pattern: /\btumbler\b/i,                           type: "tumbler" },
  { pattern: /\bmug\b/i,                               type: "mug" },

  // Fallback: any generic "mobile cover" (treat as hard case)
  { pattern: /\bmobile\s*cover\b/i,                    type: "hard-case" },
  { pattern: /\bphone\s*case\b/i,                      type: "hard-case" },
  { pattern: /\bphone\s*cover\b/i,                     type: "hard-case" },
]

// ── Suffixes / noise phrases to remove AFTER caseType is extracted ───────────
// These leave only the pure design name
const NOISE_PHRASES = [
  /\(\s*a[34]\s*size\s*\)/i,   // (A3 Size), (A4 Size)
  /\ba[34]\s*size\b/i,
  /\bfor\s+(iphone|samsung|oneplus|xiaomi|redmi|poco|vivo|oppo|realme|google|motorola|moto|nokia|huawei|asus|lg|sony)\b.*/i,
]

// ── Slugify helper ────────────────────────────────────────────────────────────
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")   // remove special chars
    .replace(/\s+/g, "-")            // spaces → dashes
    .replace(/-+/g, "-")             // multiple dashes → one
    .replace(/(^-|-$)/g, "")         // trim leading/trailing
}

// ── MAIN EXPORT ───────────────────────────────────────────────────────────────
export function parseProductName(rawName: string): ParsedProduct {
  let name = rawName.trim()

  // 1. Strip brand prefix
  for (const prefix of BRAND_PREFIXES) {
    name = name.replace(prefix, "")
  }
  name = name.trim()

  // 2. Detect & remove caseType phrase
  let caseType: CaseType = "other"
  for (const { pattern, type } of CASE_TYPE_PATTERNS) {
    if (pattern.test(name)) {
      caseType = type
      name = name.replace(pattern, "").trim()
      break
    }
  }

  // 3. Remove noise phrases
  for (const noise of NOISE_PHRASES) {
    name = name.replace(noise, "").trim()
  }

  // 4. Clean up trailing/leading punctuation & dashes
  name = name.replace(/[-–—,.\s]+$/, "").replace(/^[-–—,.\s]+/, "").trim()

  // 5. Collapse multiple spaces
  name = name.replace(/\s{2,}/g, " ")

  const isMobileCase = ["dual-case", "metal-case", "glass-case", "hard-case", "soft-case", "wallet-case"].includes(caseType)

  return {
    designName: name || rawName,          // fallback to raw if nothing left
    designSlug: slugify(name || rawName),
    caseType,
    isMobileCase,
  }
}

/**
 * Returns a human-readable label for the case type — useful for frontend buttons
 */
export const CASE_TYPE_LABELS: Record<CaseType, string> = {
  "dual-case":   "Dual Case",
  "metal-case":  "Metal Case",
  "glass-case":  "Glass Case",
  "hard-case":   "Hard Case",
  "soft-case":   "Soft Case",
  "wallet-case": "Wallet Case",
  "frame":       "Frame / Art",
  "tumbler":     "Tumbler",
  "mug":         "Mug",
  "other":       "Other",
}
