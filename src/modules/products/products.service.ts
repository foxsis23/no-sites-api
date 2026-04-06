import type { PrismaClient, Product } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { AppError } from '../../shared/errors/AppError.js';

interface CreateProductData {
  title: string;
  description: string;
  price: string;
  videoUrl?: string;
  isActive?: boolean;
  order: number;
}

interface UpdateProductData {
  title?: string;
  description?: string;
  price?: string;
  videoUrl?: string;
  isActive?: boolean;
  order?: number;
}

export async function listProducts(
  prisma: PrismaClient,
  siteId: string,
  includeInactive = false,
): Promise<Product[]> {
  return prisma.product.findMany({
    where: { siteId, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: { order: 'asc' },
  });
}

export async function getProduct(
  prisma: PrismaClient,
  siteId: string,
  productId: string,
): Promise<Product> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
  });

  if (!product || product.siteId !== siteId) {
    throw new AppError(404, 'Product not found');
  }

  return product;
}

export async function createProduct(
  prisma: PrismaClient,
  siteId: string,
  data: CreateProductData,
): Promise<Product> {
  return prisma.product.create({
    data: {
      site: { connect: { id: siteId } },
      title: data.title,
      description: data.description,
      price: new Prisma.Decimal(data.price),
      videoUrl: data.videoUrl ?? null,
      isActive: data.isActive ?? true,
      order: data.order,
    },
  });
}

export async function updateProduct(
  prisma: PrismaClient,
  siteId: string,
  productId: string,
  data: UpdateProductData,
): Promise<Product> {
  // Verify ownership first
  await getProduct(prisma, siteId, productId);

  return prisma.product.update({
    where: { id: productId },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.price !== undefined && { price: new Prisma.Decimal(data.price) }),
      ...(data.videoUrl !== undefined && { videoUrl: data.videoUrl }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      ...(data.order !== undefined && { order: data.order }),
    },
  });
}

export async function deleteProduct(
  prisma: PrismaClient,
  siteId: string,
  productId: string,
): Promise<Product> {
  // Verify ownership first
  await getProduct(prisma, siteId, productId);

  return prisma.product.update({
    where: { id: productId },
    data: { isActive: false },
  });
}
