"use client";

import { useMemo, useState } from "react";

type Story = {
  rank: string;
  category: string;
  source: string;
  readTime: string;
  title: string;
  summary: string;
  why: string;
  tags: string[];
  url?: string;
};

const stories: Story[] = [
  {
    rank: "01",
    category: "CODING AGENT",
    source: "Anthropic Engineering",
    readTime: "8 min",
    title: "从代码补全到长期运行：Coding Agent 的上下文工程",
    summary:
      "一份面向工程团队的实践笔记：如何把大型代码库、工具反馈与执行历史压缩成 Agent 真正能使用的上下文，并在长任务中维持目标一致性。",
    why: "把“模型更聪明”之外的工程变量讲清楚，对构建可靠的代码代理很有参考价值。",
    tags: ["Claude Code", "Context Engineering"],
  },
  {
    rank: "02",
    category: "LLM SYSTEMS",
    source: "Latent Space",
    readTime: "12 min",
    title: "推理模型进入生产环境后，真正昂贵的是什么？",
    summary:
      "文章拆解推理时计算、缓存命中、延迟预算和工具调用的系统成本，并讨论为什么单看每百万 token 价格会低估真实的服务成本。",
    why: "为 Agent 产品的容量规划和成本模型提供了更接近生产环境的观察框架。",
    tags: ["Inference", "Production"],
  },
  {
    rank: "03",
    category: "AI4SE",
    source: "Research Digest",
    readTime: "6 min",
    title: "新的软件工程基准开始测试修复后的回归风险",
    summary:
      "研究不再只判断补丁是否通过目标测试，而是评估它是否破坏相关模块、引入隐性行为变化，以及能否在不同代码库版本间迁移。",
    why: "评价体系从“修对一个 bug”走向“交付可维护的软件改动”，更贴近真实开发。",
    tags: ["Benchmark", "Program Repair"],
  },
  {
    rank: "04",
    category: "AGENT",
    source: "Independent Researcher",
    readTime: "9 min",
    title: "多 Agent 并不天然优于单 Agent：一次受控实验",
    summary:
      "作者比较了并行探索、角色分工和单代理深度推理三种模式，发现协调开销、重复工作和共享状态质量决定了多代理是否真正有效。",
    why: "用实验结果纠正“代理越多越好”的直觉，为任务编排提供可操作的边界。",
    tags: ["Multi-agent", "Evaluation"],
  },
  {
    rank: "05",
    category: "SOFTWARE ENGINEERING",
    source: "Martin Fowler Blog",
    readTime: "7 min",
    title: "AI 辅助开发之后，代码评审应该检查什么？",
    summary:
      "当代码生成速度显著提高，评审重点需要从语法和样板代码转向意图、架构边界、可观察性、失败模式和长期维护成本。",
    why: "它把 AI 时代的代码评审从工具讨论拉回到团队质量机制。",
    tags: ["Code Review", "Team Practice"],
  },
  {
    rank: "06",
    category: "LLM",
    source: "Model Lab Notes",
    readTime: "5 min",
    title: "小模型调用工具时，结构化反馈比长提示更重要",
    summary:
      "一组消融实验显示，明确的错误类型、可恢复状态和紧凑工具响应，可以显著提高小模型在连续工具调用中的成功率。",
    why: "提示团队优先改造工具接口，而不是无限扩写系统提示词。",
    tags: ["Tool Use", "Small Models"],
  },
];

const filters = ["全部", "LLM", "Agent", "Coding Agent", "AI4SE", "SE"];

export default function Home() {
  const [activeFilter, setActiveFilter] = useState("全部");
  const [query, setQuery] = useState("");

  const filteredStories = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return stories.filter((story) => {
      const categoryMatch =
        activeFilter === "全部" ||
        (activeFilter === "SE"
          ? story.category === "SOFTWARE ENGINEERING"
          : story.category.toLowerCase().includes(activeFilter.toLowerCase()));
      const queryMatch =
        !normalized ||
        [story.title, story.summary, story.source, ...story.tags]
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      return categoryMatch && queryMatch;
    });
  }, [activeFilter, query]);

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
        <p>
          昨日最明显的变化不是又一个模型发布，而是行业注意力继续向
          <strong>上下文工程、可验证执行与生产成本</strong>迁移。Coding Agent
          的竞争正在从“能否写代码”进入“能否长期、可靠地完成工程任务”。
        </p>
      </section>

      <section className="digest" id="digest">
        <div className="section-header">
          <h2>精选内容</h2>
          <span>第 001 期 · 2026 年 7 月 21 日 · {filteredStories.length} 篇</span>
        </div>
        <div className="toolbar">
          <div className="filters" aria-label="主题筛选">
            {filters.map((filter) => (
              <button
                key={filter}
                className={activeFilter === filter ? "selected" : ""}
                onClick={() => setActiveFilter(filter)}
              >
                {filter}
              </button>
            ))}
          </div>
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
          {filteredStories.map((story) => (
            <article className="story" key={story.rank}>
              <div className="story-rank">{story.rank}</div>
              <div className="story-body">
                <div className="story-kicker">
                  <span>{story.category}</span>
                  <span>{story.source}</span>
                  <span>{story.readTime}</span>
                  {story.tags.map((tag) => <span key={tag}>{tag}</span>)}
                </div>
                <h2>
                  {story.url ? (
                    <a href={story.url} target="_blank" rel="noreferrer">{story.title}</a>
                  ) : story.title}
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
              <span>暂无匹配内容</span>
              <p>请尝试其他关键词或主题。</p>
            </div>
          )}
        </div>
      </section>

      <footer id="about">
        <div className="brand footer-brand">AI Engineering Daily</div>
        <p>每天 09:30 更新</p>
        <p className="footer-note">LLM · Agent · Coding Agent · SE · AI4SE</p>
      </footer>
    </main>
  );
}
