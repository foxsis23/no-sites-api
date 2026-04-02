export const createSessionSchema = {
  body: {
    type: 'object',
    required: ['email'],
    properties: {
      email: { type: 'string', format: 'email', minLength: 1 },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            session_token: { type: 'string' },
            expires_at: { type: 'string' },
            productIds: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  },
} as const;
