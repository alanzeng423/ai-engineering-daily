import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

export async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function atomicWriteText(path, contents) {
  const target = resolve(path);
  const temporaryPath = resolve(
    dirname(target),
    `.${basename(target)}.${process.pid}.${Date.now()}.tmp`,
  );

  try {
    await writeFile(temporaryPath, contents, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, target);
  } catch (error) {
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

export async function atomicWriteJson(path, value) {
  const contents = `${JSON.stringify(value, null, 2)}\n`;
  await atomicWriteText(path, contents);

  // A successful rename is not enough: immediately prove the installed ledger is valid JSON.
  const installed = await readJson(path);
  if (JSON.stringify(installed) !== JSON.stringify(value)) {
    throw new Error(`原子 JSON 写入后的内容校验失败：${path}`);
  }
  return installed;
}
