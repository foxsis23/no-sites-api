import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Config } from '../../config.js';
import { resolveSite } from '../../shared/middleware/resolveSite.js';
import { adminAuth } from '../../shared/middleware/adminAuth.js';
import {
  createProductSchema,
  updateProductSchema,
  productIdParamSchema,
} from './products.schema.js';
import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
} from './products.service.js';

interface ProductsRouteOptions {
  config: Config;
}

interface IdParam {
  id: string;
}

interface CreateBody {
  title: string;
  description: string;
  price: string;
  videoUrl?: string;
  isActive?: boolean;
  order: number;
}

interface UpdateBody {
  title?: string;
  description?: string;
  price?: string;
  videoUrl?: string;
  isActive?: boolean;
  order?: number;
}

export default async function productsRoute(
  fastify: FastifyInstance,
  _opts: ProductsRouteOptions,
): Promise<void> {
  // GET /products
  fastify.get<{ Querystring: { includeInactive?: string | boolean } }>(
    '/products',
    { preHandler: [resolveSite] },
    async (request, _reply: FastifyReply) => {
      const raw = request.query.includeInactive;
      const includeInactive = raw === true || raw === 'true' || raw === '1';
      const products = await listProducts(
        request.server.prisma,
        request.site.id,
        includeInactive,
      );
      return { success: true, data: products };
    },
  );

  // GET /products/:id
  fastify.get<{ Params: IdParam }>(
    '/products/:id',
    { schema: productIdParamSchema, preHandler: [resolveSite] },
    async (request, _reply) => {
      const product = await getProduct(
        request.server.prisma,
        request.site.id,
        request.params.id,
      );
      return { success: true, data: product };
    },
  );

  // POST /products (admin)
  fastify.post<{ Body: CreateBody }>(
    '/products',
    { schema: createProductSchema, preHandler: [resolveSite, adminAuth] },
    async (request, reply) => {
      const product = await createProduct(
        request.server.prisma,
        request.site.id,
        request.body,
      );
      return reply.status(201).send({ success: true, data: product });
    },
  );

  // PATCH /products/:id (admin)
  fastify.patch<{ Params: IdParam; Body: UpdateBody }>(
    '/products/:id',
    { schema: updateProductSchema, preHandler: [resolveSite, adminAuth] },
    async (request, _reply) => {
      const product = await updateProduct(
        request.server.prisma,
        request.site.id,
        request.params.id,
        request.body,
      );
      return { success: true, data: product };
    },
  );

  // DELETE /products/:id (admin, soft delete)
  fastify.delete<{ Params: IdParam }>(
    '/products/:id',
    { schema: productIdParamSchema, preHandler: [resolveSite, adminAuth] },
    async (request, _reply) => {
      const product = await deleteProduct(
        request.server.prisma,
        request.site.id,
        request.params.id,
      );
      return { success: true, data: product };
    },
  );
}
