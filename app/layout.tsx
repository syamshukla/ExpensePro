import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = { title: "Syam's Money Tracker", description: "Money in vs out, read from Gmail." };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@500;700;800&family=Source+Sans+3:wght@400;600&family=JetBrains+Mono:wght@500&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
