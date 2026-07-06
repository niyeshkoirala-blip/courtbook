import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * audit_logs (blueprint §5.2): append-only — no update/delete paths exist in
 * any service, and every admin mutation writes one entry (§4.4 Admin).
 */
const auditSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: { type: String, required: true, index: true }, // e.g. "venue.approve"
    targetType: { type: String, required: true },
    targetId: { type: Schema.Types.ObjectId, required: true, index: true },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    ip: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type AuditLogDoc = HydratedDocument<InferSchemaType<typeof auditSchema>>;
export const AuditLog = model('AuditLog', auditSchema, 'audit_logs');

export async function writeAudit(entry: {
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
}): Promise<void> {
  await AuditLog.create(entry);
}
