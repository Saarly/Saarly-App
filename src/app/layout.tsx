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
  title: "لوحة إدارة سعرلي",
  description: "لوحة إدارة عمليات سعرلي والدعم والمدفوعات والإعدادات.",
  icons: { icon: "/favicon.png", shortcut: "/favicon.png", apple: "/favicon.png" }
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

