import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ status: "ok", service: "nila-botanics", timestamp: new Date().toISOString() });
}
