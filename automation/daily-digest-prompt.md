【代理健康检查与直连降级：强制】
1. 每次运行在任何外部网络操作前检查当前进程继承的 `HTTP_PROXY`、`HTTPS_PROXY` 与 `ALL_PROXY`。记录时只保留协议、主机和端口；若 URL 含用户名、密码或令牌必须脱敏，禁止把凭据写入研究产物。
2. 若任一代理指向回环地址（`127.0.0.1`、`localhost` 或 `::1`），先以最多 2 秒的本地端口探测确认代理是否可连接。特别是 `127.0.0.1:7890` 无监听或拒绝连接时，立即把代理诊断和选定的网络模式写入当前 RUN_DIRECTORY 的 `checks.json` 与 `events.ndjson`；不得继续把同一个死代理当成三次外部请求重试。
3. 回环代理不可用时，本次 run 的所有公开网络 shell 命令统一采用直连模式：在 `git`、`gh`、`curl`、`npm`、`node` 及其抓取脚本前使用 `env -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY ...`。若代理健康则保留继承配置；不得修改用户的 shell 配置、Git 全局配置、系统网络设置或全局环境变量。
4. 只有实际选定的网络模式发生瞬时外部失败时，才执行既有 15、30、60 秒重试。直连 GitHub 成功但某个内容源失败时，应把失败归因到该来源或适配器，不得重新回退到已确认失效的代理。
5. `research:collect:x`、FxTwitter、FxEmbed 与 XGo 同样遵循本规则。主适配器直连失败时保留完整 retrieval/check/event，再走已有免费适配器降级；不得把死代理造成的连接失败解释成“当天没有 X 候选”。

每天 09:30（Asia/Shanghai）生成并发布“昨日 AI 与软件工程精选”，并自动补偿尚未发布的最近缺期。目标读者是有技术背景的 AI、Agent 与软件工程从业者；只收录能影响研究判断、工程实践或工具选择的一手信息。本任务只有在完整研究过程成功落盘、日报 JSON 成功推送到 GitHub，并确认 Cloudflare 自动部署和正式域名内容后才算完成；不要只在任务对话中输出摘要。

【缺期补偿与有限重试：强制】
1. 以上海时区的前一自然日为 LATEST_ALLOWED_DATE。读取 content/index.json，从最新已归档日期的下一天到 LATEST_ALLOWED_DATE 建立缺期列表；按日期升序处理，单次任务最多处理 2 个日期。若没有缺期，确认工作区和 origin/main 一致后简短报告“无需更新”并结束，不重复生成已有日期。
2. 同一目标日期必须完整成功后才能进入下一日期；不得跳过失败日期。下一次 09:30 仍从最早缺期开始，因此进程级中断也能自动补偿。
3. 搜索、Feed/API、原文访问、git fetch/pull/push 等瞬时网络失败最多尝试 3 次，间隔 15、30、60 秒；每次尝试都单独写 retrieval、checks 和 events，禁止覆盖失败记录。HTTP 4xx、日期不合格、正文不可读、JSON/schema/test 失败属于确定性失败，不盲目重试。
4. Cloudflare Check 和正式域名属于异步传播：每 20 秒检查一次，最多等待 10 分钟。可以用带提交 SHA 的 cache-busting URL 辅助诊断，但最终必须由不带查询参数的正式 URL 通过验证。
5. 单个请求重试耗尽后，将当前 run 完整标记 failed。只有明确属于瞬时基础设施故障、尚未创建 Git 提交且工作区已自动恢复干净时，才允许为同一目标日期新建 1 个 run-id 重试整期；每个目标日期每次定时任务最多 2 个 run。内容、schema 或测试失败不得用重复生成掩盖。

