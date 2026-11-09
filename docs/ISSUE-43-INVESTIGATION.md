# #43 本地根因排查

调查基线：MontClip-Cindy `24d294c5f02328490fd086a03f4b768551c36dc7`；engine `de6640df37a5b0f6e6f2d1591b4b1d768cc3083c`。以下调查段落和行号保留基线时的记录；后续本地实现见末尾「修复做了什么、没做什么」。

## 看到的事实

1. `main.js:555` 从 `msg.args.session_context.session_id` 取任务；`:788` 将它交给 worker。`node/worker.cjs:384-395` 在同一队列内先 `binder.bind(session)`，再把返回项目交给工具；`:191` 将 `{session, project}` 传到引擎。下一次调用重新执行相同绑定。
2. `node/lib.cjs:46-77` 读取 `sessions.json`，已有有效绑定不会更新；引擎 active 不同就重新 open 该绑定。首次未绑定时，`:56-67` 会领取尚未被其他任务占用的 active，否则新建。绑定没有切换 API。
3. `engine/mcp-server.js:1185-1194` 的项目工具直接 POST `/api/projects`，根据引擎回执写“Opened”。`engine/projects.js:143-163` 只保存旧文档、替换根文档并写 `projects/index.json.active`，不修改插件 sessions。new 默认 open=true（`:186`），duplicate 默认 open=false（`:206`），因此修复必须覆盖省略 open 的 new。
4. `(OPEN)` 是全局引擎状态：`engine/projects.js:121` 的 `active: id === active`，经 `engine/mcp-server.js:1168` 渲染。不是任务归属，也不是页签状态。连 `fablecut_projects list` 自身都会先 bind，故它就足以把 active 切回旧项目。
5. 本次操作不走长任务队列外等待。`node/worker.cjs:380` 的 long 清单没有 projects；`:398-400` 等待普通工具完成。带幂等键的 projects 在 `engine/mcp-server.js:1637` 使用 `waitForCompletion:true`。不能将 #43 归因于 wait_ms:0 释放队列。
6. 真实本地 worker + 固定引擎的测试中，new、duplicate、open 都返回 complete/Opened，磁盘 active 立即指向目标，sessions 仍是旧项目；下一次 compact 和完整读取回到旧项目。A 原项目有一个合成字幕片段，new/open 目标为空，因而同时验证项目名与片段数。B 的绑定、名称和 clips 不变。另有 Promise.all 同时提交 A 新建和 B 六次读取的测试，B 六次都正确，A 后续仍读旧项目（`test/project-switch-43.test.cjs:59`、`:118`）。
7. `montclip_open_task_view` 只是返回宿主 `cindy.taskView` 的回执（`main.js:857-860`），不等待编辑器 claim 或 state。status 在 `main.js:754-764` 发 UI state，任何非 200 都变成 open:false；`engine/server.js:233-235` 按 session/project 匹配编辑器连接，`:1083` 没匹配就 NO_EDITOR，`:1092` 无响应同样失败。因此 host ok 与 editor open 并非同一个确认。

## 推断及其边界

- #43 根因是项目切换只更新引擎 active，却未更新插件任务绑定。单任务已经足够复现，不需要 DD 抢走绑定。DD 可以改变全局 active，但在本次双任务实验中没有改变 Video 的 sessions 项（`node/lib.cjs:53-73`；红测）。
- #56 与 #2 属于编辑器页签/票据/连接链路，不能因 open:false 就判为 #43 同源。票据来自 `node/worker.cjs:367-373`，frame 使用它（`frame.js:108-118`），服务器 claim 绑定连接（`engine/server.js:1048-1054`）。#43 红测完全没有浏览器也能重现。
- #58 是空 session 的长任务 scope：worker 跳过 bind（`:384`），队列外轮询时 project 可能仍 undefined（`:407`）；引擎按届时 active 定 scope（`engine/mcp-server.js:1635-1638`），随后可能 scope mismatch（`engine/tool-tasks.js:38`）。本题是有 session 的普通项目切换，机制不同。未实测宿主是否发空 session。
- #18 / E5 管票据身份传递和按任务、项目隔离；#16 是提示/脱敏后续项。它们不提供 sessions 改绑。相关 Issue 正文已只读核对，#56/#58 当前无评论。

## 还不知道

