import { formatRupiah } from "../../lib/money";
import type { InlineKeyboard } from "../../lib/telegram";
import type { ProductWithStock } from "../../services/productService";

export function buildCatalogText(products: ProductWithStock[], title: string) {
  const lines = [title, ""];

  for (const product of products) {
    const stock =
      product.type === "CUSTOM_TEXT"
        ? "custom"
        : `${product.availableStockCount} tersedia`;
    lines.push(`${product.name} - ${formatRupiah(product.price)} (${stock})`);
  }

  lines.push("", "Pilih produk lewat tombol di bawah.");
  return lines.join("\n");
}

export function buildCatalogKeyboard(products: ProductWithStock[]): InlineKeyboard {
  const rows: InlineKeyboard = [];

  for (let index = 0; index < products.length && index < 20; index += 2) {
    rows.push(
      products.slice(index, index + 2).map((product) => ({
        text: `${product.name} - ${formatRupiah(product.price)}`.slice(0, 60),
        callback_data: `prod:${product.id}`,
      })),
    );
  }

  return rows;
}
