import type { PrismaClient, Order } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { Site } from '@prisma/client';
import { AppError } from '../../shared/errors/AppError.js';
import {
  buildPaymentFormData,
  verifyWebhookSignature,
  buildWebhookResponse,
} from './wayforpay.js';
import type { WebhookBody, WayForPayFormData, WebhookResponse } from './wayforpay.js';
import { verifyLiqPaySignature, decodeLiqPayData } from './liqpay.js';
import type { LiqPayCallbackBody } from './liqpay.js';
import {
  buildCheckoutRequest,
  requestCheckoutUrl,
  verifyCallbackSignature,
} from './hutko.js';
import type { HutkoCallbackBody } from './hutko.js';
import { createSessionInternal } from '../auth/auth.service.js';

interface WayForPayConfig {
  merchantAccount: string;
  merchantKey: string;
}

interface HutkoConfig {
  merchantId: string;
  secretKey: string;
}

// Hutko/Fondy public sandbox merchant. Purchase & verification use the
// `test` secret; p2p credit uses `testcredit`. UAH only.
export const HUTKO_TEST_CONFIG: HutkoConfig = {
  merchantId: '1700002',
  secretKey: 'test',
};

// Default post-payment redirect for the Hutko sandbox (тривога-нет prod home).
export const HUTKO_TEST_RESPONSE_URL = 'https://www.xn--80adds5ajn.net';

interface CreateHutkoOptions {
  // Overrides the response_url the customer is redirected to after payment.
  // Without it the checkout falls back to the site's own domain.
  responseUrl?: string;
}

interface CreateHutkoPaymentResult {
  orderId: string;
  checkoutUrl: string;
}

interface CreatePaymentBody {
  productId: string;
  customerEmail: string;
  customerName: string;
  customerPhone: string;
}

interface CreatePaymentResult {
  orderId: string;
  formData: WayForPayFormData;
}

export async function createPayment(
  prisma: PrismaClient,
  site: Site,
  config: WayForPayConfig,
  body: CreatePaymentBody,
): Promise<CreatePaymentResult> {
  // 1. Fetch and validate product
  const product = await prisma.product.findUnique({
    where: { id: body.productId },
  });

  if (!product || product.siteId !== site.id) {
    throw new AppError(404, 'Product not found');
  }

  if (!product.isActive) {
    throw new AppError(400, 'Product is not available');
  }

  // 2. Create order with PENDING status
  const order = await prisma.order.create({
    data: {
      siteId: site.id,
      productId: product.id,
      customerEmail: body.customerEmail,
      customerName: body.customerName,
      customerPhone: body.customerPhone,
      amount: product.price,
      status: 'PENDING',
    },
  });

  // 3. Build WayForPay form data
  const orderDate = Math.floor(Date.now() / 1000);
  const settings = site.settings as Record<string, unknown>;
  const merchantDomainName =
    typeof settings['merchantDomain'] === 'string'
      ? settings['merchantDomain']
      : site.domain;

  const formData = buildPaymentFormData(
    {
      merchantAccount: config.merchantAccount,
      merchantDomainName,
      orderReference: order.id,
      orderDate,
      amount: product.price.toFixed(2),
      currency: 'UAH',
      productName: product.title,
      productPrice: product.price.toFixed(2),
      productCount: 1,
    },
    config.merchantKey,
  );

  return { orderId: order.id, formData };
}

export async function handleWebhook(
  prisma: PrismaClient,
  config: WayForPayConfig,
  body: WebhookBody,
): Promise<WebhookResponse> {
  const time = Math.floor(Date.now() / 1000);

  // 1. Verify signature
  if (!verifyWebhookSignature(body, config.merchantKey)) {
    throw new AppError(400, 'Invalid webhook signature');
  }

  // 2. Find order by orderReference (= order.id)
  const order = await prisma.order.findUnique({
    where: { id: body.orderReference },
  });

  if (!order) {
    // Return accept to prevent WayForPay retries for unknown orders
    return buildWebhookResponse(body.orderReference, time, config.merchantKey);
  }

  // 3. Idempotency: only update if still PENDING
  if (order.status === 'PENDING') {
    const newStatus: 'PAID' | 'FAILED' =
      body.transactionStatus === 'Approved' ? 'PAID' : 'FAILED';

    await prisma.order.update({
      where: { id: order.id },
      data: {
        status: newStatus,
        wayforpayData: body as unknown as Prisma.InputJsonValue,
      },
    });

    if (newStatus === 'PAID') {
      await createSessionInternal(prisma, order.siteId, order.customerEmail);
    }
  }

  // 4. Return signed acknowledgment
  return buildWebhookResponse(body.orderReference, time, config.merchantKey);
}

