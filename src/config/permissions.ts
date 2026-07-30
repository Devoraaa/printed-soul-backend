// Granular permissions for the Printed Soul Store
export const PERMISSIONS = {
  // User Management
  USER_CREATE: "user:create",
  USER_READ: "user:read",
  USER_UPDATE: "user:update",
  USER_DELETE: "user:delete",

  // Products
  PRODUCT_CREATE: "product:create",
  PRODUCT_READ: "product:read",
  PRODUCT_UPDATE: "product:update",
  PRODUCT_DELETE: "product:delete",

  // Categories
  CATEGORY_CREATE: "category:create",
  CATEGORY_READ: "category:read",
  CATEGORY_UPDATE: "category:update",
  CATEGORY_DELETE: "category:delete",

  // Brands
  BRAND_CREATE: "brand:create",
  BRAND_READ: "brand:read",
  BRAND_UPDATE: "brand:update",
  BRAND_DELETE: "brand:delete",

  // Devices
  DEVICE_CREATE: "device:create",
  DEVICE_READ: "device:read",
  DEVICE_UPDATE: "device:update",
  DEVICE_DELETE: "device:delete",

  // Orders
  ORDER_READ: "order:read",
  ORDER_UPDATE: "order:update",
  ORDER_DELETE: "order:delete",

  // Inventory
  INVENTORY_READ: "inventory:read",
  INVENTORY_UPDATE: "inventory:update",

  // Reviews
  REVIEW_APPROVE: "review:approve",
  REVIEW_DELETE: "review:delete",

  // Settings
  SETTINGS_UPDATE: "settings:update",

  // Analytics
  ANALYTICS_READ: "analytics:read",

  // SuperAdmin Only
  SYSTEM_ADMIN: "system:admin",
} as const

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS]
