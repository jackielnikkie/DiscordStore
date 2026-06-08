import Link from "next/link";

import { AppShell } from "../../../components/app-shell";
import { Notice } from "../../../components/notice";
import { StatusPill } from "../../../components/status-pill";
import { prisma } from "../../../lib/db";
import type { Order, Product } from "../../../lib/db-types";
import { OrderStatus } from "../../../lib/db-types";
import { formatDate } from "../../../lib/order-presenter";
import { formatRupiah } from "../../../lib/money";
import { Badge } from "@/components/ui/badge";

type PaymentListItem = Order & { product: Product };

const statusFilters = [
  { value: "", label: "Semua" },
  { value: OrderStatus.PAID, label: "Paid" },
  { value: OrderStatus.PENDING, label: "Pending" },
  { value: OrderStatus.EXPIRED, label: "Expired" },
  { value: OrderStatus.FAILED, label: "Failed" },
];

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const currentStatus = typeof params.status === "string" ? params.status : "";

  const where: Record<string, unknown> = { paymenkuTrxId: { not: null } };
  if (currentStatus) {
    where.status = currentStatus;
  }

  const [payments, statusCounts] = await Promise.all([
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

  const paymentStatuses = [OrderStatus.PAID, OrderStatus.PENDING, OrderStatus.EXPIRED, OrderStatus.FAILED, OrderStatus.CANCELLED, OrderStatus.REFUNDED];

  const totalPayments = statusCounts
    .filter((s) => paymentStatuses.includes(s.status as OrderStatus))
    .reduce((sum, s) => sum + s._count, 0);

  return (
    <AppShell
      title="Payments"
      description="Riwayat payment atau deposit dari order QRIS Paymenku."
    >
      <Notice
        message={typeof params.message === "string" ? params.message : undefined}
        error={typeof params.error === "string" ? params.error : undefined}
      />

      <div className="flex flex-wrap gap-1.5">
        {statusFilters.map((f) => {
          const count = f.value
            ? statusCounts.find((s) => s.status === f.value)?._count ?? 0
            : totalPayments;
          const isActive = currentStatus === f.value;
          const href = `/admin/payments${f.value ? `?status=${f.value}` : ""}`;
          return (
            <Link key={f.value || "all"} href={href}>
              <Badge variant={isActive ? "default" : "outline"} className="cursor-pointer">
                {f.label} ({count})
              </Badge>
            </Link>
          );
        })}
      </div>

      {payments.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center shadow-sm">
          <p className="text-muted-foreground">Tidak ada payment{currentStatus ? ` dengan status ${currentStatus}` : ""}.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">trx_id</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">reference_id</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Buyer</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Channel</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Amount</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Fee</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Sandbox</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payments.map((payment: PaymentListItem) => (
                <tr key={payment.id} className="transition-colors hover:bg-muted/20">
                  <td className="p-4 font-mono text-xs">{payment.paymenkuTrxId || "-"}</td>
                  <td className="p-4 font-mono text-xs">{payment.referenceId}</td>
                  <td className="p-4">
                    <div className="font-medium text-foreground">{payment.discordUsername || "-"}</div>
                    <div className="font-mono text-xs text-muted-foreground">{payment.discordUserId}</div>
                  </td>
                  <td className="p-4">{payment.paymentChannel || "qris"}</td>
                  <td className="p-4">
                    <StatusPill
                      label={payment.status}
                      tone={payment.status === "PAID" ? "success" : payment.status === "PENDING" ? "warning" : "danger"}
                    />
                  </td>
                  <td className="p-4 font-medium">{formatRupiah(payment.paymentAmount ?? 0)}</td>
                  <td className="p-4">{formatRupiah(payment.totalFee ?? 0)}</td>
                  <td className="p-4">
                    <Badge variant="outline">{payment.isSandbox ? "sandbox" : "live"}</Badge>
                  </td>
                  <td className="p-4 text-xs text-muted-foreground">{formatDate(payment.paidAt || payment.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}