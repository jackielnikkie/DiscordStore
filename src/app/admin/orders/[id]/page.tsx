import type { StockItem } from "../../../../lib/db-types";

import { notFound } from "next/navigation";

import { AppShell } from "../../../../components/app-shell";
import { Notice } from "../../../../components/notice";
import { StatusPill } from "../../../../components/status-pill";
import { prisma } from "../../../../lib/db";
import { formatDate, formatOrderAmount, getOrderTone } from "../../../../lib/order-presenter";
import { formatRupiah } from "../../../../lib/money";
import { cancelOrderAction, checkPaymentAction, markPaidAction, resendOrderAction } from "../../actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Copy } from "lucide-react";

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const order = await prisma.order.findUnique({
    where: { id },
    include: { product: true, soldStocks: true, reservedStocks: true },
  });

  if (!order) {
    notFound();
  }

  const stockLines = order.soldStocks.length > 0 ? order.soldStocks : order.reservedStocks;
  const hasPayment = !!(order.paymenkuTrxId || order.paymenkuPayUrl);

  return (
    <AppShell
      title={`Order ${order.referenceId}`}
      description="Inspect payment detail, stok terkirim, dan aksi manual."
    >
      <Notice message={typeof query.message === "string" ? query.message : undefined} error={typeof query.error === "string" ? query.error : undefined} />

      <div className="grid gap-5 xl:grid-cols-[1fr_0.9fr]">
        <Card>
          <CardHeader><CardTitle>Order Detail</CardTitle></CardHeader>
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <StatusPill label={order.status} tone={getOrderTone(order.status)} />
              <StatusPill label={order.deliveredAt ? "Delivered" : "Not Delivered"} tone={order.deliveredAt ? "success" : "warning"} />
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[600px] grid gap-2 text-sm md:grid-cols-2">
                <p><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Order ID:</span> <code className="text-xs">{order.id}</code></p>
                <p><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Reference ID:</span> <code className="text-xs">{order.referenceId}</code></p>
                <p><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Discord User:</span> <span className="font-medium">{order.discordUsername || "-"}</span> ({order.discordUserId})</p>
                <p><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Product:</span> <span className="font-medium">{order.product.name}</span></p>
                <p><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Quantity:</span> {order.quantity}</p>
                <p><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Amount:</span> <span className="font-medium">{formatOrderAmount(order)}</span></p>
                <p><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Created:</span> {formatDate(order.createdAt)}</p>
                <p><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Paid At:</span> {formatDate(order.paidAt)}</p>
                <p><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Delivered At:</span> {formatDate(order.deliveredAt)}</p>
                <p><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Expires At:</span> {formatDate(order.expiresAt)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
          <CardContent className="space-y-3 p-4">
            <form action={resendOrderAction}><input type="hidden" name="orderId" value={order.id}/><input type="hidden" name="redirectTo" value={`/admin/orders/${order.id}`}/><Button type="submit" className="w-full">Resend DM Delivery</Button></form>
            <form action={checkPaymentAction}><input type="hidden" name="orderId" value={order.id}/><input type="hidden" name="redirectTo" value={`/admin/orders/${order.id}`}/><Button variant="secondary" type="submit" className="w-full">Check Payment Status</Button></form>
            <form action={markPaidAction}><input type="hidden" name="orderId" value={order.id}/><input type="hidden" name="redirectTo" value={`/admin/orders/${order.id}`}/><Button variant="secondary" type="submit" className="w-full">Mark Paid Manual</Button></form>
            <form action={cancelOrderAction}><input type="hidden" name="orderId" value={order.id}/><input type="hidden" name="redirectTo" value={`/admin/orders/${order.id}`}/><Button variant="destructive" type="submit" className="w-full">Cancel Order</Button></form>
          </CardContent>
        </Card>
      </div>

      {hasPayment ? (
        <Card className="mt-6">
          <CardHeader><CardTitle>Payment Info — Paymenku</CardTitle></CardHeader>
          <CardContent className="p-4">
            <div className="grid gap-2 text-sm md:grid-cols-2">
              {order.paymenkuTrxId ? (
                <p><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Trx ID:</span> <code className="text-xs">{order.paymenkuTrxId}</code></p>
              ) : null}
              <p><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Channel:</span> {order.paymentChannel || "qris"}</p>
              <p><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Fee:</span> {formatRupiah(order.totalFee ?? 0)}</p>
              <p><span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Amount Received:</span> {formatRupiah(order.amountReceived ?? 0)}</p>
              <p>
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Mode:</span>{" "}
                <Badge variant="outline">{order.isSandbox ? "Sandbox" : order.isSandbox === false ? "Live" : "Unknown"}</Badge>
              </p>
              {order.paymenkuPayUrl ? (
                <p className="md:col-span-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Pay URL:</span>{" "}
                  <a href={order.paymenkuPayUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline break-all">
                    {order.paymenkuPayUrl} <ExternalLink className="size-3" />
                  </a>
                </p>
              ) : null}
              {order.paymenkuQrUrl ? (
                <p className="md:col-span-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">QR URL:</span>{" "}
                  <a href={order.paymenkuQrUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline break-all">
                    {order.paymenkuQrUrl} <ExternalLink className="size-3" />
                  </a>
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="mt-6">
        <CardHeader><CardTitle>Stock Items</CardTitle></CardHeader>
        <CardContent className="space-y-2 p-4">
          {stockLines.length > 0 ? (
            stockLines.map((stock: StockItem) => (
              <pre key={stock.id} className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs break-all whitespace-pre-wrap">
                {stock.content}
              </pre>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Belum ada stok yang tercatat.</p>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
