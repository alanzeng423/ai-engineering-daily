import { chmod, mkdir, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { appendSourceCoverage } from "./append-source-coverage.mjs";
import { atomicWriteJson, readJson } from "./atomic-json.mjs";
import { stableJson } from "./digest-schema.mjs";
import { loadWatchlist } from "./source-watchlist.mjs";

const USER_AGENT = "AIEngineeringDaily/1.0 (+https://ai.alanzeng.com)";

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function decodeXml(value = "") {
  return value
    .replace(/^<!\[CDATA\[|\]\]>$/g, "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function stripHtml(value = "") {
  return decodeXml(value)
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function tagValue(xml, tag) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i"));
  return match ? decodeXml(match[1].trim()) : "";
}

function shanghaiDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function followingDate(dateString) {
  const date = new Date(`${dateString}T00:00:00+08:00`);
  date.setUTCDate(date.getUTCDate() + 1);
  return shanghaiDate(date);
}

function extractUrls(text = "") {
  return [...new Set(text.match(/https?:\/\/[^\s<>()"']+/g) ?? [])].map((url) =>
    url.replace(/[.,;:!?]+$/, ""),
  );
}

export function estimateXSignal(candidate) {
  const text = candidate.text ?? "";
  const metrics = candidate.metrics ?? {};
  const engagement =
    Number(metrics.likes ?? 0) +
    Number(metrics.reposts ?? 0) * 2 +
    Number(metrics.bookmarks ?? 0) * 2 +
    Number(metrics.quotes ?? 0) * 2;
  let score = Math.min(25, Math.log10(engagement + 1) * 7);
  if (candidate.linkedUrls?.length > 0) score += 15;
  if (text.length >= 180) score += 10;
  if (candidate.authorHandle?.toLowerCase() === candidate.monitoredHandle?.toLowerCase()) score += 10;
  if (!candidate.isReply) score += 5;
  if (!candidate.isRepost) score += 5;
  if (
    /release|launch|technical report|paper|benchmark|open[- ](?:source|weight)|model|agent|coding|repository|changelog|\bapi\b|research|evaluation|inference|training|security|software|debug|test|context|reinforcement learning|发布|技术报告|论文|评测|推理|代码|智能体/i.test(
      text,
    )
  ) {
    score += 20;
  }
  if (
    /join us|we'?re hiring|register now|tickets|booth|giveaway|ambassador program|applications? (?:are )?open|watch (?:us )?live/i.test(
      text,
    )
  ) {
    score -= 20;
  }
  const normalized = Math.max(0, Math.min(100, Math.round(score)));
  return {
    signalScore: normalized,
    reviewPriority: normalized >= 65 ? "high" : normalized >= 40 ? "medium" : "low",
  };
}

export function parseFxTwitterPayload(payload, monitoredHandle) {
  if (!payload || payload.code !== 200 || !Array.isArray(payload.results)) {
    throw new Error("FxTwitter 响应缺少 code=200 或 results 数组");
  }
  return payload.results
    .filter((item) => item?.type === "status" && item.id && item.url && item.created_timestamp)
    .map((item) => {
      const createdAt = new Date(item.created_timestamp * 1000).toISOString();
      const cardUrl = item.card?.url ?? null;
      return {
        id: String(item.id),
        url: item.url,
        text: item.text ?? "",
        createdAt,
        shanghaiDate: shanghaiDate(createdAt),
        author: item.author?.name ?? null,
        authorHandle: item.author?.screen_name ?? null,
        monitoredHandle,
        lang: item.lang ?? null,
        isReply: Boolean(item.replying_to),
        replyingTo: item.replying_to?.url ?? null,
        isRepost: Boolean(item.reposted_by),
        repostedBy: item.reposted_by?.screen_name ?? null,
        metrics: {
          replies: Number(item.replies ?? 0),
          reposts: Number(item.reposts ?? 0),
          likes: Number(item.likes ?? 0),
          quotes: Number(item.quotes ?? 0),
          bookmarks: Number(item.bookmarks ?? 0),
          views: Number(item.views ?? 0),
        },
        card: cardUrl
          ? {
              url: cardUrl,
              title: item.card?.title ?? null,
              description: item.card?.description ?? null,
              domain: item.card?.domain ?? null,
            }
          : null,
        linkedUrls: [...new Set([...extractUrls(item.text), ...(cardUrl ? [cardUrl] : [])])],
        media: (item.media?.all ?? []).map((media) => ({
          type: media.type ?? null,
          url: media.url ?? null,
          width: media.width ?? null,
          height: media.height ?? null,
        })),
        provider: "fxtwitter",
      };
    });
}

export function parseXgoOpml(xml) {
  const accounts = new Map();
  for (const match of xml.matchAll(/<outline\b([^>]+)\/?\s*>/gi)) {
    const attributes = match[1];
    const urlMatch = attributes.match(/xmlUrl="([^"]+)"/i);
    const titleMatch = attributes.match(/(?:text|title)="([^"]+)"/i);
    if (!urlMatch || !titleMatch) continue;
    const title = decodeXml(titleMatch[1]);
    const handle = title.match(/\(@([A-Za-z0-9_]{1,15})\)/)?.[1];
    if (handle) accounts.set(handle.toLowerCase(), { handle, title, url: decodeXml(urlMatch[1]) });
  }
  return accounts;
}

export function parseXgoFeed(xml, monitoredHandle) {
  const results = [];
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const item = match[1];
    const url = tagValue(item, "link");
    const id = tagValue(item, "guid") || url.match(/\/status\/(\d+)/)?.[1];
    const createdRaw = tagValue(item, "dc:date") || tagValue(item, "pubDate");
    const createdAt = new Date(createdRaw);
    if (!id || !url || Number.isNaN(createdAt.getTime())) continue;
    const decodedDescription = decodeXml(tagValue(item, "description"));
    const body = decodedDescription.match(/white-space:\s*pre-wrap[^>]*>([\s\S]*?)<\/div>/i)?.[1];
    const text = stripHtml(body ?? tagValue(item, "title"));
    results.push({
      id: String(id),
      url,
      text,
      createdAt: createdAt.toISOString(),
      shanghaiDate: shanghaiDate(createdAt),
      author: monitoredHandle,
      authorHandle: monitoredHandle,
      monitoredHandle,
      lang: null,
      isReply: false,
      replyingTo: null,
      isRepost: false,
      repostedBy: null,
      metrics: null,
      card: null,
      linkedUrls: extractUrls(text),
      media: [],
      provider: "xgo",
    });
  }
  return results;
}

async function mapLimit(items, limit, mapper) {
  const output = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      output[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return output;
}

async function createBatchAllocator(runDirectory) {
  const names = await readdir(resolve(runDirectory, "retrievals"));
  let next = Math.max(
    0,
    ...names.map((name) => Number.parseInt(name.match(/^(\d{4})/)?.[1] ?? "0", 10)),
  );
  return () => {
    next += 1;
    return String(next).padStart(4, "0");
  };
}

async function writeImmutableRetrieval(runDirectory, allocateBatch, retrieval, label) {
  const batchId = allocateBatch();
  const safeLabel = label.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "");
  const path = resolve(runDirectory, "retrievals", `${batchId}-${safeLabel}.json`);
  const value = { ...retrieval, batchId };
  await writeFile(path, stableJson(value), { encoding: "utf8", flag: "wx" });
  await chmod(path, 0o444);
  return { batchId, path, value };
}

function retryDelays() {
  const configured = process.env.X_RETRY_DELAYS_MS;
  if (!configured) return [15_000, 30_000];
  return configured.split(",").map(Number).filter((value) => Number.isFinite(value) && value >= 0);
}

async function requestAndRecord({
  runDirectory,
  allocateBatch,
  targetDate,
  provider,
  handle,
  url,
  kind,
  parse,
  fetchImpl,
}) {
  const retrievalIds = [];
  const delays = retryDelays();
  const maximumAttempts = delays.length + 1;
  let lastError = null;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    const requestedAt = new Date().toISOString();
    let httpStatus = null;
    let results = [];
    let bodyBytes = 0;
    let retryable = false;
    try {
      const response = await fetchImpl(url, {
        headers: { accept: "application/json, application/xml, text/xml;q=0.9, */*;q=0.1", "user-agent": USER_AGENT },
        signal: AbortSignal.timeout(25_000),
      });
      httpStatus = response.status;
      const body = await response.text();
      bodyBytes = Buffer.byteLength(body);
      if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), { retryable: response.status === 429 || response.status >= 500 });
      results = parse(body);
      const completedAt = new Date().toISOString();
      const retrieval = await writeImmutableRetrieval(
        runDirectory,
        allocateBatch,
        {
          schemaVersion: 1,
          targetDate,
          kind,
          requestedAt,
          completedAt,
          request: { provider, handle, url, attempt },
          response: { status: "success", httpStatus, provider, attempt, bodyBytes },
          results,
        },
        `${kind}-${provider}-${handle ?? "index"}-a${attempt}`,
      );
      retrievalIds.push(retrieval.batchId);
      return { ok: true, provider, handle, results, retrievalIds, attempts: attempt };
    } catch (error) {
      lastError = error;
      retryable = error.retryable === true || error.name === "TimeoutError" || error.name === "AbortError" || httpStatus === null;
      const completedAt = new Date().toISOString();
      const retrieval = await writeImmutableRetrieval(
        runDirectory,
        allocateBatch,
        {
          schemaVersion: 1,
          targetDate,
          kind,
          requestedAt,
          completedAt,
          request: { provider, handle, url, attempt },
          response: {
            status: "error",
            httpStatus,
            provider,
            attempt,
            bodyBytes,
            retryable,
            error: error.message,
          },
          results: [],
        },
        `${kind}-${provider}-${handle ?? "index"}-a${attempt}`,
      );
      retrievalIds.push(retrieval.batchId);
      if (!retryable || attempt === maximumAttempts) break;
      await sleep(delays[attempt - 1]);
    }
  }
  return {
    ok: false,
    provider,
    handle,
    results: [],
    retrievalIds,
    attempts: retrievalIds.length,
    error: lastError?.message ?? "unknown error",
  };
}

