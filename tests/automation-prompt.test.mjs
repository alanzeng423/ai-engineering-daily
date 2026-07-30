import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const promptUrl = new URL("../automation/daily-digest-prompt.md", import.meta.url);

test("daily automation bypasses an unavailable inherited loopback proxy", async () => {
  const prompt = await readFile(promptUrl, "utf8");

  assert.match(prompt, /代理健康检查与直连降级/);
  assert.match(prompt, /127\.0\.0\.1:7890/);
  assert.match(prompt, /env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY/);
  assert.match(prompt, /checks\.json/);
  assert.match(prompt, /events\.ndjson/);
  assert.match(prompt, /research:collect:x/);
  assert.match(prompt, /不得修改用户的 shell 配置、Git 全局配置、系统网络设置或全局环境变量/);
});
