import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { buildCatalog } from "../scripts/catalog-schema.mjs";
import { stableJson } from "../scripts/digest-schema.mjs";
import { finalizePublication } from "../scripts/finalize-publication.mjs";
import { applyPublicationPlan } from "../scripts/publish-digest.mjs";
import {
  preparePublicationTransaction,
  runPublicationTransaction,
} from "../scripts/publication-transaction.mjs";
import { recoverPublication } from "../scripts/recover-publication.mjs";

const execFileAsync = promisify(execFile);

function story(date, suffix) {
  return {
    category: "Agent 可靠性",
    sourceType: "blog",
    source: "Example Engineering",
    publishedAt: date,
    readTime: "8 min",
    title: `用执行轨迹改进长任务中的故障恢复能力 ${suffix}`,
    summary: "文章分析长任务中故障暴露位置与真正根因不一致的问题，并通过结构化轨迹回放定位关键步骤。实验给出了恢复成功率和额外运行成本。",
    why: "它为生产 Agent 的故障诊断、自动恢复与回归测试提供了可复用的工程方法。",
    url: `https://example.com/agent-reliability-${suffix}`,
    tags: ["故障恢复", "执行轨迹"],
  };
}

function digest(issue, date, suffix) {
  return {
    schemaVersion: 1,
    issue,
    date,
    generatedAt: `${date}T16:00:00Z`,
    overview: "本期集中讨论可靠的智能系统如何进入真实软件工程流程，并给出可以复核的工程证据。",
    items: [story(date, suffix)],
  };
}

async function writeJson(path, value) {
  await writeFile(path, stableJson(value));
}

async function createFixture(t) {
  const root = await mkdtemp(join(tmpdir(), "daily-publication-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const content = resolve(root, "content");
  const runDirectory = resolve(root, "research", "runs", "2026-07-21", "run-001");
  await mkdir(resolve(content, "digests"), { recursive: true });
  await mkdir(resolve(content, "inbox"), { recursive: true });
  await mkdir(runDirectory, { recursive: true });

  const baseline = {
    schemaVersion: 1,
    id: "foundation-test",
    title: "AI 工程基础精选",
    generatedAt: "2026-07-20T16:00:00Z",
    coverage: {
      from: "2026-07-20",
      to: "2026-07-20",
      primaryFrom: "2026-07-20",
      primaryTo: "2026-07-20",
      exceptionalOlder: 0,
    },
    overview: "本次回溯整理可复核的一手工程文章和实证研究，为后续每日新增内容建立稳定的历史基底。",
    items: [story("2026-07-20", "baseline")],
  };
  const previousDigest = digest(1, "2026-07-20", "previous");
  const nextDigest = digest(2, "2026-07-21", "next");
  const index = { schemaVersion: 1, latest: "2026-07-20", dates: ["2026-07-20"] };
  const catalog = buildCatalog(baseline, [previousDigest]);

  await writeJson(resolve(content, "baseline.json"), baseline);
  await writeJson(resolve(content, "index.json"), index);
  await writeJson(resolve(content, "latest.json"), previousDigest);
  await writeJson(resolve(content, "catalog.json"), catalog);
  await writeJson(resolve(content, "digests", "2026-07-20.json"), previousDigest);
  const inputPath = resolve(content, "inbox", "2026-07-21.json");
  await writeJson(inputPath, nextDigest);
  await writeJson(resolve(runDirectory, "manifest.json"), { targetDate: "2026-07-21" });

  return { root, content, runDirectory, inputPath };
}

test("leaves a validated publication ready for Git after tests pass", async (t) => {
  const fixture = await createFixture(t);
  const result = await runPublicationTransaction(fixture.inputPath, fixture.runDirectory, {
    root: fixture.root,
    requireClean: false,
    testRunner: async () => ({ exitCode: 0, stdout: "ok", stderr: "" }),
  });

  assert.equal(result.transaction.status, "validated");
  const index = JSON.parse(await readFile(resolve(fixture.content, "index.json"), "utf8"));
  assert.equal(index.latest, "2026-07-21");
  await access(resolve(fixture.content, "digests", "2026-07-21.json"));
});

test("finalizes only when the Git commit contains every expected publication file", async (t) => {
  const fixture = await createFixture(t);
  await runPublicationTransaction(fixture.inputPath, fixture.runDirectory, {
    root: fixture.root,
    requireClean: false,
    testRunner: async () => ({ exitCode: 0, stdout: "ok", stderr: "" }),
  });
  await execFileAsync("git", ["init", "-b", "main"], { cwd: fixture.root });
  await execFileAsync("git", ["config", "user.email", "tests@example.com"], { cwd: fixture.root });
  await execFileAsync("git", ["config", "user.name", "Tests"], { cwd: fixture.root });
  await execFileAsync("git", ["add", "content"], { cwd: fixture.root });
  await execFileAsync("git", ["commit", "-m", "Publish daily digest 2026-07-21"], {
    cwd: fixture.root,
  });
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
    cwd: fixture.root,
    encoding: "utf8",
  });

  const transaction = await finalizePublication(fixture.runDirectory, stdout.trim());
  assert.equal(transaction.status, "committed");
  assert.equal(transaction.commitSha, stdout.trim());
});

test("restores exactly the prior public files when tests fail", async (t) => {
  const fixture = await createFixture(t);
  const trackedPaths = ["index.json", "latest.json", "catalog.json"];
  const before = Object.fromEntries(
    await Promise.all(trackedPaths.map(async (name) => [name, await readFile(resolve(fixture.content, name), "utf8")])),
  );

  await assert.rejects(
    () => runPublicationTransaction(fixture.inputPath, fixture.runDirectory, {
      root: fixture.root,
      requireClean: false,
      testRunner: async () => ({ exitCode: 1, stdout: "", stderr: "broken test" }),
    }),
    /自动回滚/,
  );
  for (const name of trackedPaths) {
    assert.equal(await readFile(resolve(fixture.content, name), "utf8"), before[name]);
  }
  await assert.rejects(() => access(resolve(fixture.content, "digests", "2026-07-21.json")));
  const transaction = JSON.parse(
    await readFile(resolve(fixture.runDirectory, "publication-transaction.json"), "utf8"),
  );
  assert.equal(transaction.status, "rolled_back");
});

test("a later run can recover an interrupted mixed publication without mutating its archive", async (t) => {
  const fixture = await createFixture(t);
  const prepared = await preparePublicationTransaction(fixture.inputPath, fixture.runDirectory, {
    root: fixture.root,
  });
  await applyPublicationPlan(prepared.plan);
  const sourceBefore = await readFile(prepared.transactionPath, "utf8");
  const recoveryRun = resolve(fixture.root, "research", "runs", "2026-07-22", "run-002");
  await mkdir(recoveryRun, { recursive: true });

  const result = await recoverPublication(recoveryRun, { root: fixture.root });
  assert.ok(result);
  const index = JSON.parse(await readFile(resolve(fixture.content, "index.json"), "utf8"));
  assert.equal(index.latest, "2026-07-20");
  await assert.rejects(() => access(resolve(fixture.content, "digests", "2026-07-21.json")));
  assert.equal(await readFile(prepared.transactionPath, "utf8"), sourceBefore);
  await access(result.receiptPath);
});
