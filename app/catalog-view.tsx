"use client";

import { useMemo, useState } from "react";
import { LuSearch } from "react-icons/lu";

import { SourceMark } from "./source-mark";

export type Story = {
  category: string;
  sourceType: string;
  source: string;
  publishedAt: string;
  datePrecision?: "day" | "month" | "year";
  readTime: string;
  title: string;
  subtitle?: string;
  summary: string;
  why: string;
  tags: string[];
  url: string;
};

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

function formatStoryDate(date: string, precision: Story["datePrecision"] = "day") {
  const [year, month, day] = date.split("-").map(Number);
  if (precision === "year") return String(year);
  if (precision === "month") return `${year}.${String(month).padStart(2, "0")}`;
  return `${year}.${String(month).padStart(2, "0")}.${String(day).padStart(2, "0")}`;
}

export function CatalogView({
  stories,
  emptyTitle = "暂无匹配内容",
  emptyDescription = "请尝试其他关键词或主题。",
}: {
  stories: Story[];
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const featuredTags = useMemo(() => getFeaturedTags(stories), [stories]);
  const visibleTags =
    activeTag && !featuredTags.includes(activeTag)
      ? [activeTag, ...featuredTags.slice(0, -1)]
      : featuredTags;

  const normalized = query.trim().toLowerCase();
  const filteredStories = stories.filter((story) => {
    const tagMatch = !activeTag || story.tags.includes(activeTag);
    const queryMatch =
      !normalized ||
      [
        story.category,
        story.sourceType,
        story.title,
        story.subtitle ?? "",
        story.summary,
        story.source,
        story.publishedAt,
        ...story.tags,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    return tagMatch && queryMatch;
  });

  return (
    <section className="digest" id="top">
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
            aria-label="搜索内容"
          />
        </label>
      </div>

      <div className="story-list" aria-live="polite">
        {filteredStories.map((story, index) => (
          <article className="story" key={story.url}>
            <div className="story-rank">{String(index + 1).padStart(2, "0")}</div>
            <div className="story-body">
              <div className="story-meta">
                <span className="story-source">
                  <SourceMark type={story.sourceType} url={story.url} source={story.source} />
                  <span>{story.source}</span>
                </span>
                <span className="meta-item story-topic">{story.category}</span>
                <time className="meta-item" dateTime={story.publishedAt}>
                  {formatStoryDate(story.publishedAt, story.datePrecision)}
                </time>
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
        {filteredStories.length === 0 && (
          <div className="empty-state">
            <span>{emptyTitle}</span>
            <p>{emptyDescription}</p>
          </div>
        )}
      </div>
    </section>
  );
}