- Europa 这一次 open:false 的具体 HTTP 状态、错误码、iframe 加载及 claim 是否成功。`main.js:764` 丢弃了这些错误细节，仅凭公开回执无法定位 #56/#2。
- 未运行真实 GUI、导出、撤销或长任务与切换的组合；不能把本地读取测试当成这些验收已通过。导出请求也由 worker `:384-391` 选择绑定，UI 操作还依赖连接匹配。
- 未证明多 worker、绕过 worker 的直接引擎写入隔离；现有 worker 队列只保护自身入口（`:397-399`）。

## 最小修复方案（未实现）

按“允许改绑”的方向，改动入口应集中在 `node/worker.cjs:184-193,379-400` 与 `node/lib.cjs:39-84`，复用现有 sessions 与队列，不在 main.js 再存一套任务映射。

1. 在队列内识别 open / new(open 默认 true) / duplicate(open true)；open:false 不改绑。对现有目标先检查其他任务是否占用，失败/冲突不先切引擎。
2. 获取可靠的结构化目标项目 ID，操作成功后把当前 session 的映射原子写入；失败保留旧绑定。不从“Opened …”文案解析，也不把一次 GET active 当成可重放结果。可由插件协调项目 HTTP API 获得结构化结果；若通过 MCP 新增结构化回执，则引擎变更应单独上游维护。
3. 切换操作保留稳定的幂等身份和原 scope/目标/回执关联。现在 `engine/tool-tasks.js:30` 的任务 ID 包含 `[scope,name,key]`，scope 含旧项目（`engine/mcp-server.js:1635-1636`）。若只加 `map[session]=newId`，重试相同 key 会换 scope，再创建项目；旧 taskId 查询可能 mismatch（`:38`）。还要处理“引擎已切换但 sessions 写失败”的恢复，不能报完整成功。
4. 改绑后的编辑器必须重新取得/claim 对应项目票据，复用现有 `montclip/editor-ticket` 链路。旧 SSE 连接的项目绑定不会因 sessions 更新自动变化（`engine/server.js:1054`）；仅修工具读不代表撤销/GUI 已修好。正在执行的旧长任务须继续用提交时 scope，查询不能被新绑定带走。

这不是可确认安全的 <40 行补丁，因此本轮只交红测。若产品改选“明确拒绝”，最小止损是在 worker bind 后、调用引擎前拒绝上述跨项目操作，避免副作用；它是行为选择，不冒充已实现的改绑修复。

后续测试：现有红测转绿；open:false 不改绑；默认 new；占用目标拒绝；失败及 sessions 写失败恢复；同 key 重试不增加项目；旧 taskId 可查询；并发 B 内容保持；A 后续修改/撤销/导出均指向新目标；真实 Cindy 页签重新 claim。不得只测 OPEN 文案。

## 实验与交付状态

`node --test test/project-switch-43.test.cjs`：5 条，4 条预期红（new、duplicate、open、并发 new），1 条绿（失败 open 保留双方绑定）。红是内容/绑定断言失败，不是启动失败。日志：仓库根 `issue43-red.log`。

`npm test`：147 条，137 pass、6 fail、4 skip。6 fail = 上述 4 红 + 已知 asr-card/export-card 在 280/360px 的两条布局测试；无其他失败。日志：`issue43-npm-test.log`。日志被现有 `*.log` 忽略规则排除。

仅新增这个说明和红测，全部本地未提交。测试数据位于本仓库随机 `.issue43-test-*` 目录，退出后校验路径并删除；每个 worker 使用独立 DATA 与随机本地端口。没有修改 sessions 绕过绑定，没有真实素材或导出。没有安装、打包发布、push、PR、GitHub 写入、europa 操作，未触碰 rsi-patrol。engine 子模块无改动。

仓库没有 `.cursor/rules/agentic-coding-steps.mdc`（本地读取与文件名搜索确认），因此未运行其中不可获得的流程或 send_codex_plan_request.py；本轮遵循明确的只读调查及本地测试范围。

自检：准确性 4/5（真实 worker/引擎证据，未验证 GUI）；完整性 4/5（五个问题均回答，修复仅方案）；清晰度 4/5（区分事实/推断/未知，方案仍需设计细化）；可执行性 4/5（红测可直接运行，幂等恢复尚未实现）；简洁性 4/5（保留定位与边界，完整说明较长）。平均 4.0。下一步优先设计稳定切换回执，再补 GUI/导出验收；本次交付符合调查范围，不代表发布就绪。

## 修复做了什么、没做什么

