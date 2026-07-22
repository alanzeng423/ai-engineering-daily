import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateDigest } from "./digest-schema.mjs";
import { buildCatalog, validateBaseline, validateCatalog } from "./catalog-schema.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contentDirectory = resolve(root, "content");
const index = JSON.parse(await readFile(resolve(contentDirectory, "index.json"), "utf8"));
const latest = JSON.parse(await readFile(resolve(contentDirectory, "latest.json"), "utf8"));
const baseline = JSON.parse(await readFile(resolve(contentDirectory, "baseline.json"), "utf8"));
const catalog = JSON.parse(await readFile(resolve(contentDirectory, "catalog.json"), "utf8"));

assert.equal(index.schemaVersion, 1, "content/index.json schemaVersion 必须为 1");
assert.ok(Array.isArray(index.dates), "content/index.json dates 必须是数组");
assert.deepEqual(index.dates, [...new Set(index.dates)].sort().reverse(), "dates 必须去重并倒序排列");

if (index.latest === null) {
  assert.deepEqual(index.dates, [], "没有 latest 时 dates 必须为空");
  assert.equal(latest.issue, 0, "占位 latest 的 issue 必须为 0");
  assert.equal(latest.date, null, "占位 latest 的 date 必须为 null");
  assert.deepEqual(latest.items, [], "占位 latest 不应包含示例内容");
} else {
  assert.equal(index.latest, index.dates[0], "latest 必须等于 dates 中最新日期");
  for (const date of index.dates) {
    const digest = JSON.parse(
      await readFile(resolve(contentDirectory, "digests", `${date}.json`), "utf8"),
    );
    const errors = validateDigest(digest);
    assert.deepEqual(errors, [], `${date}.json 校验失败：\n${errors.join("\n")}`);
    assert.equal(digest.date, date, `${date}.json 内部日期不一致`);
  }
  const archivedLatest = JSON.parse(
    await readFile(resolve(contentDirectory, "digests", `${index.latest}.json`), "utf8"),
  );
  assert.deepEqual(latest, archivedLatest, "latest.json 必须与最新归档完全一致");
}

const baselineErrors = validateBaseline(baseline);
assert.deepEqual(baselineErrors, [], `baseline.json 校验失败：\n${baselineErrors.join("\n")}`);
const catalogErrors = validateCatalog(catalog);
assert.deepEqual(catalogErrors, [], `catalog.json 校验失败：\n${catalogErrors.join("\n")}`);

const digests = [];
for (const date of [...index.dates].sort()) {
  digests.push(
    JSON.parse(await readFile(resolve(contentDirectory, "digests", `${date}.json`), "utf8")),
  );
}
assert.deepEqual(catalog, buildCatalog(baseline, digests), "catalog.json 必须是基底库与日报归档的确定性合并结果");

console.log(`内容索引校验通过：${index.dates.length} 期，累计 ${catalog.total} 篇`);