async function nextCoverageEntryPath(runDirectory) {
  const directory = resolve(runDirectory, "coverage-entries");
  await mkdir(directory, { recursive: true });
  let next = (await readdir(directory)).filter((name) => name.endsWith(".json")).length + 1;
  while (true) {
    const path = resolve(directory, `${String(next).padStart(4, "0")}-x.json`);
    try {
      await writeFile(path, "", { flag: "wx" });
      return path;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      next += 1;
    }
  }
}

export async function collectXSources(runDirectoryInput, options = {}) {
  const runDirectory = resolve(runDirectoryInput);
  const manifest = await readJson(resolve(runDirectory, "manifest.json"));
  const watchlist = await loadWatchlist(options.watchlistPath);
  const targetDate = manifest.targetDate;
  const startedAt = new Date().toISOString();
  const allocateBatch = await createBatchAllocator(runDirectory);
  const fetchImpl = options.fetchImpl ?? fetch;
  const maximumAccounts = options.maxAccounts ?? watchlist.x.accounts.length;
  const accounts = watchlist.x.accounts
    .toSorted((left, right) => left.priority - right.priority || left.handle.localeCompare(right.handle))
    .slice(0, maximumAccounts);
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 6, 12));

  const primaryResults = await mapLimit(accounts, concurrency, async (account) => {
    const url = watchlist.x.primaryAdapter.profileStatusesUrl.replace(
      "{handle}",
      encodeURIComponent(account.handle),
    );
    return requestAndRecord({
      runDirectory,
      allocateBatch,
      targetDate,
      provider: "fxtwitter",
      handle: account.handle,
      url,
      kind: "social",
      parse: (body) => parseFxTwitterPayload(JSON.parse(body), account.handle),
      fetchImpl,
    });
  });

  const primaryFailures = primaryResults.filter((result) => !result.ok);
  let opmlResult = null;
  let xgoMap = new Map();
  if (primaryFailures.length > 0) {
    opmlResult = await requestAndRecord({
      runDirectory,
      allocateBatch,
      targetDate,
      provider: "xgo",
      handle: null,
      url: watchlist.x.fallbackAdapter.opmlUrl,
      kind: "feed",
      parse: (body) => [...parseXgoOpml(body).values()],
      fetchImpl,
    });
    if (opmlResult.ok) {
      xgoMap = new Map(opmlResult.results.map((item) => [item.handle.toLowerCase(), item]));
    }
  }

  const fallbackByHandle = new Map();
  if (xgoMap.size > 0) {
    const fallbackResults = await mapLimit(primaryFailures, concurrency, async (failure) => {
      const feed = xgoMap.get(failure.handle.toLowerCase());
      if (!feed) return { ok: false, provider: "xgo", handle: failure.handle, results: [], retrievalIds: [], attempts: 0, error: "账号不在 XGo OPML 中" };
      return requestAndRecord({
        runDirectory,
        allocateBatch,
        targetDate,
        provider: "xgo",
        handle: failure.handle,
        url: feed.url,
        kind: "feed",
        parse: (body) => parseXgoFeed(body, failure.handle),
        fetchImpl,
      });
    });
    for (const result of fallbackResults) fallbackByHandle.set(result.handle.toLowerCase(), result);
  }

  const finalResults = primaryResults.map((primary) =>
    primary.ok ? primary : (fallbackByHandle.get(primary.handle.toLowerCase()) ?? primary),
  );
  const allRetrievalIds = [
    ...primaryResults.flatMap((result) => result.retrievalIds),
    ...(opmlResult?.retrievalIds ?? []),
    ...[...fallbackByHandle.values()].flatMap((result) => result.retrievalIds),
  ];
  const tweetsById = new Map();
  for (const result of finalResults.filter((item) => item.ok)) {
    for (const tweet of result.results) {
      const enrichedTweet = {
        ...tweet,
        retrievalIds: result.retrievalIds,
        discoveredVia: [`x:${result.provider}`],
      };
      const existing = tweetsById.get(tweet.id);
      if (!existing || existing.provider === "xgo") tweetsById.set(tweet.id, enrichedTweet);
    }
  }
  const nextDate = followingDate(targetDate);
  const discoveryCandidates = [...tweetsById.values()]
    .filter((tweet) => tweet.shanghaiDate === targetDate || tweet.shanghaiDate === nextDate)
    .map((tweet) => {
      const candidate = {
        id: `x-${tweet.id}`,
        sourceType: "x",
        eventId: null,
        title:
          tweet.text.split("\n").find((line) => line.trim())?.slice(0, 180) ??
          `X post by @${tweet.authorHandle ?? tweet.monitoredHandle}`,
        url: tweet.url,
        canonicalUrl: tweet.url.split("?")[0],
        source: tweet.author ?? tweet.authorHandle ?? tweet.monitoredHandle,
        author: tweet.author ?? tweet.authorHandle ?? tweet.monitoredHandle,
        authorHandle: tweet.authorHandle,
        monitoredHandle: tweet.monitoredHandle,
        publishedAt: tweet.createdAt,
        shanghaiDate: tweet.shanghaiDate,
        dateEligible: tweet.shanghaiDate === targetDate,
        discoveryLead: tweet.shanghaiDate === nextDate,
        text: tweet.text,
        linkedUrls: tweet.linkedUrls,
        metrics: tweet.metrics,
        isReply: tweet.isReply,
        isRepost: tweet.isRepost,
        provider: tweet.provider,
        retrievalIds: tweet.retrievalIds,
        discoveredVia: tweet.discoveredVia,
      };
      return { ...candidate, ...estimateXSignal(candidate) };
    })
    .toSorted(
      (left, right) =>
        Number(right.dateEligible) - Number(left.dateEligible) ||
        right.signalScore - left.signalScore ||
        right.publishedAt.localeCompare(left.publishedAt),
    );

  const succeeded = finalResults.filter((result) => result.ok).length;
  const failed = accounts.length - succeeded;
  const eligibleCandidates = discoveryCandidates.filter((candidate) => candidate.dateEligible).length;
  const successRatio = accounts.length === 0 ? 0 : succeeded / accounts.length;
  let status = "success";
  const notes = [];
  if (succeeded === 0) {
    status = "failed";
    notes.push("两个免费 X 数据源均未成功返回任何账号时间线");
  } else if (successRatio < watchlist.x.minimumSuccessRatio) {
    status = "degraded";
    notes.push(`账号成功率 ${(successRatio * 100).toFixed(1)}% 低于门槛 ${(watchlist.x.minimumSuccessRatio * 100).toFixed(0)}%`);
  }
  if (eligibleCandidates === 0) {
    status = status === "failed" ? "failed" : "degraded";
    notes.push("目标日期的 X 候选为 0，必须重试并在 selection.json 明确记录覆盖缺口");
  }
  const failedHandles = finalResults.filter((result) => !result.ok).map((result) => result.handle);
  if (failedHandles.length > 0) notes.push(`失败账号：${failedHandles.join(", ")}`);

  const completedAt = new Date().toISOString();
  const coverageEntryPath = await nextCoverageEntryPath(runDirectory);
  const entryNumber = coverageEntryPath.match(/\/(\d{4})-x\.json$/)?.[1] ?? Date.now().toString();
  const coverageEntry = {
    id: `coverage-x-${entryNumber}`,
    channel: "x",
    status,
    startedAt,
    completedAt,
    planned: accounts.length,
    attempted: accounts.length,
    succeeded,
    failed,
    rawResults: tweetsById.size,
    eligibleCandidates,
    leadCandidates: discoveryCandidates.length - eligibleCandidates,
    providers: {
      fxtwitter: finalResults.filter((result) => result.ok && result.provider === "fxtwitter").length,
      xgo: finalResults.filter((result) => result.ok && result.provider === "xgo").length,
    },
    retrievalIds: [...new Set(allRetrievalIds)],
    notes,
  };
  await writeFile(coverageEntryPath, stableJson(coverageEntry), "utf8");
  await appendSourceCoverage(runDirectory, coverageEntryPath);

  const candidateDirectory = resolve(runDirectory, "source-candidates");
  await mkdir(candidateDirectory, { recursive: true });
  const candidatePath = resolve(candidateDirectory, `x-${entryNumber}.json`);
  await atomicWriteJson(candidatePath, {
    schemaVersion: 1,
    targetDate,
    generatedAt: completedAt,
    coverageEntryId: coverageEntry.id,
    status,
    candidates: discoveryCandidates,
  });
  await chmod(candidatePath, 0o444);

  return { status, candidatePath, coverageEntry, failedHandles };
}

