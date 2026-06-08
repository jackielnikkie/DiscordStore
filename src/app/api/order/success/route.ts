import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Order return endpoint aktif. Delivery akan diproses setelah webhook paid.",
  });
}
