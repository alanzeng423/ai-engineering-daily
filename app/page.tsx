import Link from "next/link";

import catalog from "@/content/catalog.json";
import { CatalogView, type Story } from "./catalog-view";

const stories = catalog.items as Story[];

export default function Home() {
  return (
    <main>
      <h1 className="sr-only">AI Engineering Daily</h1>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="AI Engineering Daily 首页">
          AI Engineering Daily
        </a>
        <nav className="header-actions" aria-label="内容入口">
          <Link className="header-action" href="/x" aria-label="查看 X 推文">
            X
          </Link>
          <Link className="header-action" href="/paper" aria-label="查看论文">
            论文
          </Link>
          <Link className="header-action" href="/today" aria-label="查看今日精选">
            今日
          </Link>
        </nav>
      </header>

      <CatalogView stories={stories} />
    </main>
  );
}
