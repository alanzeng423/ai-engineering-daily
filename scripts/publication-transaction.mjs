import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { mkdir, readFile, unlink } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";
import { promisify } from "node:util";

import { atomicWriteJson, atomicWriteText, readJson } from "./atomic-json.mjs";
import { applyPublicationPlan, planDigestPublication } from "./publish-digest.mjs";

const execFileAsync = promisify(execFile);

export function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

export async function snapshotPath(path) {
  try {
    const contents = await readFile(path, "utf8");
    return { exists: true, contents, sha256: sha256(contents) };
  } catch (error) {
    if (error.code === "ENOENT") return { exists: false, contents: null, sha256: null };
    throw error;
  }
}

function backupName(relativePath) {
  return relativePath.replaceAll("/", "__");
}

async function writeTransaction(path, transaction) {
  await atomicWriteJson(path, transaction);
  return transaction;
}

export async function preparePublicationTransaction(inputPath, runDirectoryInput, options = {}) {
  const root = resolve(options.root);
  const runDirectory = resolve(runDirectoryInput);
  const plan = await planDigestPublication(inputPath, { root });
  const manifest = await readJson(resolve(runDirectory, "manifest.json"));
  if (manifest.targetDate !== plan.digest.date) {
    throw new Error("RUN_DIRECTORY 的 targetDate 与日报日期不一致");
  }

  const transactionPath = resolve(runDirectory, "publication-transaction.json");
  try {
    await readFile(transactionPath, "utf8");
    throw new Error(`本次 run 已存在发布事务：${transactionPath}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const backupDirectory = resolve(runDirectory, "publication-backup");
  await mkdir(backupDirectory, { recursive: false });
  const files = [];
  for (const file of plan.files) {
    const before = await snapshotPath(file.absolutePath);
    const backupPath = before.exists ? resolve(backupDirectory, backupName(file.relativePath)) : null;
    if (backupPath) await atomicWriteText(backupPath, before.contents);
    files.push({
      relativePath: file.relativePath,
      before: {
        exists: before.exists,
        sha256: before.sha256,
        backupPath: backupPath ? relative(runDirectory, backupPath) : null,
      },
      after: { exists: true, sha256: sha256(file.contents) },
    });
  }

  const now = new Date().toISOString();
  const transaction = {
    schemaVersion: 1,
    targetDate: plan.digest.date,
    runDirectory,
    root,
    preparedAt: now,
    updatedAt: now,
    status: "prepared",
    files,
    test: {
      command: "npm test",
      startedAt: null,
      finishedAt: null,
      exitCode: null,
      stdout: "",
      stderr: "",
    },
    failure: null,
    commitSha: null,
  };
  await writeTransaction(transactionPath, transaction);
  return { plan, transaction, transactionPath, runDirectory, root };
}

export async function restorePublicationFiles(transaction, transactionPath, reason, options = {}) {
  const { record = true } = options;
  const runDirectory = resolve(transaction.runDirectory);
  const root = resolve(transaction.root);

  for (const file of transaction.files) {
    const targetPath = resolve(root, file.relativePath);
    const current = await snapshotPath(targetPath);
    const allowedHashes = new Set([file.before.sha256, file.after.sha256].filter(Boolean));
    const allowedMissing = !file.before.exists || !file.after.exists;
    if (current.exists ? !allowedHashes.has(current.sha256) : !allowedMissing) {
      transaction.status = "recovery_required";
      transaction.updatedAt = new Date().toISOString();
      transaction.failure = {
        stage: "rollback",
        message: `拒绝覆盖非事务内容：${file.relativePath}`,
        originalReason: reason,
      };
      if (record) await writeTransaction(transactionPath, transaction);
      throw new Error(transaction.failure.message);
    }

    if (file.before.exists) {
      const backupPath = resolve(runDirectory, file.before.backupPath);
      const backup = await readFile(backupPath, "utf8");
      if (sha256(backup) !== file.before.sha256) {
        throw new Error(`发布备份校验失败：${file.relativePath}`);
      }
      await atomicWriteText(targetPath, backup);
    } else if (current.exists) {
      await unlink(targetPath);
    }
  }

  for (const file of transaction.files) {
    const restored = await snapshotPath(resolve(root, file.relativePath));
    if (restored.exists !== file.before.exists || restored.sha256 !== file.before.sha256) {
      throw new Error(`发布回滚后的内容不一致：${file.relativePath}`);
    }
  }

  transaction.status = "rolled_back";
  transaction.updatedAt = new Date().toISOString();
  transaction.rolledBackAt = transaction.updatedAt;
  transaction.failure = { stage: "validation", message: reason };
  if (record) await writeTransaction(transactionPath, transaction);
  return transaction;
}

export async function runNpmTest(root) {
  const startedAt = new Date().toISOString();
  const result = await new Promise((resolveResult) => {
    const child = spawn("npm", ["test"], {
      cwd: root,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => resolveResult({ exitCode: 1, stdout, stderr: `${stderr}${error.message}` }));
    child.on("close", (exitCode) => resolveResult({ exitCode: exitCode ?? 1, stdout, stderr }));
  });
  return { ...result, startedAt, finishedAt: new Date().toISOString() };
}

export async function assertCleanWorktree(root) {
  const { stdout } = await execFileAsync("git", ["status", "--porcelain"], {
    cwd: root,
    encoding: "utf8",
  });
  if (stdout.trim()) {
    throw new Error(`发布事务要求干净工作区，当前存在改动：\n${stdout.trim()}`);
  }
}

export async function runPublicationTransaction(inputPath, runDirectory, options = {}) {
  const root = resolve(options.root);
  if (options.requireClean !== false) await assertCleanWorktree(root);
  const prepared = await preparePublicationTransaction(inputPath, runDirectory, { root });
  const { plan, transaction, transactionPath } = prepared;
  const testRunner = options.testRunner ?? (() => runNpmTest(root));

  try {
    await applyPublicationPlan(plan);
    transaction.status = "applied";
    transaction.updatedAt = new Date().toISOString();
    await writeTransaction(transactionPath, transaction);

    for (const file of transaction.files) {
      const installed = await snapshotPath(resolve(root, file.relativePath));
      if (!installed.exists || installed.sha256 !== file.after.sha256) {
        throw new Error(`发布文件写入后校验失败：${file.relativePath}`);
      }
    }

    transaction.status = "testing";
    transaction.updatedAt = new Date().toISOString();
    transaction.test.startedAt = transaction.updatedAt;
    await writeTransaction(transactionPath, transaction);

    const test = await testRunner();
    transaction.test = {
      command: "npm test",
      startedAt: test.startedAt ?? transaction.test.startedAt,
      finishedAt: test.finishedAt ?? new Date().toISOString(),
      exitCode: test.exitCode,
      stdout: test.stdout ?? "",
      stderr: test.stderr ?? "",
    };
    if (test.exitCode !== 0) throw new Error(`npm test 失败（exit ${test.exitCode}）`);

    transaction.status = "validated";
    transaction.updatedAt = new Date().toISOString();
    transaction.validatedAt = transaction.updatedAt;
    await writeTransaction(transactionPath, transaction);
    return { plan, transaction, transactionPath };
  } catch (error) {
    await restorePublicationFiles(transaction, transactionPath, error.message);
    const rolledBackError = new Error(`${error.message}；公开内容已自动回滚`);
    rolledBackError.cause = error;
    throw rolledBackError;
  }
}

export function validateTransactionPath(transactionPath) {
  if (basename(transactionPath) !== "publication-transaction.json") {
    throw new Error("发布事务文件名必须是 publication-transaction.json");
  }
}
