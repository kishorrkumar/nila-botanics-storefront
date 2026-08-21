import { NextResponse } from "next/server";
import { products } from "@/lib/products";

export function GET() {
  return NextResponse.json({
    brand: "Nila Botanics",
    currency: "INR",
    products: products.map(({ id, slug, name, category, price, compareAt, short, benefits, sizes }) => ({ id, slug, name, category, price, compareAt, short, benefits, sizes })),
    usage: "Read-only catalog endpoint prepared for a SnapServe MCP tool."
  });
}
