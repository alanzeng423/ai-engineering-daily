import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCatalog,
  normalizeContentUrl,
  validateBaseline,
  validateCatalog,
} from "../scripts/catalog-schema.mjs";

function story(overrides = {}) {
  return {
    category: "Agent 可靠性",
    sourceType: "blog",
    source: "Example Engineering",
    publishedAt: "2026-02-01",
    readTime: "8 min",
    title: "用执行轨迹改进长任务中的故障恢复能力",
    summary: "文章分析长任务中故障暴露位置与真正根因不一致的问题，并通过结构化轨迹回放定位关键步骤。实验给出了恢复成功率和额外运行成本。",
    why: "它为生产 Agent 的故障诊断、自动恢复与回归测试提供了可复用的工程方法。",
    url: "https://example.com/agent-reliability",
    tags: ["故障恢复", "执行轨迹"],
    ...overrides,
  };
}

function baseline(items = [story()]) {
  return {
    schemaVersion: 1,
    id: "foundation-test",
    title: "AI 工程基础精选",
    generatedAt: "2026-07-22T01:45:00Z",
    coverage: {
      from: "2026-02-01",
      to: "2026-02-01",
      primaryFrom: "2026-01-22",
      primaryTo: "2026-07-21",
      exceptionalOlder: 0,
    },
    overview: "本次回溯整理可复核的一手工程文章和实证研究，为后续每日新增内容建立稳定的历史基底。",
    items,
  };
}

test("builds a sorted catalog and lets a daily digest replace a matching baseline URL", () => {
  const base = baseline([
    story(),
    story({
      title: "较早的仓库探索研究与可诊断评测方法",
      publishedAt: "2026-01-25",
      url: "https://example.com/exploration",
    }),
  ]);
  const replacement = story({ title: "日报中更新后的可靠性摘要" });
  const digest = {
    date: "2026-02-01",
    generatedAt: "2026-02-02T01:00:00Z",
    items: [replacement],
  };
  const catalog = buildCatalog(base, [digest]);
  assert.equal(catalog.total, 2);
  assert.equal(catalog.items[0].title, replacement.title);
  assert.deepEqual(validateCatalog(catalog), []);
});

test("normalizes tracking parameters before deduplication", () => {
  assert.equal(
    normalizeContentUrl("https://Example.com/post/?utm_source=x#section"),
    "https://example.com/post",
  );
});

test("validates the baseline collection", () => {
  assert.deepEqual(validateBaseline(baseline()), []);
});
