import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { Notice } from "@/components/notice";
import { StockTable, type StockTableRow } from "@/components/stock-table";
import { maskStockContent } from "@/lib/stock-mask";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/order-presenter";
import { getProductById } from "@/services/productService";
import { addStockAction, importStockAction } from "../../../actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const ALLOWED_STATUSES = ["AVAILABLE", "RESERVED", "SOLD"];
const PER_PAGE = 50;

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

  const statusParam = typeof query.status === "string" ? query.status : "";
  const statusFilter = ALLOWED_STATUSES.includes(statusParam) ? statusParam : "";

  const pageParam = Number(typeof query.page === "string" ? query.page : "1");
  const requestedPage =
    Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1;

  const where: Record<string, string> = { productId: product.id };
  if (statusFilter) {
    where.status = statusFilter;
  }

  // shim has no `skip`; fetch all matching, slice in memory for total + page.
  const allStocks = await prisma.stockItem.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  const total = allStocks.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const page = Math.min(requestedPage, totalPages);
  const pageStocks = allStocks.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const stocks: StockTableRow[] = pageStocks.map(
    (stock: {
      id: string;
      content: string;
      status: string;
      reservedBy: string | null;
      soldOrderId: string | null;
      createdAt: string;
    }) => ({
      id: stock.id,
      content: maskStockContent(stock.content),
      status: stock.status,
      reservedBy: stock.reservedBy,
      soldOrderId: stock.soldOrderId,
      createdAt: formatDate(stock.createdAt),
    }),
  );

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

      <StockTable
        productId={product.id}
        stocks={stocks}
        total={total}
        page={page}
        perPage={PER_PAGE}
        statusFilter={statusFilter}
      />
    </AppShell>
  );
}
