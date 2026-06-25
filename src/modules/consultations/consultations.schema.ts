// Mirrors the dropdown options on the finmon.com.ua consultation form.
export const BANK_OPTIONS = [
  'ПриватБанк',
  'Ощадбанк',
  'Monobank',
  'ПУМБ',
  'Райффайзен Банк',
  'Universal Bank',
  'А-Банк',
  'Sense Bank',
  'Інший банк',
] as const;

export const ROLE_OPTIONS = [
  'ФОП',
  'Фізична особа',
  'Юридична особа',
  'Самозайнята особа',
] as const;

export const consultationSchema = {
  body: {
    type: 'object',
    required: ['name', 'phone', 'bank', 'role', 'message'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 200 },
      phone: { type: 'string', minLength: 3, maxLength: 50 },
      bank: { type: 'string', enum: BANK_OPTIONS },
      role: { type: 'string', enum: ROLE_OPTIONS },
      message: { type: 'string', minLength: 1, maxLength: 5000 },
    },
    additionalProperties: false,
  },
} as const;
