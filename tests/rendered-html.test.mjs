import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const latestDigest = JSON.parse(
  await readFile(new URL("../content/latest.json", import.meta.url), "utf8"),
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

test("renders the daily digest", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>AI Engineering Daily/);
  assert.match(html, new RegExp(escapeRegExp(latestDigest.overview)));
  assert.match(html, /搜索标题、来源或标签/);

  if (latestDigest.items.length === 0) {
    assert.match(html, /首期内容准备中/);
  } else {
    assert.doesNotMatch(html, /首期内容准备中/);
    assert.match(html, new RegExp(escapeRegExp(latestDigest.items[0].title)));
    assert.match(
      html,
      new RegExp(`data-source-type="${escapeRegExp(latestDigest.items[0].sourceType)}"`),
    );
    assert.match(html, /aria-label="标签筛选"/);
    assert.match(
      html,
      new RegExp(`第 ${String(latestDigest.issue).padStart(3, "0")} 期`),
    );
  }

  assert.doesNotMatch(html, /从代码补全到长期运行|codex-preview|示例数据|趋势观察/);
});
