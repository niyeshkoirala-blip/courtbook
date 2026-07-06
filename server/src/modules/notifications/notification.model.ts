import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

/**
 * notifications = the outbox (blueprint §2.10, §5.2): services insert a row,
 * the worker delivers it. At-least-once with capped retries (§4.5).
 */
const notificationSchema = new Schema(
  {
    to: { type: String, required: true },
    templateId: { type: String, required: true },
    payload: { type: Map, of: String, default: {} },
    status: {
      type: String,
      enum: ['queued', 'sent', 'failed'],
      default: 'queued',
      index: true,
    },
    attempts: { type: Number, default: 0 },
    sendAfter: { type: Date, default: Date.now },
    sentAt: { type: Date },
  },
  { timestamps: true },
);

export type NotificationDoc = HydratedDocument<InferSchemaType<typeof notificationSchema>>;
export const Notification = model('Notification', notificationSchema);
