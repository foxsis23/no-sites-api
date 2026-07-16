import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Config } from '../../config.js';
import { resolveSite } from '../../shared/middleware/resolveSite.js';
import { adminAuth } from '../../shared/middleware/adminAuth.js';
import {
  createPaymentSchema,
  createHutkoTestPaymentSchema,
  webhookSchema,
  liqpayCallbackSchema,
  hutkoCallbackSchema,
} from './payments.schema.js';
import {
  createPayment,
  handleWebhook,
  handleLiqPayCallback,
  createHutkoPayment,
  handleHutkoCallback,
  getOrdersBysite,
  HUTKO_TEST_CONFIG,
  HUTKO_TEST_RESPONSE_URL,
} from './payments.service.js';
import type { WebhookBody } from './wayforpay.js';
import type { LiqPayCallbackBody } from './liqpay.js';
import type { HutkoCallbackBody } from './hutko.js';

interface PaymentsRouteOptions {
  config: Config;
}

interface CreatePaymentBody {
  productId: string;
  customerEmail: string;
  customerName: string;
  customerPhone: string;
}

interface CreateHutkoTestBody extends CreatePaymentBody {
  responseUrl?: string;
}

export default async function paymentsRoute(
  fastify: FastifyInstance,
  opts: PaymentsRouteOptions,
): Promise<void> {
  const wfpConfig = {
    merchantAccount: opts.config.wayforpay.merchantAccount,
    merchantKey: opts.config.wayforpay.merchantKey,
  };

  const hutkoConfig = {
    merchantId: opts.config.hutko.merchantId,
    secretKey: opts.config.hutko.secretKey,
  };

  // Parse application/x-www-form-urlencoded for LiqPay callback
  fastify.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_req, body, done) => {
      try {
        const params = new URLSearchParams(body as string);
        done(null, Object.fromEntries(params.entries()));
      } catch (err) {
        done(err as Error);
      }
    },
  );

  // POST /payments/create
  fastify.post<{ Body: CreatePaymentBody }>(
    '/payments/create',
    {
      schema: createPaymentSchema,
      preHandler: [resolveSite],
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request: FastifyRequest<{ Body: CreatePaymentBody }>, reply: FastifyReply) => {
      const result = await createPayment(
        request.server.prisma,
        request.site,
        wfpConfig,
        request.body,
      );
      return reply.status(201).send({ success: true, data: result });
    },
  );

  // POST /payments/webhook (WayForPay callback)
  // Note: WayForPay may not send correct host header.
  // We use a fallback: look up the order by orderReference and load site from it.
  fastify.post<{ Body: WebhookBody }>(
    '/payments/webhook',
    { schema: webhookSchema },
    async (request: FastifyRequest<{ Body: WebhookBody }>, reply: FastifyReply) => {
      const response = await handleWebhook(
        request.server.prisma,
        wfpConfig,
        request.body,
      );
      // WayForPay expects exact JSON format, not our envelope
      return reply.status(200).send(response);
    },
  );

  // POST /payments/liqpay-callback (LiqPay callback — form-encoded)
  fastify.post<{ Body: LiqPayCallbackBody }>(
    '/payments/liqpay-callback',
    { schema: liqpayCallbackSchema },
    async (request: FastifyRequest<{ Body: LiqPayCallbackBody }>, reply: FastifyReply) => {
      await handleLiqPayCallback(
        request.server.prisma,
        opts.config.liqpay.privateKey,
        request.body,
      );
      return reply.status(200).send({ success: true });
    },
  );

  // POST /payments/hutko/create (Hutko hosted checkout — returns redirect URL)
  fastify.post<{ Body: CreatePaymentBody }>(
    '/payments/hutko/create',
    {
      schema: createPaymentSchema,
      preHandler: [resolveSite],
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request: FastifyRequest<{ Body: CreatePaymentBody }>, reply: FastifyReply) => {
      const result = await createHutkoPayment(
        request.server.prisma,
        request.site,
        hutkoConfig,
        opts.config.apiBaseUrl,
        request.body,
      );
      return reply.status(201).send({ success: true, data: result });
    },
  );

  // POST /payments/hutko/test (Hutko SANDBOX checkout — test merchant 1700002)
  // Uses the public Hutko/Fondy test merchant, NOT production credentials.
  // Pass `responseUrl` in the body to control the post-payment redirect.
  fastify.post<{ Body: CreateHutkoTestBody }>(
    '/payments/hutko/test',
    {
      schema: createHutkoTestPaymentSchema,
      preHandler: [resolveSite],
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request: FastifyRequest<{ Body: CreateHutkoTestBody }>, reply: FastifyReply) => {
      const { responseUrl, ...paymentBody } = request.body;
      const result = await createHutkoPayment(
        request.server.prisma,
        request.site,
        HUTKO_TEST_CONFIG,
        opts.config.apiBaseUrl,
        paymentBody,
        { responseUrl: responseUrl ?? HUTKO_TEST_RESPONSE_URL },
      );
      return reply.status(201).send({ success: true, data: result });
    },
  );

  // POST /payments/hutko-callback (Hutko server callback — JSON)
  fastify.post<{ Body: HutkoCallbackBody }>(
    '/payments/hutko-callback',
    { schema: hutkoCallbackSchema },
    async (request: FastifyRequest<{ Body: HutkoCallbackBody }>, reply: FastifyReply) => {
      await handleHutkoCallback(
        request.server.prisma,
        hutkoConfig.secretKey,
        request.body,
      );
      return reply.status(200).send({ success: true });
    },
  );

  // GET /payments/orders (admin — view orders for site)
  fastify.get(
    '/payments/orders',
    { preHandler: [resolveSite, adminAuth] },
    async (request: FastifyRequest, _reply: FastifyReply) => {
      const orders = await getOrdersBysite(request.server.prisma, request.site.id);
      return { success: true, data: orders };
    },
  );
}
