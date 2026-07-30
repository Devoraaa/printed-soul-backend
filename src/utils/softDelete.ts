import { Schema, Document } from "mongoose"

export interface SoftDeleteDocument extends Document {
  isDeleted: boolean
  deletedAt: Date | null
  deletedBy: string | null
  softDelete: (userId?: string) => Promise<void>
  restore: () => Promise<void>
}

export const softDeletePlugin = (schema: Schema) => {
  schema.add({
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  })

  const queryMiddleware = [
    "count", "countDocuments", "find", "findOne",
    "findOneAndDelete", "findOneAndRemove", "findOneAndUpdate",
    "update", "updateOne", "updateMany",
  ]

  queryMiddleware.forEach((type) => {
    schema.pre(type as any, function (this: any, next) {
      if (this.getFilter().isDeleted !== true && this.getFilter().isDeleted !== false) {
        this.where({ isDeleted: false })
      }
      next()
    })
  })

  schema.methods.softDelete = async function (userId?: string) {
    this.isDeleted = true
    this.deletedAt = new Date()
    if (userId) this.deletedBy = userId
    return this.save()
  }

  schema.methods.restore = async function () {
    this.isDeleted = false
    this.deletedAt = null
    this.deletedBy = null
    return this.save()
  }
}
