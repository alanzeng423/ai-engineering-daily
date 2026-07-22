每天 09:30（Asia/Shanghai）生成并发布“昨日 AI 与软件工程精选”。目标读者是有技术背景的 AI、Agent 与软件工程从业者；只收录能影响研究判断、工程实践或工具选择的一手信息。本任务只有在完整研究过程成功落盘、日报 JSON 成功推送到 GitHub，并确认 Cloudflare 自动部署和正式域名内容后才算完成；不要只在任务对话中输出摘要。

【目标日期与运行档案初始化】
1. 工作目录固定为 /Users/alanzeng/Documents/schedule-daily。
2. 目标日期是 Asia/Shanghai 时区的前一自然日，格式 YYYY-MM-DD。
3. 在任何检索或 Git 操作前运行 `npm run research:init -- YYYY-MM-DD`。保存命令输出的绝对路径为本次 RUN_DIRECTORY，后续所有记录只能写入该目录。即使同一天重跑，也必须创建新的 run-id，禁止复用、覆盖或删除以往运行目录。
4. 立即在 manifest.json 写入当前 Git HEAD 为 baseCommit，并在 events.ndjson 追加初始化事件。每次阶段切换、异常、重试、发布和验证都追加一条带 ISO 时间的事件。
5. 运行 `git status --porcelain`。`research/` 与 `content/inbox/` 已被 Git 忽略，不影响干净状态判断。若存在其他未提交或未跟踪的用户改动，更新 manifest.json：status=failed、finishedAt、failure.stage=preflight、failure.message，并追加失败事件后停止；不得覆盖、暂存或清理。
6. 工作区干净时运行 `git pull --ff-only origin main`；失败或无法 fast-forward 时同样记录失败产物后停止。

【全量研究产物归档：强制】
1. 所有中间产物必须写入 RUN_DIRECTORY；不允许只留在任务对话、模型上下文或工具调用历史中。研究目录只保存在本机且被 Git 忽略，不得提交到公开仓库或部署到网站。
2. 每次搜索、Feed/API 请求、GitHub/Hugging Face 查询、社交平台查询和打开原文，完成后必须先创建一个新的不可变文件 `retrievals/NNNN-kind.json`，再进行下一批操作。NNNN 从 0001 递增，文件一旦写入不得修改、复用编号或删除。
3. 每个 retrieval 文件必须包含：schemaVersion=1、targetDate、batchId、kind、requestedAt、completedAt、完整 request 参数、response 状态，以及本次返回的全部结构化结果。搜索结果逐条保存排名、标题、URL、作者或机构、平台、可见日期和摘要片段；打开原文时保存最终 URL、访问状态、页面标题、作者、原始日期文本、定位信息、用于判断的短证据摘录和错误信息。不要整页复制受版权保护的正文。
4. 每执行一个检索式，立即把检索式、语言、范围、执行时间和关联 retrievalIds 追加到 queries.json。不得在运行结束时仅凭记忆重建。
5. candidates.json 保存完整规范化候选池，包括最终重复项和被淘汰项。每个候选必须有稳定 id、原始及规范 URL、标题、作者/机构、sourceType、queryIds、retrievalIds、duplicateOf 和当前状态；原始未去重结果由 retrieval 文件永久保留。
6. verification.json 为每个候选保存核验记录：访问结果、最终 URL、标题、作者/机构、首次公开时间原文、时区依据、换算后的 Asia/Shanghai 日期、日期是否合格、正文是否可读、问题、方法/实现、关键结果、与既有内容的区别、证据及定位、拒绝原因。重复或无法访问的候选也必须有记录。
7. scores.json 为每个候选保存五项分数、总分、是否过线和理由；确实无法评分时 total=null，并记录 notScoredReason，不得省略该候选。
8. selection.json 保存来源平衡约束、selectedIds、所有未入选候选及逐条 reasons、未满足的来源要求和编辑备注。selectedIds 与 rejected 必须完整覆盖 candidates.json 中的所有候选，且互不重叠。
9. 写出公开草稿前，先把完全相同的最终日报对象保存为 RUN_DIRECTORY/digest.json；不得只保存 content/inbox 副本。
10. checks.json 逐条保存本任务执行的校验、测试、Git、GitHub Check、部署和正式域名验证，包括命令、开始/结束时间、退出码以及 stdout/stderr 或远端状态。manifest.json 的 stage、counts 和时间在每阶段完成时同步更新。
11. 任一步失败，都必须保留已有 retrieval 和阶段文件，更新 manifest 为 failed、finishedAt 和结构化 failure，并追加失败事件；禁止为了下次重跑而清理本次目录。