export async function handleLiqPayCallback(
  prisma: PrismaClient,
  privateKey: string,
  body: LiqPayCallbackBody,
): Promise<void> {
  // 1. Verify signature
  if (!verifyLiqPaySignature(body.data, body.signature, privateKey)) {
    throw new AppError(400, 'Invalid LiqPay signature');
  }

  // 2. Decode data
  const callbackData = decodeLiqPayData(body.data);

  // 3. Only process successful payments
  if (callbackData.status !== 'success') {
    return;
  }

  // Idempotency: skip if we already processed this order_id
  const existing = await prisma.order.findFirst({
    where: {
      liqpayData: {
        path: ['order_id'],
        equals: callbackData.order_id,
      },
    },
  });
  if (existing) {
    return;
  }

  console.log('LIQPAY CALLBACK DATA:', JSON.stringify(callbackData));

  // 4. Extract product_id and customer_email from info (LiqPay passes custom data via info field)
  const info = (callbackData.info ?? {}) as Record<string, unknown>;
  const productId = callbackData.product_id ?? (info.product_id as string | undefined);
  const customerEmail = callbackData.customer_email ?? (info.customer_email as string | undefined);

  // 5. Find product to resolve site
  const product = await prisma.product.findUnique({
    where: { id: productId },
  });

  if (!product) {
    throw new AppError(404, 'Product not found');
  }

  // 6. Create Order with PAID status
  const order = await prisma.order.create({
    data: {
      siteId: product.siteId,
      productId: product.id,
      customerEmail: customerEmail,
      customerName: '',
      customerPhone: '',
      amount: callbackData.amount,
      status: 'PAID',
      liqpayData: callbackData as unknown as Prisma.InputJsonValue,
    },
  });

  // 7. Create session for the customer
  await createSessionInternal(prisma, order.siteId, customerEmail);
}

export async function createHutkoPayment(
  prisma: PrismaClient,
  site: Site,
  config: HutkoConfig,
  apiBaseUrl: string,
  body: CreatePaymentBody,
  options: CreateHutkoOptions = {},
): Promise<CreateHutkoPaymentResult> {
  // 1. Fetch and validate product
  const product = await prisma.product.findUnique({
    where: { id: body.productId },
  });

  if (!product || product.siteId !== site.id) {
    throw new AppError(404, 'Product not found');
  }

  if (!product.isActive) {
    throw new AppError(400, 'Product is not available');
  }

  // 2. Create order with PENDING status
  const order = await prisma.order.create({
    data: {
      siteId: site.id,
      productId: product.id,
      customerEmail: body.customerEmail,
      customerName: body.customerName,
      customerPhone: body.customerPhone,
      amount: product.price,
      status: 'PENDING',
    },
  });

  // 3. Build Hutko checkout request
  const amountKopiykas = Math.round(Number(product.price) * 100).toString();
  const settings = site.settings as Record<string, unknown>;
  const responseUrl =
    options.responseUrl ??
    (typeof settings['paymentReturnUrl'] === 'string'
      ? settings['paymentReturnUrl']
      : `https://${site.domain}`);

  const request = buildCheckoutRequest(
    {
      merchantId: config.merchantId,
      orderId: order.id,
      amountKopiykas,
      currency: 'UAH',
      orderDesc: product.title,
      responseUrl,
      serverCallbackUrl: `${apiBaseUrl}/payments/hutko-callback`,
    },
    config.secretKey,
  );

  // 4. Request the hosted checkout URL
  const checkoutUrl = await requestCheckoutUrl(request);

  return { orderId: order.id, checkoutUrl };
}

export async function handleHutkoCallback(
  prisma: PrismaClient,
  secret: string,
  body: HutkoCallbackBody,
): Promise<void> {
  // 1. Verify signature
  if (!verifyCallbackSignature(body, secret)) {
    throw new AppError(400, 'Invalid Hutko signature');
  }

  // 2. Find order by order_id (= order.id)
  const order = await prisma.order.findUnique({
    where: { id: body.order_id },
  });

  // Unknown order — accept without side effects to avoid retry storms
  if (!order) {
    return;
  }

  // 3. Idempotency: only act on PENDING orders
  if (order.status !== 'PENDING') {
    return;
  }

  // 4. Map Hutko status. Intermediate statuses (e.g. `processing`) leave the
  //    order PENDING and wait for a terminal callback.
  const terminalStatus = mapHutkoStatus(body.order_status);
  if (!terminalStatus) {
    return;
  }

  await prisma.order.update({
    where: { id: order.id },
    data: {
      status: terminalStatus,
      hutkoData: body as unknown as Prisma.InputJsonValue,
    },
  });

  if (terminalStatus === 'PAID') {
    await createSessionInternal(prisma, order.siteId, order.customerEmail);
  }
}

function mapHutkoStatus(orderStatus: string): 'PAID' | 'FAILED' | null {
  switch (orderStatus) {
    case 'approved':
      return 'PAID';
    case 'declined':
    case 'expired':
    case 'reversed':
      return 'FAILED';
    default:
      return null;
  }
}

export async function getOrdersBysite(
  prisma: PrismaClient,
  siteId: string,
): Promise<Order[]> {
  return prisma.order.findMany({
    where: { siteId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}
