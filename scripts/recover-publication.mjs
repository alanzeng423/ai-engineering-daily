import { mkdir, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { atomicWriteJson, readJson } from "./atomic-json.mjs";
import { restorePublicationFiles, snapshotPath, validateTransactionPath } from "./publication-transaction.mjs";

const RECOVERABLE_STATUSES = new Set([
  "prepared",
  "applied",
  "testing",
  "validated",
  "recovery_required",
]);

async function findTransactionFiles(directory) {
  const matches = [];
  let entries = [];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return matches;
    throw error;
  }
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) matches.push(...await findTransactionFiles(path));
    else if (entry.name === "publication-transaction.json") matches.push(path);
  }
  return matches;
}

async function matchesRecoverableState(transaction) {
  let hasAfterState = false;
  for (const file of transaction.files ?? []) {
    const current = await snapshotPath(resolve(transaction.root, file.relativePath));
    const beforeMatches = current.exists === file.before.exists && current.sha256 === file.before.sha256;
    const afterMatches = current.exists === file.after.exists && current.sha256 === file.after.sha256;
    if (!beforeMatches && !afterMatches) return false;
    if (afterMatches && !beforeMatches) hasAfterState = true;
  }
  return hasAfterState;
}

export async function findRecoverableTransaction(root) {
  const paths = await findTransactionFiles(resolve(root, "research", "runs"));
  const candidates = [];
  for (const path of paths) {
    const transaction = await readJson(path);
    if (!RECOVERABLE_STATUSES.has(transaction.status)) continue;
    if (await matchesRecoverableState(transaction)) candidates.push({ path, transaction });
  }
  candidates.sort((left, right) => Date.parse(right.transaction.updatedAt) - Date.parse(left.transaction.updatedAt));
  return candidates[0] ?? null;
}

export async function recoverPublication(currentRunDirectory, options = {}) {
  const root = resolve(options.root);
  const explicitPath = options.transactionPath ? resolve(options.transactionPath) : null;
  let source = null;
  if (explicitPath) {
    validateTransactionPath(explicitPath);
    source = { path: explicitPath, transaction: await readJson(explicitPath) };
    if (!await matchesRecoverableState(source.transaction)) {
      throw new Error("指定事务与当前公开文件状态不匹配，拒绝恢复");
    }
  } else {
    source = await findRecoverableTransaction(root);
  }
  if (!source) return null;

  const transaction = structuredClone(source.transaction);
  await restorePublicationFiles(
    transaction,
    source.path,
    "下一次运行恢复了中断的发布事务",
    { record: false },
  );

  const recoveryDirectory = resolve(currentRunDirectory, "publication-recoveries");
  await mkdir(recoveryDirectory, { recursive: true });
  const receipt = {
    schemaVersion: 1,
    recoveredAt: new Date().toISOString(),
    sourceTransaction: source.path,
    targetDate: source.transaction.targetDate,
    files: source.transaction.files.map((file) => file.relativePath),
  };
  const receiptPath = resolve(recoveryDirectory, `${Date.now()}-recovery.json`);
  await atomicWriteJson(receiptPath, receipt);
  return { receipt, receiptPath };
}

const entrypoint = process.argv[1] ? resolve(process.argv[1]) : null;
if (entrypoint === fileURLToPath(import.meta.url)) {
  const [currentRunDirectory, transactionPath] = process.argv.slice(2);
  if (!currentRunDirectory) {
    console.error("用法：npm run digest:recover -- <CURRENT_RUN_DIRECTORY> [publication-transaction.json]");
    process.exit(1);
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  try {
    const result = await recoverPublication(currentRunDirectory, { root, transactionPath });
    console.log(result ? `已安全恢复中断发布：${result.receiptPath}` : "没有可恢复的中断发布事务");
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
