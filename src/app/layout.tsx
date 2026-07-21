import type { Metadata, Viewport } from "next";
import { Tajawal } from "next/font/google";
import "./globals.css";

const tajawal = Tajawal({
  subsets: ["arabic"],
  weight: ["400", "500", "700", "800"],
  variable: "--font-tajawal",
  display: "swap",
});

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
    <html lang="ar" dir="rtl" className={tajawal.variable}>
      <body className="font-tajawal">{children}</body>
    </html>
  );
}

