import { z } from 'zod';

/**
 * Auth input schemas (blueprint §2.2: single source of validation truth,
 * used by the API route boundary now and the React forms from M5).
 */
export const registerSchema = z.object({
  name: z.string().trim().min(2).max(60),
  email: z.string().trim().email().max(254),
  /** Nepali mobile: 10 digits starting with 9 (98/97/96…), §5.2 — optional. */
  phone: z
    .string()
    .regex(/^9\d{9}$/, 'Expected a 10-digit Nepali mobile number (9XXXXXXXXX)')
    .optional(),
  // min 8 per §3.5; max 72 = bcrypt input limit
  password: z.string().min(8).max(72),
  /**
   * Self-service account type; absent = player. `admin` is deliberately NOT
   * selectable here — admins are minted only by other admins (§8
   * priv-escalation). Owner signups land in an admin approval queue first.
   */
  accountType: z.enum(['player', 'owner']).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** verify-email and reset both carry an emailed one-time token. */
export const tokenSchema = z.object({ token: z.string().min(1) });

export const emailOnlySchema = z.object({ email: z.string().trim().email() });

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(72),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** What the API exposes about a user — passwordHash can never leak through this. */
export interface UserDto {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: 'player' | 'owner' | 'admin';
  emailVerifiedAt: string | null;
  /** Present only while an owner signup is awaiting (or was denied) approval. */
  ownerRequest?: 'pending' | 'rejected';
}
