"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdminSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requestEmbedSync } from "@/lib/settings";
import { parseStockIds } from "@/lib/stock-mask";

const ALLOWED_STATUSES = new Set(["AVAILABLE", "RESERVED", "SOLD"]);

function asString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value : "";
}

export async function deleteStockBulkAction(formData: FormData) {
  await requireAdminSession();

  const productId = asString(formData.get("productId")).trim();
  const redirectTo = asString(formData.get("redirectTo")) || "/admin/products";
  const statusFilter = asString(formData.get("status"));
  const status = ALLOWED_STATUSES.has(statusFilter) ? statusFilter : "";
  const deleteAll = asString(formData.get("all")) === "1";

  try {
    if (!productId) {
      throw new Error("Produk tidak valid");
    }

    const where: Record<string, string> = { productId };
    if (status) {
      where.status = status;
    }

    const rows = await prisma.stockItem.findMany({ where });

    let selected = rows;
    if (!deleteAll) {
      const idSet = new Set(parseStockIds(asString(formData.get("stockIds"))));
      selected = rows.filter((row: { id: string }) => idSet.has(row.id));
    }

    const deletable = selected.filter(
      (row: { status: string }) => row.status === "AVAILABLE",
    );
    const skipped = selected.length - deletable.length;

    await prisma.$transaction(async () => {
      for (const row of deletable) {
        await prisma.stockItem.delete({ where: { id: row.id } });
      }
    });

    await requestEmbedSync();
    revalidatePath("/admin/products");
    revalidatePath(`/admin/products/${productId}/stock`);

    const message = `${deletable.length} stok dihapus, ${skipped} dilewati (reserved/sold)`;
    redirect(`${redirectTo}?message=${encodeURIComponent(message)}`);
  } catch (error) {
    if (isRedirectError(error)) throw error;
    const message = error instanceof Error ? error.message : "Hapus stok gagal";
    redirect(`${redirectTo}?error=${encodeURIComponent(message)}`);
  }
}

function isRedirectError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT;")
  );
}
