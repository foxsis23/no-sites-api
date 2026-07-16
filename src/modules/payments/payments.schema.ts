export const createPaymentSchema = {
  body: {
    type: 'object',
    required: ['productId', 'customerEmail', 'customerName', 'customerPhone'],
    properties: {
      productId: { type: 'string', minLength: 1 },
      customerEmail: { type: 'string', format: 'email' },
      customerName: { type: 'string', minLength: 1, maxLength: 255 },
      customerPhone: { type: 'string', minLength: 7, maxLength: 20 },
    },
    additionalProperties: false,
  },
} as const;

// Hutko test checkout — same as create, plus an optional response_url override
// so you can control where the sandbox redirects after payment.
export const createHutkoTestPaymentSchema = {
  body: {
    type: 'object',
    required: ['productId', 'customerEmail', 'customerName', 'customerPhone'],
    properties: {
      productId: { type: 'string', minLength: 1 },
      customerEmail: { type: 'string', format: 'email' },
      customerName: { type: 'string', minLength: 1, maxLength: 255 },
      customerPhone: { type: 'string', minLength: 7, maxLength: 20 },
      responseUrl: { type: 'string', format: 'uri', maxLength: 2048 },
    },
    additionalProperties: false,
  },
} as const;

// LiqPay sends form-encoded body: data=BASE64_JSON&signature=BASE64_SHA1
export const liqpayCallbackSchema = {
  body: {
    type: 'object',
    required: ['data', 'signature'],
    properties: {
      data: { type: 'string' },
      signature: { type: 'string' },
    },
    additionalProperties: false,
  },
} as const;

// Hutko server callback — JSON, keep loose as Hutko sends many extra fields
export const hutkoCallbackSchema = {
  body: {
    type: 'object',
    required: ['order_id', 'order_status', 'signature'],
    properties: {
      order_id: { type: 'string' },
      merchant_id: {},
      order_status: { type: 'string' },
      amount: {},
      currency: { type: 'string' },
      signature: { type: 'string' },
    },
  },
} as const;

// WayForPay webhook body — keep loose as WayForPay may send extra fields
export const webhookSchema = {
  body: {
    type: 'object',
    required: [
      'merchantAccount',
      'orderReference',
      'amount',
      'currency',
      'authCode',
      'cardPan',
      'transactionStatus',
      'reasonCode',
      'merchantSignature',
    ],
    properties: {
      merchantAccount: { type: 'string' },
      orderReference: { type: 'string' },
      amount: {},
      currency: { type: 'string' },
      authCode: { type: 'string' },
      cardPan: { type: 'string' },
      transactionStatus: { type: 'string' },
      reasonCode: {},
      merchantSignature: { type: 'string' },
    },
  },
} as const;
