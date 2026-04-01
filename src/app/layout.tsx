import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NewAPI 额度统计平台",
  description: "支持多站点管理与服务端持久化的 NewAPI 额度统计平台。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
