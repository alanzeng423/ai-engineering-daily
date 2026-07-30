import { execFile } from "node:child_process";
import { appendFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { atomicWriteJson, readJson } from "./atomic-json.mjs";

const execFileAsync = promisify(execFile);
const DEFAULT_CHECK_NAME = "Workers Builds: ai-engineering-daily";
const DEFAULT_BASE_URL = "https://ai.alanzeng.com";
const DEFAULT_INTERVAL_MS = 20_000;
const DEFAULT_TIMEOUT_MS = 10 * 60_000;

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function asNonNegativeInteger(value, fallback, label) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} 必须是非负整数`);
  }
  return parsed;
}

function decodeHtml(value) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&nbsp;", " ");
}

export function parseGitHubRepository(remote) {
  const value = String(remote ?? "").trim().replace(/\.git$/, "");
  const httpsMatch = value.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)$/i);
  if (httpsMatch) return `${httpsMatch[1]}/${httpsMatch[2]}`;
  const sshMatch = value.match(/^(?:ssh:\/\/)?git@github\.com[:/]([^/]+)\/([^/]+)$/i);
  if (sshMatch) return `${sshMatch[1]}/${sshMatch[2]}`;
  throw new Error(`无法从 origin 解析 GitHub 仓库：${value || "<empty>"}`);
}

export function selectCheckRun(checkRuns, commitSha, checkName = DEFAULT_CHECK_NAME) {
  return (checkRuns ?? [])
    .filter((item) => item?.name === checkName && item?.head_sha === commitSha)
    .sort((left, right) => Number(right.id ?? 0) - Number(left.id ?? 0))[0] ?? null;
}

export function inspectRenderedPage(html, expected) {
  const decoded = decodeHtml(String(html ?? ""));
  const articleCount = (decoded.match(/<article\b/g) ?? []).length;
  const missingTexts = expected.texts.filter((text) => !decoded.includes(text));
  return {
    articleCount,
    expectedArticleCount: expected.articleCount,
    missingTexts,
    matched: articleCount === expected.articleCount && missingTexts.length === 0,
  };
}

async function defaultGetCheckRuns({ repository, commitSha, cwd }) {
  const endpoint = `repos/${repository}/commits/${commitSha}/check-runs`;
  const candidates = [process.env.GH_BIN, "gh", "/opt/homebrew/bin/gh"].filter(Boolean);
  let missingExecutable = null;
  for (const executable of [...new Set(candidates)]) {
    try {
      const { stdout } = await execFileAsync(executable, ["api", endpoint], {
        cwd,
        encoding: "utf8",
        maxBuffer: 20 * 1024 * 1024,
      });
      return JSON.parse(stdout).check_runs ?? [];
    } catch (error) {
      if (error.code === "ENOENT") {
        missingExecutable = error;
        continue;
      }
      throw error;
    }
  }
  throw missingExecutable ?? new Error("找不到 gh CLI");
}

async function defaultResolveRepository(root) {
  const { stdout } = await execFileAsync("git", ["config", "--get", "remote.origin.url"], {
    cwd: root,
    encoding: "utf8",
  });
  return parseGitHubRepository(stdout);
}

function commandLabel(runDirectory, commitSha, timeoutMs, intervalMs) {
  return `npm run deployment:verify -- ${runDirectory} ${commitSha} --timeout-ms ${timeoutMs} --interval-ms ${intervalMs}`;
}

async function appendEvent(runDirectory, event) {
  await appendFile(resolve(runDirectory, "events.ndjson"), `${JSON.stringify(event)}\n`, "utf8");
}

async function saveAttempt({
  runDirectory,
  manifest,
  checks,
  attestation,
  command,
  startedAt,
  error,
}) {
  const completedAt = new Date().toISOString();
  const successful = !error;
  const commandResult = {
    name: "deployment_verify",
    command,
    startedAt,
    completedAt,
    exitCode: successful ? 0 : 1,
    stdout: successful
      ? JSON.stringify({
          checkRunId: attestation.check.id,
          checkCompletedAt: attestation.check.completedAt,
          homepageArticles: attestation.production.root.articleCount,
          todayArticles: attestation.production.today.articleCount,
        })
      : "",
    stderr: successful ? "" : error.message,
  };
  checks.commands = [...(checks.commands ?? []), commandResult];
  checks.deployment = {
    ...(checks.deployment ?? {}),
    checkName: attestation.check?.name ?? DEFAULT_CHECK_NAME,
    status: successful ? "success" : attestation.failure?.code ?? "failed",
    conclusion: attestation.check?.conclusion ?? null,
    detailsUrl: attestation.check?.detailsUrl ?? null,
    checkRunId: attestation.check?.id ?? null,
    checkStatus: attestation.check?.status ?? null,
    checkCompletedAt: attestation.check?.completedAt ?? null,
    url: attestation.production?.baseUrl ?? DEFAULT_BASE_URL,
    httpStatus: attestation.production?.root?.httpStatus ?? null,
    verified: successful,
    verifiedAt: successful ? attestation.completedAt : null,
    homepageArticles: attestation.production?.root?.articleCount ?? null,
    todayArticles: attestation.production?.today?.articleCount ?? null,
    verificationMethod: "scripts/verify-deployment.mjs",
    evidenceFile: "deployment-verification.json",
  };
  if (successful) {
    manifest.status = "completed";
    manifest.stage = "completed";
    manifest.finishedAt = completedAt;
    manifest.failure = null;
  } else {
    manifest.status = "failed";
    manifest.stage = "deployment";
    manifest.finishedAt = completedAt;
    manifest.failure = {
      stage: "deployment",
      code: attestation.failure?.code ?? "deployment_verification_failed",
      message: error.message,
    };
  }
  const evidencePath = resolve(runDirectory, "deployment-verification.json");
  let previousEvidence = null;
  try {
    previousEvidence = await readJson(evidencePath);
  } catch (readError) {
    if (readError.code !== "ENOENT" && readError.message !== "Unexpected end of JSON input") {
      throw readError;
    }
  }
  const priorAttempts = Array.isArray(previousEvidence?.attempts)
    ? previousEvidence.attempts
    : previousEvidence
      ? [{ ...previousEvidence, attempts: undefined }]
      : [];
  const evidence = {
    ...attestation,
    attempts: [...priorAttempts, attestation],
  };
  await atomicWriteJson(evidencePath, evidence);
  await atomicWriteJson(resolve(runDirectory, "checks.json"), checks);
  await atomicWriteJson(resolve(runDirectory, "manifest.json"), manifest);
  await appendEvent(runDirectory, {
    at: completedAt,
    stage: successful ? "completed" : "deployment",
    event: successful ? "deployment_verified_by_script" : "deployment_verification_failed",
    commitSha: attestation.commitSha,
    checkRunId: attestation.check?.id ?? null,
    failure: attestation.failure ?? null,
  });
}

export async function verifyDeployment(options) {
  const runDirectory = resolve(options.runDirectory);
  const root = resolve(options.root ?? dirname(dirname(dirname(dirname(runDirectory)))));
  const commitSha = options.commitSha;
  if (!/^[0-9a-f]{7,40}$/i.test(commitSha ?? "")) {
    throw new Error("commit-sha 格式不合法");
  }
  const timeoutMs = asNonNegativeInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS, "timeout-ms");
  const intervalMs = asNonNegativeInteger(options.intervalMs, DEFAULT_INTERVAL_MS, "interval-ms");
  if (intervalMs === 0 && timeoutMs > 0) {
    throw new Error("interval-ms 只有在 timeout-ms=0 时才可为 0");
  }
  const checkName = options.checkName ?? DEFAULT_CHECK_NAME;
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const getCheckRuns = options.getCheckRuns ?? defaultGetCheckRuns;
  const resolveRepository = options.resolveRepository ?? defaultResolveRepository;
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? ((duration) => new Promise((resolveSleep) => setTimeout(resolveSleep, duration)));
  const now = options.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const command = commandLabel(runDirectory, commitSha, timeoutMs, intervalMs);
  const manifest = await readJson(resolve(runDirectory, "manifest.json"));
  const checks = await readJson(resolve(runDirectory, "checks.json"));
  const latest = await readJson(resolve(root, "content/latest.json"));
  const catalog = await readJson(resolve(root, "content/catalog.json"));
  const repository = options.repository ?? await resolveRepository(root);
  const expectedCommit = checks.git?.commitSha;
  if (checks.git?.pushed !== true || !hasText(expectedCommit)) {
    throw new Error("checks.json 尚未记录已推送提交");
  }
  if (!commitSha.startsWith(expectedCommit) && !expectedCommit.startsWith(commitSha)) {
    throw new Error(`待验证提交与 checks.git.commitSha 不一致：${commitSha}`);
  }
  if (latest.date !== manifest.targetDate) {
    throw new Error(`content/latest.json 日期 ${latest.date} 与 run ${manifest.targetDate} 不一致`);
  }
  manifest.status = "running";
  manifest.stage = "deployment";
  manifest.finishedAt = null;
  manifest.failure = null;
  await atomicWriteJson(resolve(runDirectory, "manifest.json"), manifest);

  const attestation = {
    schemaVersion: 1,
    targetDate: manifest.targetDate,
    commitSha: expectedCommit,
    repository,
    startedAt,
    completedAt: null,
    status: "running",
    check: {
      name: checkName,
      id: null,
      headSha: null,
      status: null,
      conclusion: null,
      detailsUrl: null,
      startedAt: null,
      completedAt: null,
      polls: [],
    },
    production: {
      baseUrl,
      polls: [],
      root: null,
      today: null,
    },
    failure: null,
  };

  try {
    const maxAttempts = Math.max(1, Math.floor(timeoutMs / Math.max(intervalMs, 1)) + 1);
    let matchedCheck = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const observedAt = now().toISOString();
      const checkRuns = await getCheckRuns({ repository, commitSha: expectedCommit, cwd: root });
      matchedCheck = selectCheckRun(checkRuns, expectedCommit, checkName);
      attestation.check.polls.push({
        attempt,
        observedAt,
        found: Boolean(matchedCheck),
        status: matchedCheck?.status ?? null,
        conclusion: matchedCheck?.conclusion ?? null,
        checkRunId: matchedCheck?.id ?? null,
      });
      if (matchedCheck) {
        Object.assign(attestation.check, {
          id: matchedCheck.id,
          headSha: matchedCheck.head_sha,
          status: matchedCheck.status,
          conclusion: matchedCheck.conclusion,
          detailsUrl: matchedCheck.details_url ?? matchedCheck.html_url ?? null,
          startedAt: matchedCheck.started_at ?? null,
          completedAt: matchedCheck.completed_at ?? null,
        });
      }
      if (matchedCheck?.status === "completed") {
        if (matchedCheck.conclusion !== "success") {
          const failure = new Error(`Cloudflare Check 已结束但结论为 ${matchedCheck.conclusion}`);
          failure.code = "cloudflare_check_failed";
          throw failure;
        }
        break;
      }
      if (attempt < maxAttempts) await sleep(intervalMs);
    }
    if (matchedCheck?.status !== "completed") {
      const failure = new Error(`Cloudflare Check 在 ${timeoutMs}ms 内未完成`);
      failure.code = "cloudflare_check_timeout";
      throw failure;
    }
    if (!hasText(attestation.check.completedAt)) {
      const failure = new Error("Cloudflare Check 缺少 completed_at，不能作为成功证据");
      failure.code = "cloudflare_check_incomplete_evidence";
      throw failure;
    }

    const expectedRootCount = catalog.total ?? catalog.items?.length;
    const expectedTodayCount = latest.items.length;
    const firstTitle = latest.items[0]?.title;
    if (!Number.isInteger(expectedRootCount) || !hasText(firstTitle)) {
      throw new Error("本地 catalog/latest 缺少部署验证所需内容");
    }
    let productionMatched = false;
    const productionAttempts = maxAttempts;
    for (let attempt = 1; attempt <= productionAttempts; attempt += 1) {
      const observedAt = now().toISOString();
      try {
        const [rootResponse, todayResponse] = await Promise.all([
          fetchImpl(baseUrl, { headers: { "cache-control": "no-cache" }, signal: AbortSignal.timeout(30_000) }),
          fetchImpl(`${baseUrl}/today`, { headers: { "cache-control": "no-cache" }, signal: AbortSignal.timeout(30_000) }),
        ]);
        const [rootHtml, todayHtml] = await Promise.all([rootResponse.text(), todayResponse.text()]);
        const rootInspection = inspectRenderedPage(rootHtml, {
          articleCount: expectedRootCount,
          texts: [manifest.targetDate, firstTitle],
        });
        const todayInspection = inspectRenderedPage(todayHtml, {
          articleCount: expectedTodayCount,
          texts: [manifest.targetDate, latest.overview, firstTitle],
        });
        const observation = {
          attempt,
          observedAt,
          root: { httpStatus: rootResponse.status, ...rootInspection },
          today: { httpStatus: todayResponse.status, ...todayInspection },
        };
        attestation.production.polls.push(observation);
        if (rootResponse.status === 200 && todayResponse.status === 200 && rootInspection.matched && todayInspection.matched) {
          attestation.production.root = observation.root;
          attestation.production.today = observation.today;
          productionMatched = true;
          break;
        }
      } catch (error) {
        attestation.production.polls.push({ attempt, observedAt, error: error.message });
      }
      if (attempt < productionAttempts) await sleep(intervalMs);
    }
    if (!productionMatched) {
      const failure = new Error(`正式域名在 ${timeoutMs}ms 内未匹配提交内容`);
      failure.code = "production_verification_timeout";
      throw failure;
    }
    attestation.status = "success";
    attestation.completedAt = now().toISOString();
    await saveAttempt({ runDirectory, manifest, checks, attestation, command, startedAt, error: null });
    return attestation;
  } catch (error) {
    attestation.status = "failed";
    attestation.completedAt = now().toISOString();
    attestation.failure = {
      code: error.code ?? "deployment_verification_failed",
      message: error.message,
    };
    await saveAttempt({ runDirectory, manifest, checks, attestation, command, startedAt, error });
    throw error;
  }
}

function parseArguments(argumentsList) {
  const [runDirectory, commitSha, ...flags] = argumentsList;
  const options = { runDirectory, commitSha };
  for (let index = 0; index < flags.length; index += 2) {
    const flag = flags[index];
    const value = flags[index + 1];
    if (flag === "--timeout-ms") options.timeoutMs = value;
    else if (flag === "--interval-ms") options.intervalMs = value;
    else if (flag === "--base-url") options.baseUrl = value;
    else throw new Error(`未知参数：${flag}`);
  }
  return options;
}

const entrypoint = process.argv[1] ? resolve(process.argv[1]) : null;
if (entrypoint === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (!options.runDirectory || !options.commitSha) {
      throw new Error("用法：npm run deployment:verify -- <RUN_DIRECTORY> <COMMIT_SHA> [--timeout-ms N] [--interval-ms N]");
    }
    const result = await verifyDeployment(options);
    console.log(JSON.stringify({
      status: result.status,
      commitSha: result.commitSha,
      checkRunId: result.check.id,
      homepageArticles: result.production.root.articleCount,
      todayArticles: result.production.today.articleCount,
    }));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