后续授权：PG 决定方案 A，成功切换后当前任务改绑，别的任务已占用的目标拒绝。实现仅在本地分支 `fix-43-rebind`，产品代码仅改 `node/lib.cjs` 与 `node/worker.cjs`，未改 engine。

### 实现

- `node/lib.cjs` 的 `createBinder.projects` 在原 binder 队列中执行占用检查、绑定、HTTP 项目操作和 sessions 原子更新。目标 ID 来自 `/api/projects` JSON 回执，不解析 Opened 文案。不新增另一份任务→项目映射。
- `open` 的占用检查在任何 bind 之前，拒绝时连 active、revision 和项目列表都不变。duplicate 的 id 是来源，不把它误当作要占用的目标。new 省略 open 时仍打开；new/duplicate 的 open:false 不改绑。
- 成功后下一次读、修改、UI undo、export-start 请求都通过已有 worker 路径取得新绑定。实际 UI 仍须有匹配的编辑器连接。
- 引擎已切换而 sessions 写失败时，重新打开原绑定，返回失败；若回滚也失败，返回独立 `PROJECT_ROLLBACK_FAILED`。新建残留不自动删除。带 key 的失败回执包含 `saved.project`、`saved.boundProject`、`saved.restored`，便于核对。损坏/不可读的 sessions 不再被当作空映射继续抢占 active。
- worker 为这些项目操作复用固定引擎的 `createToolTasks`，回执放在 `cindy-project-tasks/`，scope 固定为 `[session,"projects"]`。这是操作回执目录，不是第二份绑定。改绑后同 key 重试或旧 taskId 查询仍返回原回执，不再创建项目，也不把当前绑定切回旧目标。跨任务 taskId、同 key 不同参数均拒绝；无 key 的重复创建仍每次执行。
- 回执重放是历史操作结果，不是当前项目状态证明。后续切换后查询旧回执不会撤销后续选择；需读当前项目确认。重启同一 worker 数据目录后仍可重放。

### 验证

运行 `node --test test/project-switch-43.test.cjs test/project-rebind-path.test.cjs`：13/13 通过。

原 4 条红测转绿：显式 new/open、duplicate/open、open、A 新建与 B 读取并发。原失败 open 对照继续绿。新增覆盖 open:false、默认 new、默认 duplicate、无 key 同参重复创建、占用冲突无副作用、sessions 写失败及其重试、重启后 key/taskId 重放、跨任务查询拒绝、同 key 参数冲突、真实字幕修改落新项目、worker 的读/改/撤销/导出请求选择、回滚失败、损坏映射拒绝。

补充参数边界：open:null、0、字符串在绑定/操作前拒绝，避免插件与引擎对非布尔值的解释不同。

最终 `npm test`：155 条，149 pass、2 fail、4 skip；两条失败仍是已知 asr-card/export-card 的 280/360px headless 布局测试。日志 `issue43-rebind-npm-test.log`（Git 忽略）。`node --check` 检查两个产品文件及两个测试文件均通过；`git diff --check` 通过。

### 已知限制与未做事项

- #56/#2 的页签重新 claim、旧 SSE 连接不在本次范围，代码有注释。测试证明 UI/导出请求选对项目，不声称真实撤销、GUI 或编码导出成功。
- 新的持久回执目录只包含本实现创建的项目操作回执；未迁移部署前引擎生成的历史 projects taskId。原编辑类长任务的 scope 规则未改，切换后查询旧长任务的问题未在本次修复。
- 进程在 HTTP 操作和回执持久化之间中断时，沿用持久任务的保守处理：不自动重放不确定的操作，需要检查项目列表。不同文件之间没有跨文件事务。失败/中断不承诺新建项目不存在。
- 首次任务领取未被占用的 active 规则未改。空 session 的 #58 未修。仅保证本 worker/原 binder 队列范围，不新增多进程协调。
- 没有 push、PR、安装、发布、真实素材操作、europa 或 rsi-patrol 操作；没有改 main.js、engine 或已有用户的 sessions。测试仅在本仓库隔离临时目录写合成数据，结束后清理。

修复自检：准确性 4/5（真实引擎与请求路径均验证，GUI留待后续）；完整性 4/5（本次授权用例齐全，历史回执迁移未纳入）；清晰度 4/5（保留历史调查，需以本节区分修复状态）；可执行性 4/5（可本地提交及复跑，布局环境限制仍在）；简洁性 4/5（完整证据较长）。平均 4.0。优先后续验证真实任务页签；不将请求路由正确等同于产品端到端通过。
