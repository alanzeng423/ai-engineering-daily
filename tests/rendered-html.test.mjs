import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const catalog = JSON.parse(
  await readFile(new URL("../content/catalog.json", import.meta.url), "utf8"),
);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
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
  assert.match(html, /搜索标题、来源或标签/);
  assert.match(html, new RegExp(escapeRegExp(catalog.items[0].title)));
  assert.match(
    html,
    new RegExp(`data-source-type="${escapeRegExp(catalog.items[0].sourceType)}"`),
  );
  assert.match(html, /aria-label="标签筛选"/);
  assert.doesNotMatch(html, /首期内容准备中|第 001 期|每天 09:30 更新|日报|关于/);

  assert.doesNotMatch(html, /从代码补全到长期运行|codex-preview|示例数据|趋势观察/);
});
