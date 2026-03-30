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

interface WayForPayConfig {
  merchantAccount: string;
  merchantKey: string;
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
  }

  // 4. Return signed acknowledgment
  return buildWebhookResponse(body.orderReference, time, config.merchantKey);
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
