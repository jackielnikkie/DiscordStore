import { NextRequest, NextResponse } from "next/server";

import { jsonError, requireAdminApi, requireSameOriginApi } from "@/lib/admin-api";
import { prisma } from "@/lib/db";

const MAX_IDS = 100;

export async function POST(request: NextRequest) {
  const authError = await requireAdminApi(request);
  if (authError) return authError;

  const originError = requireSameOriginApi(request);
  if (originError) return originError;

  try {
    const body = await request.json().catch(() => null);
    const rawIds = Array.isArray(body?.ids) ? body.ids : [];
    const ids = Array.from(
      new Set(
        rawIds
          .filter((id: unknown): id is string => typeof id === "string")
          .map((id: string) => id.trim())
          .filter(Boolean),
      ),
    ).slice(0, MAX_IDS);

    const items: Array<{ id: string; content: string }> = [];

    for (const id of ids) {
      // ponytail: shim appendWhere has no `in`, so one query per id; fine for <=100.
      const [row] = await prisma.stockItem.findMany({ where: { id } });
      if (row) {
        items.push({ id: row.id, content: String(row.content ?? "") });
      }
    }

    return NextResponse.json(
      { items },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Reveal stock gagal");
  }
}
