import type { Metadata } from "next";
import Link from "next/link";

import latestDigest from "@/content/latest.json";
import { SourceMark } from "../source-mark";

type Story = {
  category: string;
  sourceType: string;
  source: string;
  publishedAt: string;
  readTime: string;
  title: string;
  subtitle?: string;
  summary: string;
  why: string;
  tags: string[];
  url: string;
};

const stories = latestDigest.items as Story[];

function formatDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return `${year} 年 ${month} 月 ${day} 日`;
}

export const metadata: Metadata = {
  title: "今日精选 — AI Engineering Daily",
  description: latestDigest.overview,
  alternates: {
    canonical: "/today",
  },
  openGraph: {
    title: "今日精选 — AI Engineering Daily",
    description: latestDigest.overview,
    url: "/today",
  },
};

export default function Today() {
  return (
    <main>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="返回 AI Engineering Daily 全部内容">
          AI Engineering Daily
        </Link>
        <Link className="header-action" href="/" aria-label="返回首页">
          首页
        </Link>
      </header>

      <section className="digest today-digest">
        <div className="today-summary">
          <div className="today-summary-meta">
            <time dateTime={latestDigest.date}>{formatDate(latestDigest.date)}</time>
            <span>{stories.length} 篇</span>
          </div>
          <div className="today-summary-copy">
            <h1>当日总结</h1>
            <p>{latestDigest.overview}</p>
          </div>
        </div>

        <div className="story-list">
          {stories.map((story, index) => (
            <article className="story" key={story.url}>
              <div className="story-rank">{String(index + 1).padStart(2, "0")}</div>
              <div className="story-body">
                <div className="story-meta">
                  <span className="story-source">
                    <SourceMark
                      type={story.sourceType}
                      url={story.url}
                      source={story.source}
                    />
                    <span>{story.source}</span>
                  </span>
                  <span className="meta-item story-topic">{story.category}</span>
                  <span className="meta-item">{story.readTime}</span>
                  <div className="story-tags" aria-label="内容标签">
                    {story.tags.map((tag) => (
                      <span key={tag}>#{tag}</span>
                    ))}
                  </div>
                </div>
                <h2 className={story.subtitle ? "has-subtitle" : undefined}>
                  <a href={story.url} target="_blank" rel="noreferrer">
                    {story.title}
                  </a>
                </h2>
                {story.subtitle && <p className="story-subtitle">{story.subtitle}</p>}
                <div className="story-copy">
                  <p className="summary">{story.summary}</p>
                  <p className="why"><b>关注点</b>{story.why}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
