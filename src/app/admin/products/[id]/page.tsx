import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "../../../../components/app-shell";
import { Notice } from "../../../../components/notice";
import { ProductForm } from "../../../../components/product-form";
import { getProductById } from "../../../../services/productService";
import { saveProductAction } from "../../actions";

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
        <Link href={`/admin/products/${product.id}/stock`} className="btn-secondary">
          Kelola Stok
        </Link>
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