function parseCliOptions(argumentsList) {
  const runDirectory = argumentsList.find((argument) => !argument.startsWith("--"));
  const numberOption = (name) => {
    const value = argumentsList.find((argument) => argument.startsWith(`${name}=`))?.split("=")[1];
    return value === undefined ? undefined : Number(value);
  };
  return {
    runDirectory,
    strict: argumentsList.includes("--strict"),
    maxAccounts: numberOption("--max-accounts"),
    concurrency: numberOption("--concurrency"),
  };
}

const entrypoint = process.argv[1] ? resolve(process.argv[1]) : null;
if (entrypoint === fileURLToPath(import.meta.url)) {
  const options = parseCliOptions(process.argv.slice(2));
  if (!options.runDirectory) {
    console.error("用法：npm run research:collect:x -- <RUN_DIRECTORY> [--strict] [--max-accounts=N] [--concurrency=N]");
    process.exit(1);
  }
  try {
    const result = await collectXSources(options.runDirectory, options);
    console.log(
      JSON.stringify({
        status: result.status,
        candidatePath: result.candidatePath,
        coverage: result.coverageEntry,
      }),
    );
    if (options.strict && result.status !== "success") process.exit(2);
  } catch (error) {
    console.error(error.stack ?? error.message);
    process.exit(1);
  }
}