【历史去重】
1. 读取 content/index.json、content/latest.json、content/baseline.json、content/catalog.json、scripts/digest-schema.mjs，以及最近 14 天已归档的 content/digests/*.json；建立既有 URL、标题、主题和事件清单。基底库用于全历史去重，最近 14 天归档用于事件级强去重。
2. 同一论文、产品发布、项目版本或事件在近 14 天内原则上只收录一次。只有出现实质性新增结果、版本或工程细节时才可再次收录，并在摘要中明确新增内容。

【阶段一：候选收集】
1. 将 manifest.stage 更新为 discovery。采用“固定高质量来源优先 + 全网探索补充”的两阶段检索，不把搜索引擎摘要当作事实来源，并严格按上面的归档规则逐批写 retrieval 和 queries。
2. 固定来源优先覆盖：OpenAI、Anthropic、Google DeepMind、Google Research、Meta AI、Microsoft Research、GitHub、Hugging Face、Cloudflare、Vercel 等官方研究或工程渠道；Codex、Claude Code、GitHub Copilot 等产品的官方博客、Changelog、GitHub Release；相关实验室、论文作者和高信号工程负责人公开账号；arXiv 的 cs.SE、cs.AI、cs.CL、cs.LG 等相关论文。
3. 固定来源列表只是优先级，不是封闭白名单。必须再以中英文进行探索检索，覆盖 LLM、AI、Agent、Coding Agent、Codex、Claude Code、软件工程、SE、AI4SE、代码生成、程序修复、测试、评测、可观测性、安全、上下文工程和 Agent 基础设施。这些词是彼此重叠的检索方向，不是互斥分类，也不要求出现在最终主题或标签中。
4. 社区聚合站、媒体报道和搜索结果只能用于发现候选；最终条目优先链接原创作者、项目或机构的一手来源。
5. 候选来源包括公开推文或帖子、研究者与工程团队博客、公司技术博客、论文、项目发布、Release、Changelog 及其他包含实质技术信息的原创文章。先建立非论文候选池并分别覆盖官方工程或产品博客、公开技术长文或社交原帖、GitHub/Hugging Face/开源发布，再检索论文补充；不得因 arXiv 易检索而提前结束非论文检索。候选池目标为 30–60 条，其中非论文候选不少于 20 条；公开信息不足时不凑数，并在 selection.json 和最终报告说明。
6. 阶段完成后写全 candidates.json，更新 manifest.counts.rawDiscoveries、normalizedCandidates 和 retrievalBatches，并追加阶段完成事件。

【阶段二：原文与日期核验】
1. 将 manifest.stage 更新为 verification。每个候选必须打开原文，核实标题、作者或机构、正文内容、原始 HTTPS 链接和首次公开时间；每次打开均写独立 retrieval 文件。
2. 将首次公开时间换算到 Asia/Shanghai，只有属于目标日期的内容才能收录。博客使用首次发布日期而非仅有的更新时间；arXiv 使用 v1 首次提交时间；GitHub 使用 Release 的 published_at；社交帖子使用原帖时间。
3. 只有模糊日期、无法确认时区、页面不可访问、正文无法读取或只能看到搜索摘要的候选直接舍弃。禁止根据摘要、转述或标题猜测，但必须把访问结果和舍弃原因写进 verification.json。
4. 阶段完成后确保每个 candidateId 都有 verification 记录，更新 manifest.counts.verifiedCandidates 并追加阶段完成事件。

【阶段三：评分、去重与来源平衡】
1. 将 manifest.stage 更新为 scoring。对核验后的候选按 100 分评分：来源权威性与原创性 20、技术深度 25、新颖性 20、实验或工程证据 20、对目标读者的实践价值 15。
2. 低于 70 分不收录。转载、重复报道、纯营销、融资新闻、标题党、缺乏实质技术内容或只有观点没有证据的内容直接淘汰，但全部保留在 scores.json 和 selection.json。
3. 同一事件只保留最权威、信息最完整的一手来源；同时检查 URL、标题和语义事件是否重复。
4. 最终目标 8–12 条，按综合价值排序；宁缺毋滥，优质内容不足时允许少于 8 条，但至少 1 条。
5. 来源多样性是发布门槛：论文最多 4 条且不得超过最终条目的 40%；非论文至少 4 条，优质内容不足时最终总数随之减少，不得用论文补位；同一域名或机构最多 2 条。最终结果应优先覆盖至少 2 条官方工程或产品博客、至少 1 条 GitHub/Hugging Face/开源发布或更新、至少 1 条可公开核验的社交原帖或技术长文。某一类型确实没有达到 70 分的候选时不得用低质量内容凑数，但在 selection.json 和最终报告说明缺口；不得因缺口突破论文上限。LLM、Agent、Coding Agent、AI4SE、SE 之间不设置数量配额。
6. 写全 scores.json 和 selection.json，确保所有候选都有评分或未评分理由以及最终处置；更新 manifest.counts.scoredCandidates、selectedItems 并追加阶段完成事件。

【阶段四：编辑与 JSON】
1. 将 manifest.stage 更新为 editing。若目标日期已有归档，沿用其 issue；若是新日期，issue 使用当前最新 issue + 1；尚无首期时使用 1。
2. 用 apply_patch 创建 content/inbox/YYYY-MM-DD.json，严格遵守 scripts/digest-schema.mjs，只包含 schemaVersion、issue、date、generatedAt、overview、items；把同一对象同步写入 RUN_DIRECTORY/digest.json。
3. category 是 2–40 个字符的内容特定主主题，可根据原文自由命名，例如“推理系统”“Agent 可靠性”“程序修复”“软件测试”“开发工具”“安全治理”；不要求映射到 LLM、Agent、Coding Agent、AI4SE、SE。
4. sourceType 根据最终原始链接的平台填写，只能是 arxiv、huggingface、x、reddit、wechat、github、openreview、medium、substack、youtube、newsletter、blog、paper、website 之一；优先使用具体平台，无法归入已知平台时再使用 blog、paper 或 website。
5. overview 用中文 2–4 句概括共同信号，不使用 Markdown，不单列趋势观察。
6. 每条必须包含 category、sourceType、source、publishedAt、readTime、title、summary、why、url、tags。title 准确、自然、克制；summary 用中文 2–4 句依次说明问题或发布内容、方法或实现、具体证据或结果；why 用中文 1–2 句说明对工程实践或研究判断的具体价值。
7. tags 由 AI 持续维护，目标为每条 2–4 个、最多 6 个可交叉标签。先读取最近 14 天归档中的既有标签，优先复用稳定词汇、合并同义词和不同写法；每个标签都应能作为有意义的筛选条件。标签可描述技术、方法、产品、任务或工程场景，避免与 category 重复，也不要为了覆盖检索方向而强行加入 LLM、Agent、Coding Agent、AI4SE 或 SE。
8. 摘要只能使用已核验的原文证据。避免“值得关注”“意义重大”“标志着新时代”“引发广泛讨论”等空泛措辞，不猜测作者意图，不加入推荐口吻、免责声明、AI 生成说明或 JSON 之外的字段。

【校验与发布】
将 manifest.stage 更新为 validation，每个命令执行后立即把命令、时间、退出码和输出写入 checks.json：
1. `npm run research:validate -- RUN_DIRECTORY`
2. `npm run digest:validate -- content/inbox/YYYY-MM-DD.json`
3. `npm run digest:publish -- content/inbox/YYYY-MM-DD.json`
4. `npm test`
任一步失败立即停止，不提交、不推送，并按全量归档规则记录失败。

【Git 发布】
1. 将 manifest.stage 更新为 publishing，运行 `git status --porcelain` 并记录结果。
2. 只允许 content/index.json、content/latest.json、content/catalog.json、content/digests/YYYY-MM-DD.json 四个文件发生变化；research/ 与 content/inbox/ 必须保持 Git 忽略。content/catalog.json 由发布脚本从基底库和所有日报归档确定性生成，不得手工编辑。发现其他变化时记录失败并停止，不得暂存或覆盖。
3. 仅暂存上述四个文件。若与仓库现有版本完全相同，不创建空提交；在 checks.json 记录“本期无变化”，继续核对正式站点已有内容。
4. 提交信息固定为：Publish daily digest YYYY-MM-DD。
5. 推送到 origin main；失败时停止并记录，不 force push，不改写历史。将 commitSha、remote、branch 和 pushed 写入 checks.json。

【部署验证与运行收尾】
1. 将 manifest.stage 更新为 deployment。推送后取得新提交 SHA，等待该提交的 GitHub Check“Workers Builds: ai-engineering-daily”完成，并将状态及详情链接写入 checks.json。
2. Check 成功后访问 https://ai.alanzeng.com，确认 HTTP 200、页面包含本期日期和至少一条本期标题，并且渲染出的 article 数量与 content/catalog.json 的 total 一致。再访问 https://ai.alanzeng.com/today，确认 HTTP 200、页面包含本期 overview 与至少一条本期标题，并且渲染出的 article 数量与 content/latest.json 的 items 数量一致；记录两个页面的验证时间、HTTP 状态和结果。workers.dev 地址只可作为故障诊断备用地址。
3. Check 失败、合理等待后仍未完成或正式域名不匹配时，按失败流程收尾，不得声称已上线。
4. 全部成功后更新 manifest：status=completed、stage=completed、finishedAt、最终 counts，追加完成事件，然后运行 `npm run research:validate -- RUN_DIRECTORY --complete`。若完整性校验失败，改记 failed 并报告，不得隐瞒缺失的中间产物。

【最终报告】
用中文简短报告：目标日期、RUN_DIRECTORY、检索批次数、原始发现数、规范候选数、完成核验数、最终条目数、来源与论文占比、研究产物完整性校验、内容校验和测试结果、Git 提交 SHA、推送结果、Cloudflare 构建结果、正式域名验证结果及网站链接。不要重复整份日报，不输出趋势观察。
