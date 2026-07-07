import { AppError } from '../../core/errors.js';
import { config } from '../../core/config.js';
import type { VerifiedCallback } from './esewa.js';

/**
 * Khalti ePayment adapter (sandbox: dev.khalti.com). Unlike eSewa this is
 * API-driven: initiate returns a hosted payment_url; verification is a
 * server-side lookup by pidx — the lookup response (not the redirect) is the
 * source of truth (§8). Amounts are in paisa.
 */

function requireKey(): string {
  if (!config.khaltiSecret) {
    throw new AppError('NOT_CONFIGURED', 501, 'Khalti payments are not configured on this server');
  }
  return config.khaltiSecret;
}

async function khaltiPost(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${config.khaltiApiUrl}${path}`, {
    method: 'POST',
    headers: { Authorization: `Key ${requireKey()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new AppError('GATEWAY_ERROR', 502, 'Khalti request failed', json);
  }
  return json;
}

/** Creates a Khalti payment session → hosted payment_url + pidx. */
export async function initiateKhalti(
  bookingId: string,
  amountNpr: number,
  productName: string,
): Promise<{ url: string; pidx: string }> {
  const json = await khaltiPost('/epayment/initiate/', {
    return_url: `${config.corsOrigins[0]}/book/${bookingId}?gateway=khalti`,
    website_url: config.corsOrigins[0],
    amount: amountNpr * 100, // paisa
    purchase_order_id: bookingId,
    purchase_order_name: productName,
  });
  return { url: String(json.payment_url), pidx: String(json.pidx) };
}

/** Verifies a pidx via the lookup API — must be Completed with the right amount. */
export async function verifyKhaltiCallback(pidx: string): Promise<VerifiedCallback> {
  const json = await khaltiPost('/epayment/lookup/', { pidx });
  if (json.status !== 'Completed') {
    throw new AppError('PAYMENT_INCOMPLETE', 400, `Payment status is ${String(json.status)}`);
  }
  return {
    bookingId: String(json.purchase_order_id ?? ''),
    providerTxnId: `khalti:${pidx}`,
    amountNpr: Number(json.total_amount) / 100, // paisa → NPR
    raw: json,
  };
}