【目标日期与运行档案初始化】
1. 工作目录固定为 /Users/alanzeng/Documents/schedule-daily。
2. 目标日期是本次缺期列表中当前最早的日期，格式 YYYY-MM-DD；以下流程在最多 2 个目标日期上逐日完整执行。
3. 在该日期的任何检索或 Git 操作前运行 `npm run research:init -- YYYY-MM-DD`。保存命令输出的绝对路径为本次 RUN_DIRECTORY，后续所有记录只能写入该目录。即使同一天重跑，也必须创建新的 run-id，禁止复用、覆盖或删除以往运行目录。
4. 立即在 manifest.json 写入当前 Git HEAD 为 baseCommit，并在 events.ndjson 追加初始化事件。每次阶段切换、异常、重试、发布和验证都追加一条带 ISO 时间的事件。
5. 运行 `git status --porcelain`。`research/` 与 `content/inbox/` 已被 Git 忽略，不影响干净状态判断。若公开内容文件有遗留改动，先运行 `npm run digest:recover -- RUN_DIRECTORY`，把命令与结果写入 checks/events，再重新检查状态。该命令只会在文件哈希能证明属于旧发布事务时恢复；若没有可恢复事务、出现事务外改动或恢复后仍不干净，按 preflight 失败停止，禁止覆盖、暂存或清理用户改动。
6. 工作区干净后以最多 3 次瞬时网络重试执行 `git fetch origin main` 和 `git pull --ff-only origin main`。若本地 HEAD 领先 origin/main，只能在逐提交证明提交信息为自动日报、diff 仅含该期 4 个公开文件时重试推送并补做部署验证；不能证明自动化所有权时停止，不改写历史。

【全量研究产物归档：强制】
1. 所有中间产物必须写入 RUN_DIRECTORY；不允许只留在任务对话、模型上下文或工具调用历史中。研究目录只保存在本机且被 Git 忽略，不得提交到公开仓库或部署到网站。
2. 每次搜索、Feed/API 请求、GitHub/Hugging Face 查询、社交平台查询和打开原文，完成后必须先创建一个新的不可变文件 `retrievals/NNNN-kind.json`，再进行下一批操作。NNNN 从 0001 递增，文件一旦写入不得修改、复用编号或删除。
3. 每个 retrieval 文件必须包含：schemaVersion=1、targetDate、batchId、kind、requestedAt、completedAt、完整 request 参数、response 状态，以及本次返回的全部结构化结果。搜索结果逐条保存排名、标题、URL、作者或机构、平台、可见日期和摘要片段；打开原文时保存最终 URL、访问状态、页面标题、作者、原始日期文本、定位信息、用于判断的短证据摘录和错误信息。不要整页复制受版权保护的正文。
4. 每执行一个检索式，先用 apply_patch 创建新的不可变条目 `RUN_DIRECTORY/query-entries/NNNN.json`，包含 id、query、language、scope、executedAt 和 retrievalIds；随后运行 `npm run research:query -- RUN_DIRECTORY 条目文件` 原子追加。禁止直接编辑 queries.json。条目语法或引用失败时保留失败条目，使用新编号写修正版；不得覆盖，也不得在运行结束时凭记忆重建。
5. candidates.json 保存完整规范化候选池，包括最终重复项和被淘汰项。每个候选必须有稳定 id、原始及规范 URL、标题、作者/机构、sourceType、queryIds、retrievalIds、duplicateOf 和当前状态；原始未去重结果由 retrieval 文件永久保留。
6. verification.json 为每个候选保存核验记录：访问结果、最终 URL、标题、作者/机构、首次公开时间原文、时区依据、换算后的 Asia/Shanghai 日期、日期是否合格、正文是否可读、问题、方法/实现、关键结果、与既有内容的区别、证据及定位、拒绝原因。重复或无法访问的候选也必须有记录。
7. scores.json 为每个候选保存五项分数、总分、是否过线和理由；确实无法评分时 total=null，并记录 notScoredReason，不得省略该候选。
8. selection.json 保存来源平衡约束、selectedIds、所有未入选候选及逐条 reasons、未满足的来源要求和编辑备注。selectedIds 与 rejected 必须完整覆盖 candidates.json 中的所有候选，且互不重叠。
9. 写出公开草稿前，先把完全相同的最终日报对象保存为 RUN_DIRECTORY/digest.json；不得只保存 content/inbox 副本。
10. checks.json 逐条保存本任务执行的校验、测试、Git、GitHub Check、部署和正式域名验证，包括命令、开始/结束时间、退出码以及 stdout/stderr 或远端状态。manifest.json 的 stage、counts 和时间在每阶段完成时同步更新。
11. 任一步失败，都必须保留已有 retrieval 和阶段文件，更新 manifest 为 failed、finishedAt 和结构化 failure，并追加失败事件；禁止为了下次重跑而清理本次目录。
12. coverage.json 与 coverage-entries/ 保存各来源渠道的实际执行情况；source-candidates/ 保存适配器输出的完整候选。它们与 retrievals 一样属于必须保留的研究产物，不得只在对话中概述。

