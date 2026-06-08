import { NextRequest, NextResponse } from "next/server";

import { requireAdminApi, jsonError } from "../../../../lib/admin-api";
import { prisma } from "../../../../lib/db";
import { productSchema } from "../../../../lib/validators";
import { requestEmbedSync } from "../../../../lib/settings";
import { listProductsWithStock } from "../../../../services/productService";

export async function GET() {
  const authError = await requireAdminApi();
  if (authError) return authError;

  const products = await listProductsWithStock();
  return NextResponse.json({ items: products });
}

export async function POST(request: NextRequest) {
  const authError = await requireAdminApi(request);
  if (authError) return authError;

  try {
    const input = productSchema.parse(await request.json());
    const product = await prisma.product.create({
      data: {
        name: input.name,
        slug: input.slug,
        description: emptyToNull(input.description),
        imageUrl: emptyToNull(input.imageUrl),
        price: input.price,
        bulkPriceJson: emptyToNull(input.bulkPriceJson),
        formatLabel: emptyToNull(input.formatLabel),
        type: input.type,
        customText: emptyToNull(input.customText),
        isActive: input.isActive,
        sortOrder: input.sortOrder,
      },
    });
    await requestEmbedSync();
    return NextResponse.json({ item: product }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Create product gagal");
  }
}

function emptyToNull(value?: string) {
  return value && value.trim() ? value : null;
}
