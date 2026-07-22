import assert from "node:assert/strict";
import test from "node:test";

import { validateDigest } from "../scripts/digest-schema.mjs";

function createDigest(category = "Agent 可靠性") {
  return {
    schemaVersion: 1,
    issue: 1,
    date: "2026-07-21",
    generatedAt: "2026-07-22T01:30:00Z",
    overview: "本期集中讨论可靠的智能系统如何进入真实软件工程流程，并给出可以复核的工程证据。",
    items: [
      {
        category,
        sourceType: "arxiv",
        source: "Example Engineering",
        publishedAt: "2026-07-21",
        readTime: "8 min",
        title: "用执行轨迹改进长任务中的故障恢复能力",
        summary: "文章分析长任务中故障暴露位置与真正根因不一致的问题，并通过结构化轨迹回放定位关键步骤。实验给出了恢复成功率和额外运行成本，说明该方法适合生产环境的回归验证。",
        why: "它为生产 Agent 的故障诊断、自动恢复与回归测试提供了可复用的工程方法。",
        url: "https://example.com/agent-reliability",
        tags: ["故障恢复", "执行轨迹", "可观测性"],
      },
    ],
  };
}

test("accepts a flexible content-specific topic", () => {
  assert.deepEqual(validateDigest(createDigest("推理系统")), []);
});

test("rejects a missing or overly long topic", () => {
  assert.match(validateDigest(createDigest(""))[0], /category/);
  assert.match(validateDigest(createDigest("过".repeat(41)))[0], /category/);
});

test("rejects an unsupported source platform", () => {
  const digest = createDigest();
  digest.items[0].sourceType = "search-result";
  assert.match(validateDigest(digest)[0], /sourceType/);
});
