export const uuidParamSchema = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', format: 'uuid' },
  },
  additionalProperties: false,
} as const;

export const successResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {},
  },
  required: ['success'],
} as const;

export const errorResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    error: { type: 'string' },
  },
  required: ['success', 'error'],
} as const;
