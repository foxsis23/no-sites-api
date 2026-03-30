export const trackEventSchema = {
  body: {
    type: 'object',
    required: ['event'],
    properties: {
      event: { type: 'string', minLength: 1, maxLength: 100 },
      metadata: { type: 'object' },
    },
    additionalProperties: false,
  },
} as const;

export const summaryQuerySchema = {
  querystring: {
    type: 'object',
    properties: {
      days: { type: 'integer', minimum: 1, maximum: 365, default: 30 },
    },
    additionalProperties: false,
  },
} as const;
