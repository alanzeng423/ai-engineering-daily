import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildCatalog, validateCatalog } from "./catalog-schema.mjs";
import { stableJson, validateDigest } from "./digest-schema.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contentDirectory = resolve(root, "content");

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function rebuildCatalog() {
  const baseline = await readJson(resolve(contentDirectory, "baseline.json"));
  const index = await readJson(resolve(contentDirectory, "index.json"));
  const digests = [];
  for (const date of [...index.dates].sort()) {
    const digest = await readJson(resolve(contentDirectory, "digests", `${date}.json`));
    const digestErrors = validateDigest(digest);
    if (digestErrors.length > 0) {
      throw new Error(`${date}.json 校验失败：\n- ${digestErrors.join("\n- ")}`);
    }
    digests.push(digest);
  }

  const catalog = buildCatalog(baseline, digests);
  const errors = validateCatalog(catalog);
  if (errors.length > 0) throw new Error(`内容目录校验失败：\n- ${errors.join("\n- ")}`);

  const path = resolve(contentDirectory, "catalog.json");
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, stableJson(catalog), "utf8");
  await rename(temporaryPath, path);
  return catalog;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const catalog = await rebuildCatalog();
    console.log(`内容目录已生成：${catalog.total} 篇，覆盖 ${catalog.coverage.from} 至 ${catalog.coverage.to}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
