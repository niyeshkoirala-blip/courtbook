import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import type { UserDto } from '@courtbook/shared';

/**
 * users collection (blueprint §5.2).
 * ponytail: indexes come from mongoose autoIndex for now — migrate-mongo
 * lands with the first prod DB at M8 (deploy deferred, logged in PROGRESS).
 */
const userSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String },
    // select:false — even a sloppy query can't drag the hash into a response
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['player', 'owner', 'admin'], default: 'player' },
    emailVerifiedAt: { type: Date },
    // brute-force lockout (§8): 5 fails → 15 min lock
    failedLogins: { type: Number, default: 0 },
    lockedUntil: { type: Date },
    // one-time emailed tokens, stored hashed (verify: 24 h, reset: 30 min §6.3)
    verifyTokenHash: { type: String },
    verifyTokenExpires: { type: Date },
    resetTokenHash: { type: String },
    resetTokenExpires: { type: Date },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

export type UserDoc = HydratedDocument<InferSchemaType<typeof userSchema>>;
export const User = model('User', userSchema);

/** DTO mapper (§4.1) — the only shape of a user that ever leaves the API. */
export function toUserDto(user: UserDoc): UserDto {
  return {
    id: user.id as string,
    name: user.name,
    email: user.email,
    ...(user.phone && { phone: user.phone }),
    role: user.role,
    emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
  };
}
