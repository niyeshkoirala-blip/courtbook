import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * sessions = refresh tokens (blueprint §5.2, §2.7). Rotation inserts a new
 * doc per refresh; familyId ties the chain together so reuse of any revoked
 * token kills the whole device session.
 */
const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // HMAC-SHA256 of the raw token — a DB leak alone can't forge refreshes
    tokenHash: { type: String, required: true, unique: true },
    familyId: { type: String, required: true, index: true },
    // TTL index: MongoDB deletes expired sessions itself, no sweeper needed
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    revokedAt: { type: Date },
    ip: { type: String },
    userAgent: { type: String },
  },
  { timestamps: true },
);

export type SessionDoc = HydratedDocument<InferSchemaType<typeof sessionSchema>>;
export const Session = model('Session', sessionSchema);
