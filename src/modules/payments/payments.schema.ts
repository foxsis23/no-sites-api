export const createPaymentSchema = {
  body: {
    type: 'object',
    required: ['productId', 'customerEmail', 'customerName', 'customerPhone'],
    properties: {
      productId: { type: 'string', format: 'uuid' },
      customerEmail: { type: 'string', format: 'email' },
      customerName: { type: 'string', minLength: 1, maxLength: 255 },
      customerPhone: { type: 'string', minLength: 7, maxLength: 20 },
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
