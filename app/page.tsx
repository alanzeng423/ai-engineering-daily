"use client";

import { useMemo, useState } from "react";
import latestDigest from "@/content/latest.json";

type Story = {
  category: string;
  source: string;
  readTime: string;
  title: string;
  summary: string;
  why: string;
  tags: string[];
  url: string;
};

const stories = latestDigest.items as Story[];

function formatDigestDate(date: string | null) {
  if (!date) return null;
  const [year, month, day] = date.split("-").map(Number);
  return `${year} 年 ${month} 月 ${day} 日`;
}

export default function Home() {
  const [query, setQuery] = useState("");
  const digestDate = formatDigestDate(latestDigest.date);

  const filteredStories = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return stories.filter((story) => {
      return (
        !normalized ||
        [story.category, story.title, story.summary, story.source, ...story.tags]
          .join(" ")
          .toLowerCase()
          .includes(normalized)
      );
    });
  }, [query]);

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="AI Engineering Daily 首页">
          AI Engineering Daily
        </a>
        <nav aria-label="主要导航">
          <a className="active" href="#digest">日报</a>
          <a href="#about">关于</a>
        </nav>
        <div className="header-meta">每天 09:30 更新</div>
      </header>

      <section className="editor-note" id="top">
        <h2>今日概览</h2>
        <p>{latestDigest.overview}</p>
      </section>

      <section className="digest" id="digest">
        <div className="section-header">
          <h2>精选内容</h2>
          <span>
            {latestDigest.issue > 0 && digestDate
              ? `第 ${String(latestDigest.issue).padStart(3, "0")} 期 · ${digestDate} · ${stories.length} 篇`
              : "首期准备中"}
          </span>
        </div>
        <div className="toolbar">
          <label className="search-box">
            <span>⌕</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索标题、来源或标签"
              aria-label="搜索日报"
            />
          </label>
        </div>

        <div className="story-list" aria-live="polite">
          {filteredStories.map((story, index) => (
            <article className="story" key={story.url}>
              <div className="story-rank">{String(index + 1).padStart(2, "0")}</div>
              <div className="story-body">
                <div className="story-kicker">
                  <span>{story.category}</span>
                  <span>{story.source}</span>
                  <span>{story.readTime}</span>
                  {story.tags.map((tag) => <span key={tag}>{tag}</span>)}
                </div>
                <h2>
                  <a href={story.url} target="_blank" rel="noreferrer">{story.title}</a>
                </h2>
                <div className="story-copy">
                  <p className="summary">{story.summary}</p>
                  <p className="why"><b>关注点</b>{story.why}</p>
                </div>
              </div>
            </article>
          ))}
          {filteredStories.length === 0 && (
            <div className="empty-state">
              <span>{stories.length === 0 ? "首期内容准备中" : "暂无匹配内容"}</span>
              <p>{stories.length === 0 ? "下一次更新：每天 09:30" : "请尝试其他关键词或主题。"}</p>
            </div>
          )}
        </div>
      </section>

      <footer id="about">
        <div className="brand footer-brand">AI Engineering Daily</div>
        <p>每天 09:30 更新</p>
        <p className="footer-note">AI research and engineering</p>
      </footer>
    </main>
  );
}
