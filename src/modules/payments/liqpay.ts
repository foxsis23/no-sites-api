import { createHash } from 'crypto';

export interface LiqPayCallbackData {
  status: string;
  order_id: string;
  product_id: string;
  customer_email: string;
  amount: number;
  [key: string]: unknown;
}

export interface LiqPayCallbackBody {
  data: string;
  signature: string;
}

// LiqPay signature = base64(sha1(privateKey + data + privateKey))
// where `data` is the base64-encoded JSON string (not decoded)
export function verifyLiqPaySignature(
  data: string,
  signature: string,
  privateKey: string,
): boolean {
  const expected = createHash('sha1')
    .update(privateKey + data + privateKey)
    .digest('base64');
  return expected === signature;
}

export function decodeLiqPayData(data: string): LiqPayCallbackData {
  const json = Buffer.from(data, 'base64').toString('utf8');
  return JSON.parse(json) as LiqPayCallbackData;
}
