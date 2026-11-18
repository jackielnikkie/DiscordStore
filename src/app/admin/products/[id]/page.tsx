import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "../../../../components/app-shell";
import { Notice } from "../../../../components/notice";
import { ProductForm } from "../../../../components/product-form";
import { getProductById } from "../../../../services/productService";
import { saveProductAction, toggleProductActiveAction } from "../../actions";
import { Button } from "@/components/ui/button";

export default async function EditProductPage({
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
      title={product.name}
      description="Edit detail produk, harga, tipe delivery, dan properti embed."
      actions={
        <div className="flex items-center gap-2">
          <form action={toggleProductActiveAction}>
            <input type="hidden" name="productId" value={product.id} />
            <input type="hidden" name="redirectTo" value={`/admin/products/${product.id}`} />
            <Button variant={product.isActive ? "secondary" : "default"} size="sm">
              {product.isActive ? "Nonaktifkan produk" : "Aktifkan produk"}
            </Button>
          </form>
          <Link href={`/admin/products/${product.id}/stock`} className="btn-secondary">
            Kelola Stok
          </Link>
        </div>
      }
    >
      <Notice
        message={typeof query.message === "string" ? query.message : undefined}
        error={typeof query.error === "string" ? query.error : undefined}
      />
      <ProductForm
        action={saveProductAction}
        redirectTo={`/admin/products/${product.id}`}
        product={product}
      />
    </AppShell>
  );
}
