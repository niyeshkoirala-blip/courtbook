import { z } from 'zod';

/** Payment schemas + DTO (blueprint §4.4 Payments). */

export const PAYMENT_PROVIDERS = ['esewa', 'khalti', 'venue'] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

export const paymentInitiateSchema = z.object({
  bookingId: z.string().regex(/^[0-9a-f]{24}$/),
  provider: z.enum(PAYMENT_PROVIDERS),
});
export type PaymentInitiateInput = z.infer<typeof paymentInitiateSchema>;

/** eSewa v2 success redirect carries ?data=<base64 JSON> — SPA relays it here. */
export const esewaCallbackSchema = z.object({ data: z.string().min(1) });

/** Khalti return_url carries ?pidx=… — server verifies via the lookup API. */
export const khaltiCallbackSchema = z.object({ pidx: z.string().min(1) });

export type PaymentStatus = 'initiated' | 'verified' | 'failed' | 'refund_recorded';

export interface PaymentDto {
  id: string;
  bookingId: string;
  provider: PaymentProvider;
  status: PaymentStatus;
  amount: number; // NPR
}

/** What POST /payments/initiate returns — enough for the SPA to redirect. */
export interface PaymentRedirect {
  paymentId: string;
  provider: PaymentProvider;
  /** Gateway form/redirect target (absent for provider=venue). */
  url?: string;
  /** eSewa: hidden form fields to POST to `url`. */
  fields?: Record<string, string>;
  /** Booking status after initiation — 'confirmed' for pay-at-venue. */
  bookingStatus: string;
}
