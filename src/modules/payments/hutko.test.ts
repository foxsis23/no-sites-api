import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  genSignature,
  buildCheckoutRequest,
  verifyCallbackSignature,
  requestCheckoutUrl,
} from './hutko.js';
import type { HutkoCallbackBody } from './hutko.js';

const SECRET = 'test';

const checkoutParams = {
  merchantId: '1700002',
  orderId: 'ord-123',
  amountKopiykas: '1000',
  currency: 'UAH',
  orderDesc: 'Product X',
  responseUrl: 'https://www.xn--80adds5ajn.net/',
  serverCallbackUrl: 'https://api.example.com/payments/hutko-callback',
};

describe('genSignature', () => {
  it('computes sha1 over secret + sorted non-empty values', () => {
    const req = {
      merchant_id: '1700002',
      order_id: 'ord-123',
      order_desc: 'Product X',
      currency: 'UAH',
      amount: '1000',
      response_url: 'https://www.xn--80adds5ajn.net/',
      server_callback_url: 'https://api.example.com/payments/hutko-callback',
    };
    expect(genSignature(req, SECRET)).toBe(
      '0b5e137afe5a5a06285565cb4d59121f8b3165d1',
    );
  });

  it('excludes empty values and the signature key', () => {
    const withEmpty = {
      merchant_id: '1700002',
      order_id: 'ord-123',
      order_desc: 'Product X',
      currency: 'UAH',
      amount: '1000',
      response_url: 'https://www.xn--80adds5ajn.net/',
      server_callback_url: 'https://api.example.com/payments/hutko-callback',
      response_signature_string: 'ignored',
      empty: '',
      signature: 'ignored',
    };
    expect(genSignature(withEmpty, SECRET)).toBe(
      '0b5e137afe5a5a06285565cb4d59121f8b3165d1',
    );
  });
});

describe('buildCheckoutRequest', () => {
  it('builds a flat request with a valid signature', () => {
    const req = buildCheckoutRequest(checkoutParams, SECRET);
    expect(req).toMatchObject({
      merchant_id: '1700002',
      order_id: 'ord-123',
      order_desc: 'Product X',
      currency: 'UAH',
      amount: '1000',
      response_url: 'https://www.xn--80adds5ajn.net/',
      server_callback_url: 'https://api.example.com/payments/hutko-callback',
      signature: '0b5e137afe5a5a06285565cb4d59121f8b3165d1',
    });
  });
});

describe('verifyCallbackSignature', () => {
  const validBody: HutkoCallbackBody = {
    order_id: 'ord-123',
    merchant_id: '1700002',
    order_status: 'approved',
    amount: '1000',
    currency: 'UAH',
    signature: '2bac2c6bef48f4d1e6ea637f2eadde9d95e50ab3',
  };

  it('returns true for a correctly signed body', () => {
    expect(verifyCallbackSignature(validBody, SECRET)).toBe(true);
  });

  it('returns false when the body is tampered', () => {
    const tampered = { ...validBody, amount: '9999' };
    expect(verifyCallbackSignature(tampered, SECRET)).toBe(false);
  });

  it('returns false when the signature is wrong', () => {
    const bad = { ...validBody, signature: 'deadbeef' };
    expect(verifyCallbackSignature(bad, SECRET)).toBe(false);
  });
});

describe('requestCheckoutUrl', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns checkout_url from a successful response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ response: { checkout_url: 'https://pay.hutko.org/x' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const req = buildCheckoutRequest(checkoutParams, SECRET);
    const url = await requestCheckoutUrl(req);

    expect(url).toBe('https://pay.hutko.org/x');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://pay.hutko.org/api/checkout/url/',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws on a Hutko error response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          response: { error_code: 1017, error_message: 'invalid signature' },
        }),
      }),
    );
    const req = buildCheckoutRequest(checkoutParams, SECRET);
    await expect(requestCheckoutUrl(req)).rejects.toThrow(/Hutko/);
  });

  it('throws when checkout_url is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ json: async () => ({ response: {} }) }),
    );
    const req = buildCheckoutRequest(checkoutParams, SECRET);
    await expect(requestCheckoutUrl(req)).rejects.toThrow(/Hutko/);
  });
});