【历史去重】
1. 读取 content/index.json、content/latest.json、content/baseline.json、content/catalog.json、scripts/digest-schema.mjs，以及最近 14 天已归档的 content/digests/*.json；建立既有 URL、标题、主题和事件清单。基底库用于全历史去重，最近 14 天归档用于事件级强去重。
2. 同一论文、产品发布、项目版本或事件在近 14 天内原则上只收录一次。只有出现实质性新增结果、版本或工程细节时才可再次收录，并在摘要中明确新增内容。

【机器可执行信源覆盖与门禁：强制】
1. 开始发现前运行 `npm run sources:check`，并完整读取 sources/watchlist.json。信源表是必须执行的覆盖计划，不是供参考的例子；禁止只用几条泛化搜索词替代固定信源扫描。
2. 首先运行免费 X 双源适配器：`npm run research:collect:x -- RUN_DIRECTORY --strict`。它会优先扫描 FxTwitter/FxEmbed 中的白名单账号，失败账号自动回退到 XGo，逐请求保存 retrieval，并在 source-candidates/ 与 coverage.json 落盘。必须逐条审阅最新的 source-candidates/x-*.json，先处理 dateEligible=true 且 reviewPriority 为 high/medium 的条目，再检查 low 是否含被启发式低估的重要一手发布；signalScore 只用于审阅排序，不得替代正式评分。目标日期候选可进入核验，次日早间 discoveryLead 只能用于反向发现目标日期的一手事件。
3. 若 X 命令以退出码 2 返回 degraded，记录 checks/events 后完整重跑该命令 1 次。第二次仍 degraded 时可以继续其他渠道，但必须在 selection.unmetRequirements 中以 `x:` 开头写明缺口；若两次均 failed，则本期发现阶段失败。最终稿不强制收录 X 条目，但“X 候选为 0”必须有两次覆盖记录，不能解释为当天没有推文。
4. 除 X 外，每次运行必须为以下渠道各写至少一条 coverage 记录：official、chinese-media、open-web、papers、recall-sentinel。先用 apply_patch 创建新的不可变 `coverage-entries/NNNN.json`，再运行 `npm run research:coverage -- RUN_DIRECTORY 条目文件` 原子追加。每条包含 id、channel、status、startedAt、completedAt、planned、attempted、succeeded、failed、rawResults、eligibleCandidates、retrievalIds、notes；succeeded + failed 必须等于 attempted。
5. official：逐一检查 watchlist 中 priority=1 的官方博客、研究页、GitHub/Hugging Face 组织或 Release，再抽查 priority=2；必须保存每个来源的访问结果。chinese-media：逐一扫描机器之心、新智元、量子位、智源社区、PaperWeekly、AI 前线，微信公众号或转载页主要用作发现线索，随后回到报告、仓库、博客或原帖等一手来源；只有独家采访或独立深度分析才直接作为最终来源。
6. open-web：至少两轮中英文检索。第一轮先广泛覆盖发布、技术报告、工程博客、产品更新、实证研究和高信号讨论；第二轮根据候选池的缺失机构、来源类型、主题和关键实体定向补搜。每轮后先问“还缺哪个来源类别、机构、事件或证据”，把答案和下一轮检索式写入 queries/retrievals，禁止一次性执行固定关键词后停止。
7. papers：在非论文候选池已建立后扫描相关 arXiv/OpenReview/Hugging Face Papers；不得让论文的易检索性挤占工程、产品与社交信号。recall-sentinel：形成初步候选池后逐一检查 HuggingNews、Techmeme、Hugging Face Daily Papers、Hacker News 以及中文媒体热点；若哨兵出现候选池没有的高信号事件，至少追加一次定向检索。哨兵和媒体默认不作为事实终点。
8. coverage 最新记录为 degraded 的渠道必须在 selection.unmetRequirements 中用对应 channel 名称明确说明。完整运行只有在六个渠道均有记录、没有 failed、所有 degraded 均已显式披露时才能通过；不得把渠道未执行伪装成“没有高质量内容”。

【阶段一：候选收集】
1. 将 manifest.stage 更新为 discovery。采用“固定高质量来源优先 + 全网探索补充”的两阶段检索，不把搜索引擎摘要当作事实来源，并严格按上面的归档规则逐批写 retrieval 和 queries。
2. 固定来源以 sources/watchlist.json 为准，优先覆盖 OpenAI、Anthropic、Google DeepMind、Google Research、Meta AI、Microsoft Research、GitHub、Hugging Face、Cloudflare、Vercel、Moonshot/Kimi、Qwen、DeepSeek 等官方研究或工程渠道；Codex、Claude Code、GitHub Copilot 等产品的官方博客、Changelog、GitHub Release；白名单研究者、工程负责人公开账号；arXiv 的 cs.SE、cs.AI、cs.CL、cs.LG 等相关论文。
3. 固定来源列表只是优先级，不是封闭白名单。必须再以中英文进行探索检索，覆盖 LLM、AI、Agent、Coding Agent、Codex、Claude Code、软件工程、SE、AI4SE、代码生成、程序修复、测试、评测、可观测性、安全、上下文工程和 Agent 基础设施。这些词是彼此重叠的检索方向，不是互斥分类，也不要求出现在最终主题或标签中。
4. 社区聚合站、媒体报道和搜索结果只能用于发现候选；最终条目优先链接原创作者、项目或机构的一手来源。
5. 候选来源包括公开推文或帖子、研究者与工程团队博客、公司技术博客、论文、项目发布、Release、Changelog 及其他包含实质技术信息的原创文章。先建立非论文候选池并分别覆盖官方工程或产品博客、公开技术长文或社交原帖、GitHub/Hugging Face/开源发布，再检索论文补充；不得因 arXiv 易检索而提前结束非论文检索。候选池目标为 30–60 条，其中非论文候选不少于 20 条；公开信息不足时不凑数，并在 selection.json 和最终报告说明。
6. 以“事件”而不是单个 URL 组织候选。同一发布的 X 公告、GitHub 仓库或 commit、Hugging Face 页面、博客和技术报告共享同一个稳定 eventId；每个候选必须记录 eventId、discoveredVia、queryIds、retrievalIds。一个渠道发现的线索必须沿链接扩展到同事件的其他一手 artifact，不能把它们当成互不相关的新闻。
7. 阶段完成后写全 candidates.json，更新 manifest.counts.rawDiscoveries、normalizedCandidates 和 retrievalBatches，并追加阶段完成事件。

【阶段二：原文与日期核验】
1. 将 manifest.stage 更新为 verification。每个候选必须打开原文，核实标题、作者或机构、正文内容、原始 HTTPS 链接和首次公开时间；每次打开均写独立 retrieval 文件。
2. 将首次公开时间换算到 Asia/Shanghai，只有属于目标日期的内容才能收录。博客使用首次发布日期而非仅有的更新时间；arXiv 使用 v1 首次提交时间；GitHub 使用 Release 的 published_at；社交帖子使用原帖时间。
3. 页面日期模糊、无法确认时区或页面不可访问时不得立即舍弃。必须沿同一事件的一手 provenance 继续核验，依次尝试官方博客/报告、GitHub commit 或 Release API、X 原帖时间、Hugging Face API、版本历史等；至少完成 2 次不同的一手溯源尝试后，仍无法确认才标记 unresolved。搜索摘要和媒体转载只能提供检索方向，不能充当最终日期证据。
4. verification.json 的每条记录除既有字段外必须包含 dateStatus（eligible、ineligible 或 unresolved）、dateEvidence 和 provenanceAttempts。dateEligible 必须与 dateStatus=eligible 一致；日期合格必须保存原始时间文本、时区、换算结果及来源定位，unresolved 必须保存至少 2 次溯源尝试。类似“模型页无日期但官方 GitHub commit 与 X 公告可证明首次公开时间”的情况应继续追踪，而不是在评分前丢弃。
5. 阶段完成后确保每个 candidateId 都有 verification 记录，更新 manifest.counts.verifiedCandidates 并追加阶段完成事件。

【阶段三：评分、去重与来源平衡】
1. 将 manifest.stage 更新为 scoring。对核验后的候选按 100 分评分：来源权威性与原创性 20、技术深度 25、新颖性 20、实验或工程证据 20、对目标读者的实践价值 15。
2. 低于 70 分不收录。转载、重复报道、纯营销、融资新闻、标题党、缺乏实质技术内容或只有观点没有证据的内容直接淘汰，但全部保留在 scores.json 和 selection.json。
3. 同一事件只保留最权威、信息最完整的一手来源；同时检查 URL、标题和语义事件是否重复。
4. selection.selectedIds 中不得出现相同 eventId；最终 URL 通常选择内容最完整的一手 artifact，其他 artifact 保留在候选、检索和日期证据中。
5. 最终目标 8–12 条，按综合价值排序；宁缺毋滥，优质内容不足时允许少于 8 条，但至少 1 条。
6. 来源多样性是发布门槛：论文最多 4 条且不得超过最终条目的 40%；非论文至少 4 条，优质内容不足时最终总数随之减少，不得用论文补位；同一域名或机构最多 2 条。最终结果应优先覆盖至少 2 条官方工程或产品博客、至少 1 条 GitHub/Hugging Face/开源发布或更新、至少 1 条可公开核验的社交原帖或技术长文。某一类型确实没有达到 70 分的候选时不得用低质量内容凑数，但在 selection.json 和最终报告说明缺口；不得因缺口突破论文上限。LLM、Agent、Coding Agent、AI4SE、SE 之间不设置数量配额，也不为 X 强制凑数。
7. 写全 scores.json 和 selection.json，确保所有候选都有评分或未评分理由以及最终处置；更新 manifest.counts.scoredCandidates、selectedItems 并追加阶段完成事件。

【阶段四：编辑与 JSON】
1. 将 manifest.stage 更新为 editing。若目标日期已有归档，沿用其 issue；若是新日期，issue 使用当前最新 issue + 1；尚无首期时使用 1。
2. 用 apply_patch 创建 content/inbox/YYYY-MM-DD.json，严格遵守 scripts/digest-schema.mjs，只包含 schemaVersion、issue、date、generatedAt、overview、items；把同一对象同步写入 RUN_DIRECTORY/digest.json。
3. category 是 2–40 个字符的内容特定主主题，可根据原文自由命名，例如“推理系统”“Agent 可靠性”“程序修复”“软件测试”“开发工具”“安全治理”；不要求映射到 LLM、Agent、Coding Agent、AI4SE、SE。
4. sourceType 根据最终原始链接的平台填写，只能是 arxiv、huggingface、x、reddit、wechat、github、openreview、medium、substack、youtube、newsletter、blog、paper、website 之一；优先使用具体平台，无法归入已知平台时再使用 blog、paper 或 website。
5. overview 用中文 2–4 句概括共同信号，不使用 Markdown，不单列趋势观察。
6. 每条必须包含 category、sourceType、source、publishedAt、readTime、title、summary、why、url、tags；subtitle 仅按下一条规则使用。summary 用中文 2–4 句依次说明问题或发布内容、方法或实现、具体证据或结果；why 用中文 1–2 句说明对工程实践或研究判断的具体价值。
7. 对 sourceType=arxiv 的论文，title 必须逐字保留 arXiv v1 页面核验到的英文原题，不翻译、不改写、不添加编辑措辞；subtitle 必填，用中文写准确、自然、克制的总结性副标题。其他来源的 title 使用准确、自然、克制的中文编辑标题，通常不填写 subtitle。
8. tags 由 AI 持续维护，目标为每条 2–4 个、最多 6 个可交叉标签。先读取最近 14 天归档中的既有标签，优先复用稳定词汇、合并同义词和不同写法；每个标签都应能作为有意义的筛选条件。标签可描述技术、方法、产品、任务或工程场景，避免与 category 重复，也不要为了覆盖检索方向而强行加入 LLM、Agent、Coding Agent、AI4SE 或 SE。
9. 摘要只能使用已核验的原文证据。避免“值得关注”“意义重大”“标志着新时代”“引发广泛讨论”等空泛措辞，不猜测作者意图，不加入推荐口吻、免责声明、AI 生成说明或上述字段之外的字段。

【校验与发布】
将 manifest.stage 更新为 validation，每个命令执行后立即把命令、时间、退出码和输出写入 checks.json：
1. `npm run research:validate -- RUN_DIRECTORY`
2. `npm run digest:validate -- content/inbox/YYYY-MM-DD.json`
3. `npm run digest:transaction -- content/inbox/YYYY-MM-DD.json RUN_DIRECTORY`
第 3 条会先计算 4 个公开文件的确定性结果和 SHA-256、把原内容备份到 RUN_DIRECTORY，再原子写入并在事务内执行完整 `npm test`。任一步失败会只恢复该事务拥有的 4 个文件；确认 `git status --porcelain` 回到事务前状态后再按失败流程停止。若自动回滚无法证明文件所有权，禁止强行清理并明确报告 recovery_required。

【Git 发布】
1. 将 manifest.stage 更新为 publishing，运行 `git status --porcelain` 并记录结果。
2. 只允许 content/index.json、content/latest.json、content/catalog.json、content/digests/YYYY-MM-DD.json 四个文件发生变化；research/ 与 content/inbox/ 必须保持 Git 忽略。content/catalog.json 由发布脚本从基底库和所有日报归档确定性生成，不得手工编辑。发现其他变化时记录失败并停止，不得暂存或覆盖。
3. 仅暂存上述四个文件。若与仓库现有版本完全相同，不创建空提交；在 checks.json 记录“本期无变化”，继续核对正式站点已有内容。
4. 提交信息固定为：Publish daily digest YYYY-MM-DD。
5. 推送到 origin main；瞬时网络错误按 15、30、60 秒最多尝试 3 次，每次都记录。不得 force push、不得改写历史。将 commitSha、remote、branch、每次 push attempt 和 pushed 写入 checks.json。
6. 推送成功后运行 `npm run digest:finalize -- RUN_DIRECTORY COMMIT_SHA`，将发布事务绑定到已推送提交并记录命令；失败时不得声称事务完成。

【部署验证与运行收尾】
1. 将 manifest.stage 更新为 deployment。推送后取得新提交 SHA，按“缺期补偿与有限重试”中的轮询策略等待该提交的 GitHub Check“Workers Builds: ai-engineering-daily”完成，并将每次状态、结论及详情链接写入 checks.json。
2. Check 成功后轮询访问 https://ai.alanzeng.com，确认 HTTP 200、页面包含本期日期和至少一条本期标题，并且渲染出的 article 数量与 content/catalog.json 的 total 一致。再访问 https://ai.alanzeng.com/today，确认 HTTP 200、页面包含本期 overview 与至少一条本期标题，并且渲染出的 article 数量与 content/latest.json 的 items 数量一致；每次尝试均记录验证时间、HTTP 状态、观察值和是否命中旧缓存。workers.dev 和 cache-busting 地址只可作为故障诊断，不能替代正式 URL 的最终成功。
3. Check 失败、合理等待后仍未完成或正式域名不匹配时，按失败流程收尾，不得声称已上线。
4. 全部成功后更新 manifest：status=completed、stage=completed、finishedAt、最终 counts，追加完成事件，然后运行 `npm run research:validate -- RUN_DIRECTORY --complete`。若完整性校验失败，改记 failed 并报告，不得隐瞒缺失的中间产物。

【最终报告】
用中文简短报告：本次缺期列表、逐日期的 RUN_DIRECTORY 与 run attempt、六个来源渠道的 coverage 状态（尤其 X 计划/成功账号、目标日期候选、是否回退 XGo、中文媒体与漏报哨兵覆盖）、检索批次数、原始发现数、规范候选数、完成核验数、最终条目数、来源与论文占比、研究产物完整性校验、事务测试与回滚状态、Git 提交 SHA、推送尝试、Cloudflare 构建与正式域名验证尝试及网站链接。不要重复整份日报，不输出趋势观察。
