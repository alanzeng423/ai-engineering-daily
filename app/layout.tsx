import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_SC } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });
const noto = Noto_Sans_SC({ variable: "--font-noto-sc", subsets: ["latin"], weight: ["400", "500", "600", "700", "900"] });

export const metadata: Metadata = {
  title: "AI Engineering Daily — 每日 AI 与软件工程精选",
  description: "每天精选 LLM、Agent、Coding Agent、软件工程与 AI4SE 的高质量内容。",
  openGraph: {
    title: "AI Engineering Daily",
    description: "每日 AI 与软件工程精选",
  },
  twitter: { card: "summary" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className={`${geist.variable} ${mono.variable} ${noto.variable}`}>{children}</body>
    </html>
  );
}
