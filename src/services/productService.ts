import { ProductType } from "../lib/db-types";

import { prisma } from "../lib/db";
import { slugify } from "../lib/slug";

export type ProductWithStock = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  price: number;
  bulkPriceJson: string | null;
  formatLabel: string | null;
  type: ProductType;
  customText: string | null;
  isActive: boolean;
  sortOrder: number;
  soldCount: number;
  createdAt: string;
  updatedAt: string;
  stocks: Array<{
    id: string;
    productId: string;
    content: string;
    status: string;
    reservedBy: string | null;
    soldOrderId: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  availableStockCount: number;
  reservedStockCount: number;
  soldStockCount: number;
};

export async function listProductsWithStock(): Promise<ProductWithStock[]> {
  const products = await prisma.product.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    include: {
      stocks: true,
    },
  });

  return products.map((product: ProductWithStock) => ({
    ...product,
    availableStockCount: product.stocks.filter((stock) => stock.status === "AVAILABLE")
      .length,
    reservedStockCount: product.stocks.filter((stock) => stock.status === "RESERVED")
      .length,
    soldStockCount: product.stocks.filter((stock) => stock.status === "SOLD").length,
  }));
}

export async function getProductById(id: string): Promise<ProductWithStock | null> {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      stocks: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!product) {
    return null;
  }

  return {
    ...product,
    availableStockCount: product.stocks.filter((stock: { status: string }) => stock.status === "AVAILABLE")
      .length,
    reservedStockCount: product.stocks.filter((stock: { status: string }) => stock.status === "RESERVED")
      .length,
    soldStockCount: product.stocks.filter((stock: { status: string }) => stock.status === "SOLD").length,
  };
}

export async function ensureUniqueSlug(input: {
  name: string;
  slug?: string | null;
  excludeId?: string | null;
}) {
  const base = slugify(input.slug?.trim() || input.name);
  let candidate = base;
  let counter = 2;

  for (;;) {
    const existing = await prisma.product.findUnique({ where: { slug: candidate } });

    if (!existing || existing.id === input.excludeId) {
      return candidate;
    }

    candidate = `${base}-${counter}`;
    counter += 1;
  }
}

export async function getDashboardMetrics() {
  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0,
  );
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

  const [paidToday, paidMonth, orderCounts, products, stockItems] = await Promise.all([
    prisma.order.aggregate({
      _sum: { paymentAmount: true },
      where: { status: "PAID", paidAt: { gte: todayStart } },
    }),
    prisma.order.aggregate({
      _sum: { paymentAmount: true },
      where: { status: "PAID", paidAt: { gte: monthStart } },
    }),
    prisma.order.groupBy({
      by: ["status"],
      _count: true,
    }),
    prisma.product.findMany({
      include: {
        stocks: true,
      },
    }),
    prisma.stockItem.groupBy({
      by: ["status"],
      _count: true,
    }),
  ]);

  const paidCount = orderCounts.find((entry: { status: string; _count: number }) => entry.status === "PAID")?._count || 0;
  const pendingCount =
    orderCounts.find((entry: { status: string; _count: number }) => entry.status === "PENDING")?._count || 0;
  const failedCount =
    (orderCounts.find((entry: { status: string; _count: number }) => entry.status === "FAILED")?._count || 0) +
    (orderCounts.find((entry: { status: string; _count: number }) => entry.status === "EXPIRED")?._count || 0) +
    (orderCounts.find((entry: { status: string; _count: number }) => entry.status === "CANCELLED")?._count || 0);

  const outOfStockCount = products.filter((product: ProductWithStock) => {
    if (product.type === ProductType.CUSTOM_TEXT) {
      return false;
    }

    return !product.stocks.some((stock) => stock.status === "AVAILABLE");
  }).length;

  const totalStockAvailable =
    stockItems.find((entry: { status: string; _count: number }) => entry.status === "AVAILABLE")?._count || 0;

  return {
    revenueToday: paidToday._sum.paymentAmount || 0,
    revenueMonth: paidMonth._sum.paymentAmount || 0,
    orderPaid: paidCount,
    orderPending: pendingCount,
    orderFailed: failedCount,
    totalProductsActive: products.filter((product: ProductWithStock) => product.isActive).length,
    outOfStockCount,
    totalStockAvailable,
  };
}
