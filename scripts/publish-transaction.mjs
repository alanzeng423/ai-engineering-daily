import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runPublicationTransaction } from "./publication-transaction.mjs";

const [inputPath, runDirectory] = process.argv.slice(2);
if (!inputPath || !runDirectory) {
  console.error("用法：npm run digest:transaction -- <日报草稿.json> <RUN_DIRECTORY>");
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try {
  const { plan, transactionPath } = await runPublicationTransaction(inputPath, runDirectory, { root });
  console.log(`发布事务校验通过：${plan.digest.date}`);
  console.log(`累计内容：${plan.catalog.total} 篇`);
  console.log(`事务记录：${transactionPath}`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
