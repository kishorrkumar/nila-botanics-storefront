import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nila Botanics | Rooted in nature",
  description: "Small-batch botanical care for hair, skin and everyday wellness."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
