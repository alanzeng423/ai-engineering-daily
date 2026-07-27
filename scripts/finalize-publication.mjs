import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { atomicWriteJson, readJson } from "./atomic-json.mjs";
import { sha256, snapshotPath } from "./publication-transaction.mjs";

const execFileAsync = promisify(execFile);

export async function finalizePublication(runDirectory, commitSha) {
  if (!/^[0-9a-f]{7,40}$/i.test(commitSha ?? "")) {
    throw new Error("commit-sha 格式不合法");
  }
  const transactionPath = resolve(runDirectory, "publication-transaction.json");
  const transaction = await readJson(transactionPath);
  if (transaction.status !== "validated") {
    throw new Error(`只能完成 validated 事务，当前状态：${transaction.status}`);
  }
  for (const file of transaction.files) {
    const current = await snapshotPath(resolve(transaction.root, file.relativePath));
    if (!current.exists || current.sha256 !== file.after.sha256) {
      throw new Error(`提交前发布文件发生变化：${file.relativePath}`);
    }
    const { stdout: committed } = await execFileAsync(
      "git",
      ["show", `${commitSha}:${file.relativePath}`],
      { cwd: transaction.root, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
    );
    if (sha256(committed) !== file.after.sha256) {
      throw new Error(`Git 提交不包含事务预期内容：${file.relativePath}`);
    }
  }
  transaction.status = "committed";
  transaction.commitSha = commitSha;
  transaction.committedAt = new Date().toISOString();
  transaction.updatedAt = transaction.committedAt;
  await atomicWriteJson(transactionPath, transaction);
  return transaction;
}

const entrypoint = process.argv[1] ? resolve(process.argv[1]) : null;
if (entrypoint === fileURLToPath(import.meta.url)) {
  const [runDirectory, commitSha] = process.argv.slice(2);
  if (!runDirectory || !commitSha) {
    console.error("用法：npm run digest:finalize -- <RUN_DIRECTORY> <commit-sha>");
    process.exit(1);
  }
  try {
    await finalizePublication(runDirectory, commitSha);
    console.log(`发布事务已绑定提交：${commitSha}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
