import Link from "next/link";

import { AppShell } from "../../../components/app-shell";
import { Notice } from "../../../components/notice";
import { StatusPill } from "../../../components/status-pill";
import { prisma } from "../../../lib/db";
import type { Order, Product } from "../../../lib/db-types";
import { OrderStatus } from "../../../lib/db-types";
import { formatDate, formatOrderAmount, getOrderTone } from "../../../lib/order-presenter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type OrderListItem = Order & { product: Product };

const statusFilters = [
  { value: "", label: "Semua" },
  { value: OrderStatus.PENDING, label: "Pending" },
  { value: OrderStatus.PAID, label: "Paid" },
  { value: OrderStatus.EXPIRED, label: "Expired" },
  { value: OrderStatus.FAILED, label: "Failed" },
  { value: OrderStatus.CANCELLED, label: "Cancelled" },
];

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const currentStatus = typeof params.status === "string" ? params.status : "";
  const searchQuery = typeof params.search === "string" ? params.search.toLowerCase().trim() : "";
  const page = Math.max(1, Number.parseInt(typeof params.page === "string" ? params.page : "1", 10) || 1);
  const perPage = 20;

  const where: Record<string, unknown> = {};
  if (currentStatus) {
    where.status = currentStatus;
  }

  const [allOrders, statusCounts] = await Promise.all([
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      where,
      include: { product: true },
    }),
    prisma.order.groupBy({
      by: ["status"],
      _count: true,
    }) as Promise<Array<{ status: string; _count: number }>>,
  ]);

  const filtered = searchQuery
    ? allOrders.filter(
        (o: OrderListItem) =>
          o.referenceId.toLowerCase().includes(searchQuery) ||
          (o.discordUsername || "").toLowerCase().includes(searchQuery) ||
          o.discordUserId.toLowerCase().includes(searchQuery),
      )
    : allOrders;

  const totalPages = Math.ceil(filtered.length / perPage);
  const start = (page - 1) * perPage;
  const pagedOrders = filtered.slice(start, start + perPage);

  const totalCount = statusCounts.reduce((sum, g) => sum + g._count, 0);

  return (
    <AppShell
      title="Orders"
      description="Lihat histori order, status pembayaran, dan akses cepat ke detail delivery."
    >
      <Notice
        message={typeof params.message === "string" ? params.message : undefined}
        error={typeof params.error === "string" ? params.error : undefined}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {statusFilters.map((f) => {
            const count = f.value
              ? statusCounts.find((s) => s.status === f.value)?._count ?? 0
              : totalCount;
            const isActive = currentStatus === f.value;
            const href = `/admin/orders${f.value ? `?status=${f.value}` : ""}${searchQuery ? `${f.value ? "&" : "?"}search=${encodeURIComponent(searchQuery)}` : ""}`;
            return (
              <Link key={f.value || "all"} href={href}>
                <Badge variant={isActive ? "default" : "outline"} className="cursor-pointer">
                  {f.label} ({count})
                </Badge>
              </Link>
            );
          })}
        </div>
        <form className="flex gap-2" method="GET" action="/admin/orders">
          {currentStatus ? <input type="hidden" name="status" value={currentStatus} /> : null}
          <input
            name="search"
            type="text"
            defaultValue={searchQuery}
            placeholder="Cari reference / buyer..."
            className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm shadow-sm outline-none transition-[box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:w-64"
          />
        </form>
      </div>

      {pagedOrders.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center shadow-sm">
          <p className="text-muted-foreground">Tidak ada order{currentStatus ? ` dengan status ${currentStatus}` : ""}.</p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Reference ID</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Buyer</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Product</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Qty</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Amount</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Paid At</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pagedOrders.map((order: OrderListItem) => (
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
                    <td className="p-4 text-xs text-muted-foreground">{formatDate(order.paidAt)}</td>
                    <td className="p-4">
                      <Link href={`/admin/orders/${order.id}`}>
                        <Button variant="outline" size="sm">Detail</Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 ? (
            <div className="flex items-center justify-center gap-2">
              {Array.from({ length: totalPages }, (_, i) => {
                const pageNum = i + 1;
                const href = `/admin/orders?page=${pageNum}${currentStatus ? `&status=${currentStatus}` : ""}${searchQuery ? `&search=${encodeURIComponent(searchQuery)}` : ""}`;
                return (
                  <Link key={pageNum} href={href}>
                    <Button variant={pageNum === page ? "default" : "outline"} size="sm">
                      {pageNum}
                    </Button>
                  </Link>
                );
              })}
            </div>
          ) : null}
        </>
      )}
    </AppShell>
  );
}
