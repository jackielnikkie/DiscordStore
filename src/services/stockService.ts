import { ProductType, StockStatus } from "../lib/db-types";

import { prisma } from "../lib/db";

export async function getAvailableStockCount(productId: string) {
  return prisma.stockItem.count({
    where: {
      productId,
      status: StockStatus.AVAILABLE,
    },
  });
}

export async function reserveStock(
  productId: string,
  quantity: number,
  orderId: string,
) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { type: true },
  });

  if (!product) {
    throw new Error("Produk tidak ditemukan");
  }

  if (product.type === ProductType.CUSTOM_TEXT) {
    return [];
  }

  return prisma.$transaction(async (tx: typeof prisma) => {
    const available = await tx.stockItem.findMany({
      where: {
        productId,
        status: StockStatus.AVAILABLE,
      },
      orderBy: { createdAt: "asc" },
      take: quantity,
    });

    if (available.length < quantity) {
      throw new Error("Stok tidak cukup");
    }

    for (const stock of available) {
      await tx.stockItem.update({
        where: { id: stock.id },
        data: {
          status: StockStatus.RESERVED,
          reservedBy: orderId,
        },
      });
    }

    return available;
  });
}

export async function releaseReservedStock(orderId: string) {
  await prisma.stockItem.updateMany({
    where: {
      reservedBy: orderId,
      status: StockStatus.RESERVED,
    },
    data: {
      status: StockStatus.AVAILABLE,
      reservedBy: null,
    },
  });
}

export async function markReservedStockSold(orderId: string) {
  return prisma.$transaction(async (tx: typeof prisma) => {
    const reserved = await tx.stockItem.findMany({
      where: {
        reservedBy: orderId,
        status: StockStatus.RESERVED,
      },
      orderBy: { createdAt: "asc" },
    });

    for (const stock of reserved) {
      await tx.stockItem.update({
        where: { id: stock.id },
        data: {
          status: StockStatus.SOLD,
          reservedBy: null,
          soldOrderId: orderId,
        },
      });
    }

    return reserved;
  });
}
