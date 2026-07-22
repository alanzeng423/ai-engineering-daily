import { resolve } from "node:path";
import { readAndValidateDigest } from "./digest-schema.mjs";

const input = process.argv[2];
if (!input) {
  console.error("用法：npm run digest:validate -- <日报草稿.json>");
  process.exit(1);
}

const path = resolve(input);

try {
  const digest = await readAndValidateDigest(path);
  console.log(`日报校验通过：${digest.date}，${digest.items.length} 条`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
