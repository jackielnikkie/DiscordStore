import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { Notice } from "@/components/notice";
import { StatusPill } from "@/components/status-pill";
import type { StockStatus } from "@/lib/db-types";
import { formatDate, getStockTone } from "@/lib/order-presenter";
import { getProductById } from "@/services/productService";
import { addStockAction, deleteStockAction, importStockAction } from "../../../actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export default async function ProductStockPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const product = await getProductById(id);

  if (!product) {
    notFound();
  }

  return (
    <AppShell
      title={`Stock • ${product.name}`}
      description="Tambah, import, dan hapus stok line untuk produk digital."
    >
      <Notice
        message={typeof query.message === "string" ? query.message : undefined}
        error={typeof query.error === "string" ? query.error : undefined}
      />

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Tambah Stok</CardTitle></CardHeader>
          <CardContent>
            <form action={addStockAction} className="space-y-3">
              <input type="hidden" name="productId" value={product.id} />
              <input type="hidden" name="redirectTo" value={`/admin/products/${product.id}/stock`} />
              <Textarea name="content" required placeholder="email|password|accessmail" />
              <Button type="submit">Tambah Stok</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Bulk Import</CardTitle></CardHeader>
          <CardContent>
            <form action={importStockAction} className="space-y-3">
              <input type="hidden" name="productId" value={product.id} />
              <input type="hidden" name="redirectTo" value={`/admin/products/${product.id}/stock`} />
              <Textarea name="lines" placeholder={"email|pasword\napikey\nuser|pass"} />
              <Button type="submit">Import Stok</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Content</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Reserved By</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Sold Order</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Created</th>
              <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(product.stocks || []).map((stock) => (
              <tr key={stock.id} className="transition-colors hover:bg-muted/20">
                <td className="p-4 align-middle font-mono text-xs leading-relaxed break-all">
                  {stock.content}
                </td>
                <td className="p-4 align-middle">
                  <StatusPill label={stock.status} tone={getStockTone(stock.status as StockStatus)} />
                </td>
                <td className="p-4 align-middle font-mono text-xs text-muted-foreground break-all">
                  {stock.reservedBy || "-"}
                </td>
                <td className="p-4 align-middle font-mono text-xs text-muted-foreground break-all">
                  {stock.soldOrderId || "-"}
                </td>
                <td className="p-4 align-middle">{formatDate(stock.createdAt)}</td>
                <td className="p-4 align-middle">
                  <form action={deleteStockAction}>
                    <input type="hidden" name="stockId" value={stock.id} />
                    <input type="hidden" name="redirectTo" value={`/admin/products/${product.id}/stock`} />
                    <Button variant="destructive" size="sm">Hapus</Button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
