import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PrismaClient, Site } from '@prisma/client';
import { createHutkoPayment, handleHutkoCallback } from './payments.service.js';
import { genSignature } from './hutko.js';
import type { HutkoCallbackBody } from './hutko.js';
import { createSessionInternal } from '../auth/auth.service.js';

vi.mock('../auth/auth.service.js', () => ({
  createSessionInternal: vi.fn().mockResolvedValue({}),
}));

const SECRET = 'test-secret';
const MERCHANT_ID = '1700002';
const API_BASE_URL = 'https://api.example.com';

const site = {
  id: 'site-1',
  domain: 'www.xn--80adds5ajn.net',
  name: 'тривога-нет',
  settings: {},
  createdAt: new Date(),
} as unknown as Site;

const activeProduct = {
  id: 'prod-1',
  siteId: 'site-1',
  title: 'Product X',
  price: { toString: () => '10.00' } as unknown,
  isActive: true,
};

const body = {
  productId: 'prod-1',
  customerEmail: 'buyer@example.com',
  customerName: 'Buyer',
  customerPhone: '+380001112233',
};

function makePrisma(overrides: Record<string, unknown> = {}): PrismaClient {
  return {
    product: { findUnique: vi.fn().mockResolvedValue(activeProduct) },
    order: {
      create: vi.fn().mockResolvedValue({ id: 'order-1', siteId: 'site-1' }),
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    ...overrides,
  } as unknown as PrismaClient;
}

const hutkoConfig = { merchantId: MERCHANT_ID, secretKey: SECRET };

describe('createHutkoPayment', () => {
  afterEach(() => vi.restoreAllMocks());

  it('creates a PENDING order and returns the checkout URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ response: { checkout_url: 'https://pay.hutko.org/abc' } }),
      }),
    );
    const prisma = makePrisma();

    const result = await createHutkoPayment(prisma, site, hutkoConfig, API_BASE_URL, body);

    expect(result).toEqual({ orderId: 'order-1', checkoutUrl: 'https://pay.hutko.org/abc' });
    expect(prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING' }) }),
    );
  });

  it('sends amount in kopiykas and the callback URL to Hutko', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ response: { checkout_url: 'https://pay.hutko.org/abc' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await createHutkoPayment(makePrisma(), site, hutkoConfig, API_BASE_URL, body);

    const call = fetchMock.mock.calls[0] as [string, { body: string }];
    const sent = JSON.parse(call[1].body).request;
    expect(sent.amount).toBe('1000');
    expect(sent.server_callback_url).toBe('https://api.example.com/payments/hutko-callback');
    expect(sent.response_url).toBe('https://www.xn--80adds5ajn.net');
  });

  it('uses an explicit responseUrl override when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ response: { checkout_url: 'https://pay.hutko.org/abc' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await createHutkoPayment(makePrisma(), site, hutkoConfig, API_BASE_URL, body, {
      responseUrl: 'https://example.test/thanks',
    });

    const call = fetchMock.mock.calls[0] as [string, { body: string }];
    const sent = JSON.parse(call[1].body).request;
    expect(sent.response_url).toBe('https://example.test/thanks');
  });

  it('rejects a product from another site', async () => {
    const prisma = makePrisma({
      product: { findUnique: vi.fn().mockResolvedValue({ ...activeProduct, siteId: 'other' }) },
    });
    await expect(
      createHutkoPayment(prisma, site, hutkoConfig, API_BASE_URL, body),
    ).rejects.toThrow(/not found/i);
  });

  it('rejects an inactive product', async () => {
    const prisma = makePrisma({
      product: { findUnique: vi.fn().mockResolvedValue({ ...activeProduct, isActive: false }) },
    });
    await expect(
      createHutkoPayment(prisma, site, hutkoConfig, API_BASE_URL, body),
    ).rejects.toThrow(/not available/i);
  });

  it('throws when Hutko returns an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ response: { error_code: 1017, error_message: 'bad sig' } }),
      }),
    );
    await expect(
      createHutkoPayment(makePrisma(), site, hutkoConfig, API_BASE_URL, body),
    ).rejects.toThrow(/Hutko/);
  });
});

function signedCallback(fields: Record<string, string>): HutkoCallbackBody {
  const base = {
    order_id: 'order-1',
    merchant_id: MERCHANT_ID,
    amount: '1000',
    currency: 'UAH',
    ...fields,
  } as Record<string, string>;
  return { ...base, signature: genSignature(base, SECRET) } as HutkoCallbackBody;
}

describe('handleHutkoCallback', () => {
  beforeEach(() => {
    vi.mocked(createSessionInternal).mockClear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('rejects an invalid signature', async () => {
    const prisma = makePrisma();
    const bad = { ...signedCallback({ order_status: 'approved' }), signature: 'bad' };
    await expect(handleHutkoCallback(prisma, SECRET, bad)).rejects.toThrow(/signature/i);
  });

  it('marks the order PAID and creates a session on approved', async () => {
    const prisma = makePrisma({
      order: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'order-1',
          siteId: 'site-1',
          customerEmail: 'buyer@example.com',
          status: 'PENDING',
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    });

    await handleHutkoCallback(prisma, SECRET, signedCallback({ order_status: 'approved' }));

    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PAID' }) }),
    );
    expect(createSessionInternal).toHaveBeenCalledWith(
      prisma,
      'site-1',
      'buyer@example.com',
    );
  });

  it('marks the order FAILED on declined without a session', async () => {
    const prisma = makePrisma({
      order: {
        findUnique: vi.fn().mockResolvedValue({ id: 'order-1', siteId: 'site-1', status: 'PENDING' }),
        update: vi.fn().mockResolvedValue({}),
      },
    });

    await handleHutkoCallback(prisma, SECRET, signedCallback({ order_status: 'declined' }));

    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }),
    );
    expect(createSessionInternal).not.toHaveBeenCalled();
  });

  it('leaves the order PENDING on processing', async () => {
    const update = vi.fn();
    const prisma = makePrisma({
      order: {
        findUnique: vi.fn().mockResolvedValue({ id: 'order-1', siteId: 'site-1', status: 'PENDING' }),
        update,
      },
    });

    await handleHutkoCallback(prisma, SECRET, signedCallback({ order_status: 'processing' }));

    expect(update).not.toHaveBeenCalled();
  });

  it('is idempotent for an already PAID order', async () => {
    const update = vi.fn();
    const prisma = makePrisma({
      order: {
        findUnique: vi.fn().mockResolvedValue({ id: 'order-1', siteId: 'site-1', status: 'PAID' }),
        update,
      },
    });

    await handleHutkoCallback(prisma, SECRET, signedCallback({ order_status: 'approved' }));

    expect(update).not.toHaveBeenCalled();
    expect(createSessionInternal).not.toHaveBeenCalled();
  });

  it('is a no-op for an unknown order', async () => {
    const prisma = makePrisma({
      order: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() },
    });
    await expect(
      handleHutkoCallback(prisma, SECRET, signedCallback({ order_status: 'approved' })),
    ).resolves.toBeUndefined();
  });
});
