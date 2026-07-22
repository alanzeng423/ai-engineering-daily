import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readAndValidateDigest, stableJson } from "./digest-schema.mjs";

const input = process.argv[2];
if (!input) {
  console.error("用法：npm run digest:publish -- <日报草稿.json>");
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contentDirectory = resolve(root, "content");
const archiveDirectory = resolve(contentDirectory, "digests");
const indexPath = resolve(contentDirectory, "index.json");
const latestPath = resolve(contentDirectory, "latest.json");

async function atomicWrite(path, value) {
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, stableJson(value), "utf8");
  await rename(temporaryPath, path);
}

try {
  const digest = await readAndValidateDigest(resolve(input));
  const index = JSON.parse(await readFile(indexPath, "utf8"));
  const existingDates = Array.isArray(index.dates) ? index.dates : [];
  const dates = [...new Set([...existingDates, digest.date])].sort().reverse();
  const archivePath = resolve(archiveDirectory, `${digest.date}.json`);

  await mkdir(archiveDirectory, { recursive: true });
  await atomicWrite(archivePath, digest);

  const latestDate = dates[0];
  const latestDigest =
    latestDate === digest.date
      ? digest
      : JSON.parse(await readFile(resolve(archiveDirectory, `${latestDate}.json`), "utf8"));

  await atomicWrite(latestPath, latestDigest);
  await atomicWrite(indexPath, {
    schemaVersion: 1,
    latest: latestDate,
    dates,
  });

  console.log(`已发布 ${digest.date}：${archivePath}`);
  console.log(`当前最新一期：${latestDate}`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
