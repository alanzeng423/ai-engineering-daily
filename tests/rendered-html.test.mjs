import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const catalog = JSON.parse(
  await readFile(new URL("../content/catalog.json", import.meta.url), "utf8"),
);
const latestDigest = JSON.parse(
  await readFile(new URL("../content/latest.json", import.meta.url), "utf8"),
);
const paperSourceTypes = new Set(["arxiv", "openreview", "paper"]);
const paperStories = catalog.items.filter((item) => paperSourceTypes.has(item.sourceType));
const xStories = catalog.items.filter((item) => item.sourceType === "x");

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(new URL(path, "http://localhost/"), {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("renders the cumulative content catalog", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>AI Engineering Daily/);
  assert.match(html, /href="\/x"[^>]*>X<\/a>/);
  assert.match(html, /href="\/paper"[^>]*>论文<\/a>/);
  assert.match(html, /href="\/today"[^>]*>今日<\/a>/);
  assert.match(html, /搜索标题、来源或标签/);
  assert.match(html, new RegExp(escapeRegExp(catalog.items[0].title)));
  assert.match(
    html,
    new RegExp(`data-source-type="${escapeRegExp(catalog.items[0].sourceType)}"`),
  );
  assert.match(html, /data-source-brand="openai"/);
  assert.match(html, /data-source-brand="harness\.io"/);
  assert.match(html, /aria-label="标签筛选"/);
  assert.doesNotMatch(html, /首期内容准备中|第 001 期|每天 09:30 更新|日报|关于/);

  assert.doesNotMatch(html, /从代码补全到长期运行|codex-preview|示例数据|趋势观察/);
});

test("renders only the latest issue and its daily summary at /today", async () => {
  const response = await render("/today");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /<title>今日精选 — AI Engineering Daily/);
  assert.match(html, /href="\/"[^>]*>首页<\/a>/);
  assert.match(html, /当日总结/);
  assert.match(html, new RegExp(escapeRegExp(latestDigest.overview)));
  assert.match(html, new RegExp(escapeRegExp(latestDigest.items[0].title)));
  const arxivPaper = latestDigest.items.find((item) => item.sourceType === "arxiv");
  assert.ok(arxivPaper?.subtitle);
  assert.match(html, new RegExp(escapeRegExp(arxivPaper.title)));
  assert.match(html, new RegExp(escapeRegExp(arxivPaper.subtitle)));
  assert.equal((html.match(/<article\b/g) ?? []).length, latestDigest.items.length);
  assert.doesNotMatch(html, /搜索标题、来源或标签|标签筛选/);
});

test("renders only papers and preprints at /paper", async () => {
  const response = await render("/paper");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /<title>论文精选 — AI Engineering Daily/);
  assert.match(html, /href="\/"[^>]*>首页<\/a>/);
  assert.match(html, /搜索标题、来源或标签/);
  assert.match(html, new RegExp(escapeRegExp(paperStories[0].title)));
  assert.equal((html.match(/<article\b/g) ?? []).length, paperStories.length);

  const renderedSourceTypes = [...html.matchAll(/data-source-type="([^"]+)"/g)]
    .map((match) => match[1]);
  assert.equal(renderedSourceTypes.length, paperStories.length);
  assert.ok(renderedSourceTypes.every((sourceType) => paperSourceTypes.has(sourceType)));

  const nonPaper = catalog.items.find((item) => !paperSourceTypes.has(item.sourceType));
  assert.ok(nonPaper);
  assert.doesNotMatch(html, new RegExp(escapeRegExp(nonPaper.title)));
});

test("renders only original X posts at /x", async () => {
  const response = await render("/x");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /<title>X 推文精选 — AI Engineering Daily/);
  assert.match(html, /href="\/"[^>]*>首页<\/a>/);
  assert.equal((html.match(/<article\b/g) ?? []).length, xStories.length);

  const renderedSourceTypes = [...html.matchAll(/data-source-type="([^"]+)"/g)]
    .map((match) => match[1]);
  assert.equal(renderedSourceTypes.length, xStories.length);
  assert.ok(renderedSourceTypes.every((sourceType) => sourceType === "x"));

  if (xStories.length > 0) {
    assert.match(html, new RegExp(escapeRegExp(xStories[0].title)));
  } else {
    assert.match(html, /暂无收录推文/);
  }

  const nonXPost = catalog.items.find((item) => item.sourceType !== "x");
  assert.ok(nonXPost);
  assert.doesNotMatch(html, new RegExp(escapeRegExp(nonXPost.title)));
});
