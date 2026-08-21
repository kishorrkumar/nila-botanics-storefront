import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body?.name || !body?.phone) return NextResponse.json({ error: "name and phone are required" }, { status: 400 });

  const webhook = process.env.SNAPSERVE_MCP_WEBHOOK_URL;
  if (webhook) {
    const upstream = await fetch(webhook, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.SNAPSERVE_MCP_API_KEY ? { Authorization: `Bearer ${process.env.SNAPSERVE_MCP_API_KEY}` } : {})
      },
      body: JSON.stringify({ event: "routine_help_requested", brand: "Nila Botanics", ...body })
    });
    if (!upstream.ok) return NextResponse.json({ error: "SnapServe webhook rejected the request" }, { status: 502 });
  }

  return NextResponse.json({ accepted: true, connectedToSnapServe: Boolean(webhook), lead: { name: body.name, goal: body.goal ?? "not_provided" } }, { status: 202 });
}
