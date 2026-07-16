import { createHash } from 'crypto';
import { AppError } from '../../shared/errors/AppError.js';

// --- Constants ---

const HUTKO_CHECKOUT_URL = 'https://pay.hutko.org/api/checkout/url/';

// --- Types ---

export interface HutkoCheckoutParams {
  merchantId: string;
  orderId: string;
  amountKopiykas: string;
  currency: string;
  orderDesc: string;
  responseUrl: string;
  serverCallbackUrl: string;
}

export type HutkoCheckoutRequest = Record<string, string>;

export interface HutkoCallbackBody {
  order_id: string;
  merchant_id: string;
  order_status: string;
  amount: string | number;
  currency: string;
  signature: string;
  [key: string]: unknown;
}

interface HutkoApiResponse {
  response?: {
    checkout_url?: string;
    error_code?: number;
    error_message?: string;
    request_id?: string;
  };
}

// --- Signature ---

// Matches the official hutko-service/node-js-sdk `genSignature` (protocol 1.0):
// sha1( secret + "|" + <non-empty param values, keys sorted, excluding
// `signature` and `response_signature_string`, joined by "|"> ) as lowercase hex.
export function genSignature(
  data: Record<string, unknown>,
  secret: string,
): string {
  const values = Object.keys(data)
    .sort()
    .filter(
      (key) =>
        key !== 'signature' &&
        key !== 'response_signature_string' &&
        data[key] !== '' &&
        data[key] !== undefined &&
        data[key] !== null,
    )
    .map((key) => String(data[key]));

  const signString = `${secret}|${values.join('|')}`;
  return createHash('sha1').update(signString, 'utf8').digest('hex');
}

// --- Public API ---

export function buildCheckoutRequest(
  params: HutkoCheckoutParams,
  secret: string,
): HutkoCheckoutRequest {
  const request: HutkoCheckoutRequest = {
    merchant_id: params.merchantId,
    order_id: params.orderId,
    order_desc: params.orderDesc,
    currency: params.currency,
    amount: params.amountKopiykas,
    response_url: params.responseUrl,
    server_callback_url: params.serverCallbackUrl,
  };
  request['signature'] = genSignature(request, secret);
  return request;
}

export async function requestCheckoutUrl(
  request: HutkoCheckoutRequest,
): Promise<string> {
  let payload: HutkoApiResponse;
  try {
    const res = await fetch(HUTKO_CHECKOUT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ request }),
    });
    payload = (await res.json()) as HutkoApiResponse;
  } catch {
    throw new AppError(502, 'Hutko checkout request failed');
  }

  const response = payload.response;
  if (!response || response.error_code || !response.checkout_url) {
    const message = response?.error_message ?? 'no checkout_url returned';
    throw new AppError(502, `Hutko checkout failed: ${message}`);
  }

  return response.checkout_url;
}

export function verifyCallbackSignature(
  body: HutkoCallbackBody,
  secret: string,
): boolean {
  const expected = genSignature(body, secret);
  return expected === body.signature;
}
