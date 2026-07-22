import { resolve } from "node:path";

import { readResearchRun } from "./research-schema.mjs";

const runDirectory = process.argv.find((argument, index) => index >= 2 && !argument.startsWith("--"));
const complete = process.argv.includes("--complete");

if (!runDirectory) {
  console.error("用法：npm run research:validate -- <run-directory> [--complete]");
  process.exit(1);
}

try {
  const result = await readResearchRun(resolve(runDirectory), { complete });
  if (result.errors.length > 0) {
    throw new Error(`研究产物校验失败：\n- ${result.errors.join("\n- ")}`);
  }
  const { manifest, candidates, selection } = result.artifacts;
  console.log(
    `研究产物校验通过：${manifest.runId}，${result.retrievalFiles.length} 批检索，` +
      `${candidates.candidates.length} 个候选，${selection.selectedIds.length} 条入选`,
  );
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
