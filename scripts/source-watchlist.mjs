import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const defaultWatchlistPath = resolve(root, "sources", "watchlist.json");

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function duplicateValues(items) {
  const seen = new Set();
  const duplicates = new Set();
  for (const item of items) {
    const value = item.toLowerCase();
    if (seen.has(value)) duplicates.add(item);
    seen.add(value);
  }
  return [...duplicates];
}

export function validateWatchlist(watchlist) {
  const errors = [];
  if (!watchlist || typeof watchlist !== "object" || Array.isArray(watchlist)) {
    return ["watchlist 必须是 JSON 对象"];
  }
  if (watchlist.schemaVersion !== 1) errors.push("watchlist.schemaVersion 必须为 1");

  const x = watchlist.x;
  if (!x || typeof x !== "object") {
    errors.push("watchlist.x 必须是对象");
  } else {
    if (!isHttpsUrl(x.primaryAdapter?.profileStatusesUrl?.replace("{handle}", "OpenAI"))) {
      errors.push("watchlist.x.primaryAdapter.profileStatusesUrl 必须是带 {handle} 的 HTTPS URL");
    }
    if (!x.primaryAdapter?.profileStatusesUrl?.includes("{handle}")) {
      errors.push("watchlist.x.primaryAdapter.profileStatusesUrl 必须包含 {handle}");
    }
    if (!isHttpsUrl(x.fallbackAdapter?.opmlUrl)) {
      errors.push("watchlist.x.fallbackAdapter.opmlUrl 必须是 HTTPS URL");
    }
    if (
      !Number.isFinite(x.minimumSuccessRatio) ||
      x.minimumSuccessRatio <= 0 ||
      x.minimumSuccessRatio > 1
    ) {
      errors.push("watchlist.x.minimumSuccessRatio 必须大于 0 且不超过 1");
    }
    if (!Array.isArray(x.accounts) || x.accounts.length === 0) {
      errors.push("watchlist.x.accounts 至少包含一个账号");
    } else {
      const handles = [];
      for (const [index, account] of x.accounts.entries()) {
        if (!hasText(account?.handle) || !/^[A-Za-z0-9_]{1,15}$/.test(account.handle)) {
          errors.push(`watchlist.x.accounts[${index}].handle 不是有效 X handle`);
        } else {
          handles.push(account.handle);
        }
        if (!hasText(account?.name)) errors.push(`watchlist.x.accounts[${index}].name 不能为空`);
        if (!hasText(account?.group)) errors.push(`watchlist.x.accounts[${index}].group 不能为空`);
        if (![1, 2, 3].includes(account?.priority)) {
          errors.push(`watchlist.x.accounts[${index}].priority 必须是 1、2 或 3`);
        }
      }
      for (const handle of duplicateValues(handles)) errors.push(`X handle 重复：${handle}`);
    }
  }

  for (const key of ["official", "chineseMedia", "recallSentinels"]) {
    const items = watchlist[key];
    if (!Array.isArray(items) || items.length === 0) {
      errors.push(`watchlist.${key} 至少包含一项`);
      continue;
    }
    for (const [index, item] of items.entries()) {
      if (!hasText(item?.name)) errors.push(`watchlist.${key}[${index}].name 不能为空`);
      if (!isHttpsUrl(item?.url)) errors.push(`watchlist.${key}[${index}].url 必须是 HTTPS URL`);
    }
  }
  return errors;
}

export async function loadWatchlist(path = defaultWatchlistPath) {
  const watchlist = JSON.parse(await readFile(resolve(path), "utf8"));
  const errors = validateWatchlist(watchlist);
  if (errors.length > 0) throw new Error(`信源表校验失败：\n- ${errors.join("\n- ")}`);
  return watchlist;
}

const entrypoint = process.argv[1] ? resolve(process.argv[1]) : null;
if (entrypoint === fileURLToPath(import.meta.url)) {
  try {
    const watchlist = await loadWatchlist(process.argv[2] ?? defaultWatchlistPath);
    console.log(
      `信源表校验通过：${watchlist.x.accounts.length} 个 X 账号，` +
        `${watchlist.official.length} 个官方来源，${watchlist.chineseMedia.length} 个中文发现源，` +
        `${watchlist.recallSentinels.length} 个漏报哨兵`,
    );
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
