import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.orderId || !body?.phone) return NextResponse.json({ error: "orderId and phone are required" }, { status: 400 });
  return NextResponse.json({
    orderId: body.orderId,
    status: "integration_pending",
    message: "Connect this route to your order database before production use.",
    nextStep: "Map SnapServe MCP order_status to POST /api/mcp/order-status."
  });
}
