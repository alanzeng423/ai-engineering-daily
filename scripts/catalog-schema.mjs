import { isCalendarDate, validateStory } from "./digest-schema.mjs";

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isIsoDateTime(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function hasText(value, min = 1, max = Infinity) {
  return typeof value === "string" && value.trim().length >= min && value.trim().length <= max;
}

export function normalizeContentUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("utm_") || key === "ref" || key === "source") {
        url.searchParams.delete(key);
      }
    }
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/$/, "") || "/";
    return url.toString().replace(/\/$/, "");
  } catch {
    return String(value ?? "").trim().replace(/\/$/, "");
  }
}

function validateItems(items, label, limits = {}) {
  const errors = [];
  const { min = 1, max = 500 } = limits;
  if (!Array.isArray(items) || items.length < min || items.length > max) {
    return [`${label} 必须包含 ${min}–${max} 条内容`];
  }

  const urls = new Set();
  const titles = new Set();
  items.forEach((item, index) => {
    const path = `${label}[${index}]`;
    errors.push(...validateStory(item, { path }));
    if (!isObject(item)) return;
    const url = normalizeContentUrl(item.url);
    const title = String(item.title ?? "").trim().toLowerCase();
    if (urls.has(url)) errors.push(`${path}.url 与其他条目重复`);
    if (titles.has(title)) errors.push(`${path}.title 与其他条目重复`);
    urls.add(url);
    titles.add(title);
  });
  return errors;
}

export function validateBaseline(baseline) {
  const errors = [];
  if (!isObject(baseline)) return ["基底库必须是 JSON 对象"];
  if (baseline.schemaVersion !== 1) errors.push("baseline.schemaVersion 必须为 1");
  if (!hasText(baseline.id, 3, 80)) errors.push("baseline.id 长度不合法");
  if (!hasText(baseline.title, 3, 80)) errors.push("baseline.title 长度不合法");
  if (!isIsoDateTime(baseline.generatedAt)) errors.push("baseline.generatedAt 必须是 ISO 时间");
  if (!hasText(baseline.overview, 20, 1000)) errors.push("baseline.overview 长度不合法");
  if (!isObject(baseline.coverage)) {
    errors.push("baseline.coverage 必须是对象");
  } else {
    for (const key of ["from", "to", "primaryFrom", "primaryTo"]) {
      if (!isCalendarDate(baseline.coverage[key])) {
        errors.push(`baseline.coverage.${key} 必须是有效日期`);
      }
    }
    if (
      !Number.isInteger(baseline.coverage.exceptionalOlder) ||
      baseline.coverage.exceptionalOlder < 0
    ) {
      errors.push("baseline.coverage.exceptionalOlder 必须是非负整数");
    }
  }
  errors.push(...validateItems(baseline.items, "baseline.items", { min: 1, max: 100 }));
  return errors;
}

export function validateCatalog(catalog) {
  const errors = [];
  if (!isObject(catalog)) return ["内容目录必须是 JSON 对象"];
  if (catalog.schemaVersion !== 1) errors.push("catalog.schemaVersion 必须为 1");
  if (!isIsoDateTime(catalog.generatedAt)) errors.push("catalog.generatedAt 必须是 ISO 时间");
  if (catalog.latestDigestDate !== null && !isCalendarDate(catalog.latestDigestDate)) {
    errors.push("catalog.latestDigestDate 必须是日期或 null");
  }
  if (!Number.isInteger(catalog.total) || catalog.total < 1) {
    errors.push("catalog.total 必须是正整数");
  }
  if (!isObject(catalog.coverage)) {
    errors.push("catalog.coverage 必须是对象");
  } else {
    if (!isCalendarDate(catalog.coverage.from)) errors.push("catalog.coverage.from 必须是日期");
    if (!isCalendarDate(catalog.coverage.to)) errors.push("catalog.coverage.to 必须是日期");
  }
  errors.push(...validateItems(catalog.items, "catalog.items", { min: 1, max: 500 }));
  if (Array.isArray(catalog.items)) {
    if (catalog.total !== catalog.items.length) errors.push("catalog.total 与 items 数量不一致");
    const sorted = [...catalog.items].sort(compareStories);
    if (JSON.stringify(sorted) !== JSON.stringify(catalog.items)) {
      errors.push("catalog.items 必须按发布日期倒序排列");
    }
  }
  return errors;
}

export function compareStories(left, right) {
  return (
    right.publishedAt.localeCompare(left.publishedAt) ||
    left.title.localeCompare(right.title, "zh-CN") ||
    normalizeContentUrl(left.url).localeCompare(normalizeContentUrl(right.url))
  );
}

export function buildCatalog(baseline, digests) {
  const baselineErrors = validateBaseline(baseline);
  if (baselineErrors.length > 0) {
    throw new Error(`基底库校验失败：\n- ${baselineErrors.join("\n- ")}`);
  }

  const byUrl = new Map();
  for (const item of baseline.items) byUrl.set(normalizeContentUrl(item.url), item);
  for (const digest of digests) {
    for (const item of digest.items) byUrl.set(normalizeContentUrl(item.url), item);
  }
  const items = [...byUrl.values()].sort(compareStories);
  const generatedAt = [baseline.generatedAt, ...digests.map((digest) => digest.generatedAt)]
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0];
  const latestDigestDate = digests.map((digest) => digest.date).sort().at(-1) ?? null;
  return {
    schemaVersion: 1,
    generatedAt,
    latestDigestDate,
    total: items.length,
    coverage: {
      from: items.at(-1).publishedAt,
      to: items[0].publishedAt,
    },
    items,
  };
}
