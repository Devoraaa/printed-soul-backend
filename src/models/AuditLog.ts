import mongoose, { Schema, Document } from "mongoose"

export interface IAuditLog extends Document {
  user: mongoose.Types.ObjectId | string
  action: string
  resource: string
  resourceId?: mongoose.Types.ObjectId | string
  oldData?: any
  newData?: any
  ipAddress?: string
  userAgent?: string
  createdAt: Date
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    action: { type: String, required: true, index: true },
    resource: { type: String, required: true, index: true },
    resourceId: { type: Schema.Types.Mixed, index: true },
    oldData: { type: Schema.Types.Mixed },
    newData: { type: Schema.Types.Mixed },
    ipAddress: String,
    userAgent: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

export const AuditLog = mongoose.model<IAuditLog>("AuditLog", auditLogSchema)
