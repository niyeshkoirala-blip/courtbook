import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import type { BlockDto } from '@courtbook/shared';

/** blocks (blueprint §5.2): owner-held time ranges — maintenance, walk-in holds. */
const blockSchema = new Schema(
  {
    courtId: { type: Schema.Types.ObjectId, ref: 'Court', required: true, index: true },
    date: { type: String, required: true }, // "YYYY-MM-DD" NPT
    startMin: { type: Number, required: true },
    endMin: { type: Number, required: true },
    reason: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);
blockSchema.index({ courtId: 1, date: 1 });

export type BlockDoc = HydratedDocument<InferSchemaType<typeof blockSchema>>;
export const Block = model('Block', blockSchema);

export function toBlockDto(b: BlockDoc): BlockDto {
  return {
    id: b.id as string,
    courtId: b.courtId.toString(),
    date: b.date,
    startMin: b.startMin,
    endMin: b.endMin,
    reason: b.reason,
  };
}
