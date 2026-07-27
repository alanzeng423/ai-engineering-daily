import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { atomicWriteJson, readJson } from "./atomic-json.mjs";
import { buildCatalog, validateCatalog } from "./catalog-schema.mjs";
import { readAndValidateDigest, stableJson, validateDigest } from "./digest-schema.mjs";

export const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export async function planDigestPublication(inputPath, options = {}) {
  const root = resolve(options.root ?? defaultRoot);
  const contentDirectory = resolve(root, "content");
  const archiveDirectory = resolve(contentDirectory, "digests");
  const digest = await readAndValidateDigest(resolve(inputPath));
  const index = await readJson(resolve(contentDirectory, "index.json"));
  const existingDates = Array.isArray(index.dates) ? index.dates : [];
  const dates = [...new Set([...existingDates, digest.date])].sort().reverse();

  const digests = [];
  for (const date of [...dates].sort()) {
    const archived = date === digest.date
      ? digest
      : await readJson(resolve(archiveDirectory, `${date}.json`));
    const errors = validateDigest(archived);
    if (errors.length > 0) {
      throw new Error(`${date}.json 校验失败：\n- ${errors.join("\n- ")}`);
    }
    digests.push(archived);
  }

  const baseline = await readJson(resolve(contentDirectory, "baseline.json"));
  const catalog = buildCatalog(baseline, digests);
  const catalogErrors = validateCatalog(catalog);
  if (catalogErrors.length > 0) {
    throw new Error(`内容目录校验失败：\n- ${catalogErrors.join("\n- ")}`);
  }

  const latestDate = dates[0];
  const latestDigest = latestDate === digest.date
    ? digest
    : await readJson(resolve(archiveDirectory, `${latestDate}.json`));
  const publicationIndex = { schemaVersion: 1, latest: latestDate, dates };
  const values = [
    [`content/digests/${digest.date}.json`, digest],
    ["content/latest.json", latestDigest],
    ["content/index.json", publicationIndex],
    ["content/catalog.json", catalog],
  ];

  return {
    root,
    digest,
    latestDate,
    catalog,
    files: values.map(([relativePath, value]) => ({
      relativePath,
      absolutePath: resolve(root, relativePath),
      value,
      contents: stableJson(value),
    })),
  };
}

export async function applyPublicationPlan(plan) {
  await mkdir(resolve(plan.root, "content", "digests"), { recursive: true });
  for (const file of plan.files) await atomicWriteJson(file.absolutePath, file.value);
  return plan;
}

export async function publishDigest(inputPath, options = {}) {
  const plan = await planDigestPublication(inputPath, options);
  await applyPublicationPlan(plan);
  return plan;
}

const entrypoint = process.argv[1] ? resolve(process.argv[1]) : null;
if (entrypoint === fileURLToPath(import.meta.url)) {
  const input = process.argv[2];
  if (!input) {
    console.error("用法：npm run digest:publish -- <日报草稿.json>");
    process.exit(1);
  }

  try {
    const plan = await publishDigest(input);
    console.log(`已发布 ${plan.digest.date}：${resolve(plan.root, "content", "digests", `${plan.digest.date}.json`)}`);
    console.log(`当前最新一期：${plan.latestDate}`);
    console.log(`累计内容：${plan.catalog.total} 篇`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
