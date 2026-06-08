import { AppShell } from "../../../../components/app-shell";
import { ProductForm } from "../../../../components/product-form";
import { saveProductAction } from "../../actions";

export default function NewProductPage() {
  return (
    <AppShell
      title="Produk Baru"
      description="Tambah produk digital baru untuk ditampilkan di channel auto-order."
    >
      <ProductForm action={saveProductAction} redirectTo="/admin/products/new" />
    </AppShell>
  );
}
