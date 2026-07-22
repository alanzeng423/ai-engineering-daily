import { readFile } from "node:fs/promises";

export const DIGEST_SOURCE_TYPES = [
  "arxiv",
  "huggingface",
  "x",
  "reddit",
  "wechat",
  "github",
  "openreview",
  "medium",
  "substack",
  "youtube",
  "newsletter",
  "blog",
  "paper",
  "website",
];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCalendarDate(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function hasText(value, min, max) {
  return (
    typeof value === "string" &&
    value.trim().length >= min &&
    value.trim().length <= max
  );
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function validateDigest(digest) {
  const errors = [];

  if (!isPlainObject(digest)) {
    return ["日报必须是一个 JSON 对象"];
  }

  if (digest.schemaVersion !== 1) errors.push("schemaVersion 必须为 1");
  if (!Number.isInteger(digest.issue) || digest.issue < 1) {
    errors.push("issue 必须是大于 0 的整数");
  }
  if (!isCalendarDate(digest.date)) errors.push("date 必须是有效的 YYYY-MM-DD 日期");
  if (
    typeof digest.generatedAt !== "string" ||
    Number.isNaN(Date.parse(digest.generatedAt))
  ) {
    errors.push("generatedAt 必须是有效的 ISO 时间");
  }
  if (!hasText(digest.overview, 20, 500)) {
    errors.push("overview 长度必须在 20–500 个字符之间");
  }
  if (!Array.isArray(digest.items) || digest.items.length < 1 || digest.items.length > 15) {
    errors.push("items 必须包含 1–15 条内容");
    return errors;
  }

  const seenUrls = new Set();
  const seenTitles = new Set();

  digest.items.forEach((item, index) => {
    const path = `items[${index}]`;
    if (!isPlainObject(item)) {
      errors.push(`${path} 必须是一个对象`);
      return;
    }
    if (!hasText(item.category, 2, 40)) {
      errors.push(`${path}.category 必须是 2–40 个字符的主题标签`);
    }
    if (!DIGEST_SOURCE_TYPES.includes(item.sourceType)) {
      errors.push(`${path}.sourceType 必须是受支持的来源平台`);
    }
    if (!hasText(item.source, 2, 120)) errors.push(`${path}.source 长度不合法`);
    if (!hasText(item.readTime, 1, 30)) errors.push(`${path}.readTime 长度不合法`);
    if (!hasText(item.title, 8, 180)) errors.push(`${path}.title 长度不合法`);
    if (!hasText(item.summary, 30, 600)) errors.push(`${path}.summary 长度不合法`);
    if (!hasText(item.why, 15, 360)) errors.push(`${path}.why 长度不合法`);
    if (!isHttpsUrl(item.url)) errors.push(`${path}.url 必须是 HTTPS 链接`);
    if (!isCalendarDate(item.publishedAt)) {
      errors.push(`${path}.publishedAt 必须是有效的 YYYY-MM-DD 日期`);
    } else if (item.publishedAt !== digest.date) {
      errors.push(`${path}.publishedAt 必须与日报 date 一致`);
    }
    if (
      !Array.isArray(item.tags) ||
      item.tags.length < 1 ||
      item.tags.length > 6 ||
      item.tags.some((tag) => !hasText(tag, 1, 40))
    ) {
      errors.push(`${path}.tags 必须包含 1–6 个短标签`);
    }

    if (typeof item.url === "string") {
      const normalizedUrl = item.url.trim().replace(/\/$/, "");
      if (seenUrls.has(normalizedUrl)) errors.push(`${path}.url 与其他条目重复`);
      seenUrls.add(normalizedUrl);
    }
    if (typeof item.title === "string") {
      const normalizedTitle = item.title.trim().toLowerCase();
      if (seenTitles.has(normalizedTitle)) errors.push(`${path}.title 与其他条目重复`);
      seenTitles.add(normalizedTitle);
    }
  });

  return errors;
}

export async function readAndValidateDigest(path) {
  let digest;
  try {
    digest = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`无法读取 JSON：${error.message}`);
  }

  const errors = validateDigest(digest);
  if (errors.length > 0) {
    throw new Error(`日报校验失败：\n- ${errors.join("\n- ")}`);
  }
  return digest;
}

export function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}
