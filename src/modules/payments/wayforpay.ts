import { createHmac } from 'crypto';

// --- Types ---

export interface PaymentParams {
  merchantAccount: string;
  merchantDomainName: string;
  orderReference: string;
  orderDate: number;
  amount: string;
  currency: string;
  productName: string;
  productPrice: string;
  productCount: number;
}

export interface WayForPayFormData {
  merchantAccount: string;
  merchantDomainName: string;
  orderReference: string;
  orderDate: number;
  amount: string;
  currency: string;
  productName: string[];
  productPrice: string[];
  productCount: number[];
  merchantSignature: string;
  apiVersion: number;
  language: string;
}

export interface WebhookBody {
  merchantAccount: string;
  orderReference: string;
  amount: string | number;
  currency: string;
  authCode: string;
  cardPan: string;
  transactionStatus: string;
  reasonCode: string | number;
  merchantSignature: string;
  [key: string]: unknown;
}

export interface WebhookResponse {
  orderReference: string;
  status: string;
  time: number;
  signature: string;
}

// --- Helpers ---

function buildSignatureString(fields: string[]): string {
  return fields.join(';');
}

function signHmacMd5(data: string, key: string): string {
  return createHmac('md5', key).update(data, 'utf8').digest('hex');
}

// --- Public API ---

export function buildPaymentSignature(params: PaymentParams, key: string): string {
  // Field order MUST match WayForPay docs exactly
  const sigString = buildSignatureString([
    params.merchantAccount,
    params.merchantDomainName,
    params.orderReference,
    String(params.orderDate),
    params.amount,
    params.currency,
    params.productName,
    String(params.productCount),
    params.productPrice,
  ]);
  return signHmacMd5(sigString, key);
}

export function buildPaymentFormData(
  params: PaymentParams,
  key: string,
): WayForPayFormData {
  const merchantSignature = buildPaymentSignature(params, key);

  return {
    merchantAccount: params.merchantAccount,
    merchantDomainName: params.merchantDomainName,
    orderReference: params.orderReference,
    orderDate: params.orderDate,
    amount: params.amount,
    currency: params.currency,
    productName: [params.productName],
    productPrice: [params.productPrice],
    productCount: [params.productCount],
    merchantSignature,
    apiVersion: 1,
    language: 'UA',
  };
}

export function verifyWebhookSignature(body: WebhookBody, key: string): boolean {
  // Field order MUST match WayForPay docs exactly
  const sigString = buildSignatureString([
    body.merchantAccount,
    body.orderReference,
    String(body.amount),
    body.currency,
    body.authCode,
    body.cardPan,
    body.transactionStatus,
    String(body.reasonCode),
  ]);
  const expected = signHmacMd5(sigString, key);
  return expected === body.merchantSignature;
}

export function buildWebhookResponse(
  orderReference: string,
  time: number,
  key: string,
): WebhookResponse {
  const status = 'accept';
  const sigString = buildSignatureString([orderReference, status, String(time)]);
  const signature = signHmacMd5(sigString, key);

  return { orderReference, status, time, signature };
}
