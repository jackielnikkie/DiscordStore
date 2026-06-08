import Link from "next/link";
import { AppShell } from "../../components/app-shell";
import { Notice } from "../../components/notice";
import { StatCard } from "../../components/stat-card";
import { StatusPill } from "../../components/status-pill";
import { prisma } from "../../lib/db";
import type { Order, Product } from "../../lib/db-types";
import { formatRupiah } from "../../lib/money";
import { formatDate, formatOrderAmount, getOrderTone } from "../../lib/order-presenter";
import { getDashboardMetrics } from "../../services/productService";
import {
  TrendingUp,
  TrendingDown,
  Package,
  Coins,
  ShoppingCart,
  Clock,
  XCircle,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type DashboardOrder = Order & { product: Product };

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const [metrics, recentOrders, totalOrdersCount] = await Promise.all([
    getDashboardMetrics(),
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { product: true },
    }),
    prisma.order.groupBy({
      by: ["status"],
      _count: true,
    }).then((groups: Array<{ status: string; _count: number }>) =>
      groups.reduce((sum: number, g: { status: string; _count: number }) => sum + g._count, 0)
    ),
  ]);

  const totalPaid = metrics.orderPaid;
  const conversionRate = totalOrdersCount > 0
    ? Math.round((totalPaid / totalOrdersCount) * 100)
    : 0;

  return (
    <AppShell
      title="Dashboard"
      description="Pantau revenue, status order, stok, dan health store Discord dari satu tempat."
    >
      <Notice
        message={typeof params.message === "string" ? params.message : undefined}
        error={typeof params.error === "string" ? params.error : undefined}
      />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4">
        <StatCard
          label="Revenue Hari Ini"
          value={formatRupiah(metrics.revenueToday)}
          icon={<Coins className="size-4 text-muted-foreground" />}
        />
        <StatCard
          label="Revenue Bulan Ini"
          value={formatRupiah(metrics.revenueMonth)}
          icon={<TrendingUp className="size-4 text-emerald-500" />}
        />
        <StatCard
          label="Order Paid"
          value={metrics.orderPaid}
          detail={`${conversionRate}% conversion`}
          icon={<CheckCircle className="size-4 text-emerald-500" />}
        />
        <StatCard
          label="Order Pending"
          value={metrics.orderPending}
          icon={<Clock className="size-4 text-amber-500" />}
        />
        <StatCard
          label="Order Failed"
          value={metrics.orderFailed}
          icon={<XCircle className="size-4 text-red-500" />}
        />
        <StatCard
          label="Produk Aktif"
          value={metrics.totalProductsActive}
          icon={<Package className="size-4 text-muted-foreground" />}
        />
        <StatCard
          label="Produk Habis Stok"
          value={metrics.outOfStockCount}
          detail={metrics.outOfStockCount > 0 ? "Restock dibutuhkan" : undefined}
          icon={<AlertTriangle className="size-4 text-red-500" />}
        />
        <StatCard
          label="Total Stok"
          value={metrics.totalStockAvailable}
          icon={<ShoppingCart className="size-4 text-muted-foreground" />}
        />
      </section>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Order Terbaru</h2>
        <Link href="/admin/orders">
          <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
            Lihat semua <ArrowRight className="size-3" />
          </Button>
        </Link>
      </div>

      {recentOrders.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center shadow-sm">
          <p className="text-sm text-muted-foreground">Belum ada order.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap">Reference ID</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap">Buyer</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap">Product</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap">Qty</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap">Amount</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recentOrders.map((order: DashboardOrder) => (
                <tr key={order.id} className="transition-colors hover:bg-muted/20">
                  <td className="p-4 font-mono text-xs">{order.referenceId}</td>
                  <td className="p-4">
                    <div className="font-medium text-foreground">{order.discordUsername || "-"}</div>
                    <div className="font-mono text-xs text-muted-foreground">{order.discordUserId}</div>
                  </td>
                  <td className="p-4">{order.product.name}</td>
                  <td className="p-4">{order.quantity}</td>
                  <td className="p-4">{formatOrderAmount(order)}</td>
                  <td className="p-4">
                    <StatusPill label={order.status} tone={getOrderTone(order.status)} />
                  </td>
                  <td className="p-4 text-xs text-muted-foreground">{formatDate(order.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
