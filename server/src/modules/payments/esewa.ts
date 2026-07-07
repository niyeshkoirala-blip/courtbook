import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from '../../core/errors.js';
import { config } from '../../core/config.js';

/**
 * eSewa ePay v2 adapter (sandbox: rc-epay.esewa.com.np, public UAT secret).
 * Pure crypto — no outbound calls. The browser POSTs a signed form to eSewa;
 * the success redirect returns ?data=<base64 JSON> which we verify here.
 * Signature spec: HMAC-SHA256 (base64) over "k=v,k=v" of signed_field_names.
 */

function sign(message: string): string {
  return createHmac('sha256', config.esewaSecret).update(message).digest('base64');
}

/** Hidden form fields for the checkout page to POST to eSewa (§2.16). */
export function buildEsewaRedirect(bookingId: string, amountNpr: number) {
  const total = String(amountNpr);
  const message = `total_amount=${total},transaction_uuid=${bookingId},product_code=${config.esewaProductCode}`;
  return {
    url: config.esewaFormUrl,
    fields: {
      amount: total,
      tax_amount: '0',
      total_amount: total,
      transaction_uuid: bookingId, // ties the gateway txn back to our booking
      product_code: config.esewaProductCode,
      product_service_charge: '0',
      product_delivery_charge: '0',
      success_url: `${config.corsOrigins[0]}/book/${bookingId}?gateway=esewa`,
      failure_url: `${config.corsOrigins[0]}/book/${bookingId}?gateway=esewa&failed=1`,
      signed_field_names: 'total_amount,transaction_uuid,product_code',
      signature: sign(message),
    },
  };
}

export interface VerifiedCallback {
  bookingId: string;
  providerTxnId: string;
  /** Amount as reported by the gateway — cross-checked against the booking (§8). */
  amountNpr: number;
  raw: unknown;
}

/** Verifies the base64 `data` payload from eSewa's success redirect. */
export function verifyEsewaCallback(dataB64: string): VerifiedCallback {
  let payload: Record<string, string>;
  try {
    payload = JSON.parse(Buffer.from(dataB64, 'base64').toString('utf-8')) as Record<
      string,
      string
    >;
  } catch {
    throw new AppError('SIGNATURE_INVALID', 400, 'Malformed payment callback');
  }

  const fieldNames = (payload.signed_field_names ?? '').split(',');
  const message = fieldNames.map((f) => `${f}=${payload[f] ?? ''}`).join(',');
  const expected = Buffer.from(sign(message));
  const received = Buffer.from(payload.signature ?? '');
  const signatureOk = expected.length === received.length && timingSafeEqual(expected, received);
  if (!signatureOk || !payload.signature) {
    throw new AppError('SIGNATURE_INVALID', 400, 'Payment signature verification failed');
  }
  if (payload.status !== 'COMPLETE') {
    throw new AppError('PAYMENT_INCOMPLETE', 400, `Payment status is ${payload.status}`);
  }
  return {
    bookingId: payload.transaction_uuid ?? '',
    providerTxnId: `esewa:${payload.transaction_code}`,
    // eSewa formats totals with thousands separators, e.g. "1,500.0"
    amountNpr: Number((payload.total_amount ?? '').replace(/,/g, '')),
    raw: payload,
  };
}
