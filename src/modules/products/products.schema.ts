export const createProductSchema = {
  body: {
    type: 'object',
    required: ['title', 'description', 'price', 'order'],
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 255 },
      description: { type: 'string', minLength: 1 },
      price: { type: 'string', pattern: '^\\d+(\\.\\d{1,2})?$' },
      videoUrl: { type: 'string', format: 'uri' },
      isActive: { type: 'boolean' },
      order: { type: 'integer', minimum: 0 },
    },
    additionalProperties: false,
  },
} as const;

export const updateProductSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid' },
    },
    additionalProperties: false,
  },
  body: {
    type: 'object',
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 255 },
      description: { type: 'string', minLength: 1 },
      price: { type: 'string', pattern: '^\\d+(\\.\\d{1,2})?$' },
      videoUrl: { type: 'string', format: 'uri' },
      isActive: { type: 'boolean' },
      order: { type: 'integer', minimum: 0 },
    },
    additionalProperties: false,
    minProperties: 1,
  },
} as const;

export const productIdParamSchema = {
  params: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string', format: 'uuid' },
    },
    additionalProperties: false,
  },
} as const;
