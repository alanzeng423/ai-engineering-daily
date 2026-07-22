import type { Metadata } from "next";
import Link from "next/link";

import { CatalogView, type Story } from "../catalog-view";
import catalog from "@/content/catalog.json";

const PAPER_SOURCE_TYPES = new Set(["arxiv", "openreview", "paper"]);
const stories = (catalog.items as Story[]).filter((story) =>
  PAPER_SOURCE_TYPES.has(story.sourceType),
);

export const metadata: Metadata = {
  title: "论文精选 — AI Engineering Daily",
  description: "AI Engineering Daily 收录的论文与预印本。",
  alternates: {
    canonical: "/paper",
  },
  openGraph: {
    title: "论文精选 — AI Engineering Daily",
    description: "AI Engineering Daily 收录的论文与预印本。",
    url: "/paper",
  },
};

export default function Paper() {
  return (
    <main>
      <h1 className="sr-only">论文精选</h1>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="返回 AI Engineering Daily 首页">
          AI Engineering Daily
        </Link>
        <Link className="header-action" href="/" aria-label="返回首页">
          首页
        </Link>
      </header>

      <CatalogView stories={stories} />
    </main>
  );
}
