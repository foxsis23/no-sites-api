import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';

async function corsPlugin(fastify: FastifyInstance): Promise<void> {
  await fastify.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key', 'x-forwarded-host'],
    credentials: true,
  });
}

export default fp(corsPlugin, { name: 'cors' });
