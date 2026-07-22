"use client";

import { useState } from "react";
import { LuSearch } from "react-icons/lu";
import latestDigest from "@/content/latest.json";
import { SourceMark } from "./source-mark";

type Story = {
  category: string;
  sourceType: string;
  source: string;
  readTime: string;
  title: string;
  summary: string;
  why: string;
  tags: string[];
  url: string;
};

const stories = latestDigest.items as Story[];

function getFeaturedTags(items: Story[], limit = 8) {
  const stats = new Map<string, { count: number; order: number }>();
  let order = 0;

  items.forEach((story) => {
    story.tags.forEach((tag) => {
      const current = stats.get(tag);
      if (current) current.count += 1;
      else stats.set(tag, { count: 1, order: order++ });
    });
  });

  return [...stats.entries()]
    .sort((left, right) => right[1].count - left[1].count || left[1].order - right[1].order)
    .slice(0, limit)
    .map(([tag]) => tag);
}

const featuredTags = getFeaturedTags(stories);

function formatDigestDate(date: string | null) {
  if (!date) return null;
  const [year, month, day] = date.split("-").map(Number);
  return `${year} 年 ${month} 月 ${day} 日`;
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const digestDate = formatDigestDate(latestDigest.date);
  const visibleTags =
    activeTag && !featuredTags.includes(activeTag)
      ? [activeTag, ...featuredTags.slice(0, -1)]
      : featuredTags;

  const normalized = query.trim().toLowerCase();
  const filteredStories = stories.filter((story) => {
    const tagMatch = !activeTag || story.tags.includes(activeTag);
    const queryMatch =
      !normalized ||
      [story.category, story.sourceType, story.title, story.summary, story.source, ...story.tags]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    return tagMatch && queryMatch;
  });

  return (
    <main>
      <h1 className="sr-only">AI Engineering Daily</h1>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="AI Engineering Daily 首页">
          AI Engineering Daily
        </a>
      </header>

      <section className="digest" id="digest">
        <div className="digest-intro" id="top">
          <div className="issue-block">
            <strong>
              {latestDigest.issue > 0
                ? `第 ${String(latestDigest.issue).padStart(3, "0")} 期`
                : "首期准备中"}
            </strong>
            <span>
              {latestDigest.issue > 0 && digestDate
                ? `${digestDate} · ${stories.length} 篇`
                : "内容准备中"}
            </span>
          </div>
          <p>{latestDigest.overview}</p>
        </div>
        <div className="toolbar">
          <div className="tag-filters" aria-label="标签筛选">
            <button
              type="button"
              className={activeTag === null ? "selected" : ""}
              aria-pressed={activeTag === null}
              onClick={() => setActiveTag(null)}
            >
              全部
            </button>
            {visibleTags.map((tag) => (
              <button
                type="button"
                key={tag}
                className={activeTag === tag ? "selected" : ""}
                aria-pressed={activeTag === tag}
                onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              >
                {tag}
              </button>
            ))}
          </div>
          <label className="search-box">
            <LuSearch aria-hidden="true" />
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
                <div className="story-meta">
                  <SourceMark type={story.sourceType} />
                  <span className="meta-item story-topic">{story.category}</span>
                  <span className="meta-item">{story.source}</span>
                  <span className="meta-item">{story.readTime}</span>
                  <div className="story-tags" aria-label="内容标签">
                    {story.tags.map((tag) => (
                      <button
                        type="button"
                        key={tag}
                        className={activeTag === tag ? "selected" : ""}
                        aria-pressed={activeTag === tag}
                        onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                      >
                        #{tag}
                      </button>
                    ))}
                  </div>
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
              {stories.length > 0 && <p>请尝试其他关键词或主题。</p>}
            </div>
          )}
        </div>
      </section>

      <footer id="about">
        <div className="brand footer-brand">AI Engineering Daily</div>
        <p className="footer-note">AI research and engineering</p>
      </footer>
    </main>
  );
}
