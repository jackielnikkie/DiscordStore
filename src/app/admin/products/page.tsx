import Link from "next/link";

import { AppShell } from "../../../components/app-shell";
import { Notice } from "../../../components/notice";
import { StatusPill } from "../../../components/status-pill";
import { getProductTypeLabel, ProductType } from "../../../lib/db-types";
import { formatRupiah } from "../../../lib/money";
import { listProductsWithStock, type ProductWithStock } from "../../../services/productService";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { deleteProductAction, toggleProductActiveAction } from "../actions";
import Image from "next/image";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const products = await listProductsWithStock();
  const searchQuery = typeof params.search === "string" ? params.search.toLowerCase().trim() : "";
  const typeFilter = typeof params.type === "string" ? params.type : "";

  const filtered = products.filter((p) => {
    if (searchQuery && !p.name.toLowerCase().includes(searchQuery) && !p.slug.toLowerCase().includes(searchQuery)) {
      return false;
    }
    if (typeFilter && p.type !== typeFilter) {
      return false;
    }
    return true;
  });

  return (
    <AppShell
      title="Products"
      description="Kelola katalog produk, harga, status aktif, dan akses ke stok per produk."
      actions={
        <Link href="/admin/products/new">
          <Button>+ Produk Baru</Button>
        </Link>
      }
    >
      <Notice
        message={typeof params.message === "string" ? params.message : undefined}
        error={typeof params.error === "string" ? params.error : undefined}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1.5">
          <Link href="/admin/products">
            <Badge variant={!typeFilter ? "default" : "outline"} className="cursor-pointer">Semua</Badge>
          </Link>
          <Link href={`/admin/products?type=${ProductType.STOCK_LINE}`}>
            <Badge variant={typeFilter === ProductType.STOCK_LINE ? "default" : "outline"} className="cursor-pointer">
              {getProductTypeLabel(ProductType.STOCK_LINE)}
            </Badge>
          </Link>
          <Link href={`/admin/products?type=${ProductType.CUSTOM_TEXT}`}>
            <Badge variant={typeFilter === ProductType.CUSTOM_TEXT ? "default" : "outline"} className="cursor-pointer">
              {getProductTypeLabel(ProductType.CUSTOM_TEXT)}
            </Badge>
          </Link>
        </div>
        <form className="flex gap-2" method="GET" action="/admin/products">
          {typeFilter ? <input type="hidden" name="type" value={typeFilter} /> : null}
          <input
            name="search"
            type="text"
            defaultValue={searchQuery}
            placeholder="Cari produk..."
            className="flex h-9 w-full rounded-md border border-border bg-background px-3 py-1 text-sm shadow-sm outline-none transition-[box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:w-64"
          />
        </form>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center shadow-sm">
          <p className="text-muted-foreground">Tidak ada produk.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap">Image</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap">Product</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap">Price</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap">Type</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap">Stock</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap">Sold</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((product: ProductWithStock) => (
                <tr key={product.id} className="transition-colors hover:bg-muted/20">
                  <td className="p-4">
                    {product.imageUrl ? (
                      <Image
                        src={product.imageUrl}
                        alt={product.name}
                        width={40}
                        height={40}
                        className="h-10 w-10 rounded-md object-contain lazyload"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                        <span className="text-xs text-muted-foreground">N/A</span>
                      </div>
                    )}
                  </td>
                  <td className="p-4">
                    <div className="font-medium text-foreground">{product.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{product.slug}</div>
                  </td>
                  <td className="p-4 font-medium">{formatRupiah(product.price)}</td>
                  <td className="p-4">
                    <Badge variant="outline">
                      {getProductTypeLabel(product.type)}
                    </Badge>
                  </td>
                  <td className="p-4">{product.type === ProductType.STOCK_LINE ? product.availableStockCount : "N/A"}</td>
                  <td className="p-4">{product.soldCount}</td>
                  <td className="p-4">
                    <StatusPill
                      label={product.isActive ? "Active" : "Inactive"}
                      tone={product.isActive ? "success" : "neutral"}
                    />
                  </td>
                  <td className="p-4">
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/admin/products/${product.id}`}>
                        <Button variant="outline" size="sm">Edit</Button>
                      </Link>
                      <Link href={`/admin/products/${product.id}/stock`}>
                        <Button variant="outline" size="sm">Stock</Button>
                      </Link>
                      <form action={toggleProductActiveAction}>
                        <input type="hidden" name="productId" value={product.id} />
                        <input type="hidden" name="redirectTo" value="/admin/products" />
                        <Button variant={product.isActive ? "secondary" : "default"} size="sm">
                          {product.isActive ? "Nonaktifkan" : "Aktifkan"}
                        </Button>
                      </form>
                      <form action={deleteProductAction}>
                        <input type="hidden" name="productId" value={product.id} />
                        <input type="hidden" name="redirectTo" value="/admin/products" />
                        <Button variant="destructive" size="sm">Hapus</Button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
