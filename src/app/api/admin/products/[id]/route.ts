import { NextRequest, NextResponse } from "next/server";

import { jsonError, requireAdminApi } from "../../../../../lib/admin-api";
import { prisma } from "../../../../../lib/db";
import { normalizePriceTiersJson } from "../../../../../lib/pricing";
import { requestEmbedSync } from "../../../../../lib/settings";
import { productSchema } from "../../../../../lib/validators";
import { ensureUniqueSlug, getProductById } from "../../../../../services/productService";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminApi();
  if (authError) return authError;

  const { id } = await params;
  const product = await getProductById(id);

  if (!product) {
    return jsonError("Product tidak ditemukan", 404);
  }

  return NextResponse.json({ item: product });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminApi(request);
  if (authError) return authError;

  try {
    const { id } = await params;
    const input = productSchema.parse(await request.json());
    const product = await prisma.product.update({
      where: { id },
      data: {
        name: input.name,
        slug: await ensureUniqueSlug({ name: input.name, slug: input.slug, excludeId: id }),
        description: emptyToNull(input.description),
        imageUrl: emptyToNull(input.imageUrl),
        price: input.price,
        bulkPriceJson: normalizePriceTiersJson(input.bulkPriceJson),
        formatLabel: emptyToNull(input.formatLabel),
        type: input.type,
        customText: emptyToNull(input.customText),
        isActive: input.isActive,
        sortOrder: input.sortOrder,
      },
    });
    await requestEmbedSync();
    return NextResponse.json({ item: product });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Update product gagal");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminApi(request);
  if (authError) return authError;

  try {
    const { id } = await params;
    await prisma.product.delete({ where: { id } });
    await requestEmbedSync();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Delete product gagal");
  }
}

function emptyToNull(value?: string) {
  return value && value.trim() ? value : null;
}
