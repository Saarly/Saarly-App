import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Saarly Admin",
  description: "Admin dashboard for Saarly operations, support, payments, and feature flags."
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#85BB64"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}

