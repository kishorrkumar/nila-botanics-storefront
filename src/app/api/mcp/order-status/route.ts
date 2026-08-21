import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.orderId || !body?.phone) return NextResponse.json({ error: "orderId and phone are required" }, { status: 400 });
  const backend = process.env.ADMIN_API_URL;
  if (!backend) return NextResponse.json({ error: "ADMIN_API_URL is not configured" }, { status: 503 });
  try {
    const upstream = await fetch(`${backend}/api/orders/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
    const result = await upstream.json();
    return NextResponse.json(result, { status: upstream.status });
  } catch {
    return NextResponse.json({ error: "Order service is unavailable" }, { status: 502 });
  }
}
