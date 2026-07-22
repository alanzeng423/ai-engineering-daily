import type { Metadata } from "next";
import Link from "next/link";

import { CatalogView, type Story } from "../catalog-view";
import catalog from "@/content/catalog.json";

const stories = (catalog.items as Story[]).filter((story) => story.sourceType === "x");

export const metadata: Metadata = {
  title: "X 推文精选 — AI Engineering Daily",
  description: "AI Engineering Daily 收录的高质量 X 原帖。",
  alternates: {
    canonical: "/x",
  },
  openGraph: {
    title: "X 推文精选 — AI Engineering Daily",
    description: "AI Engineering Daily 收录的高质量 X 原帖。",
    url: "/x",
  },
};

export default function XPosts() {
  return (
    <main>
      <h1 className="sr-only">X 推文精选</h1>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="返回 AI Engineering Daily 首页">
          AI Engineering Daily
        </Link>
        <Link className="header-action" href="/" aria-label="返回首页">
          首页
        </Link>
      </header>

      <CatalogView
        stories={stories}
        emptyTitle="暂无收录推文"
        emptyDescription="新的 X 推文会随日报自动进入这里。"
      />
    </main>
  );
}
