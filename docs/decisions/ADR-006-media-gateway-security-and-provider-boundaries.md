# ADR-006 媒体生成网关（Dreamina / Flow / CapCut）安全边界与离线基线

日期：2026-11-23　唯一实现人：BB（`bboppiexyz[bot]`）　协同复核：Cindy　状态：待 QQ 独立安全评审（G2）与 Cindy 协同复核
关联单据：[good-night-oppie/MontClip-Cindy#106](https://github.com/good-night-oppie/MontClip-Cindy/issues/106) · 草稿 PR `#107`（分支 `bb/106-media-gateway-offline`）

## 0. 绑定版本与范围口径

本 ADR 逐条回应 QQ 在 [#106 评论 7070233509](https://github.com/good-night-oppie/MontClip-Cindy/issues/106#issuecomment-7070233509) 提出的四项前置安全要求，并遵循以下已绑定决定：

- **需求正文（#106）**：`issue-body-sha256:d219017252b5370434d274e068b9b0017d599e3620d69850b009efede264ca40`（A–G 及 G1–G4、F2 门槛继续有效）。
- **三家集成规格 v2（JJ 评论 7075617784）**：`comment-body-sha256:1dbfb71cdb19c98aeebbb8c8126271dc49f61de1352550d1b8236278d2aa46e6`，由 PG 在 [评论 7075635337](https://github.com/good-night-oppie/MontClip-Cindy/issues/106#issuecomment-7075635337) 正式采纳（优先级 P2）。首版范围覆盖 **Dreamina、Google Flow、CapCut** 三家，每家独立记账验收；只有占位入口、本地返回不支持或仅导入本地文件均**不算**整合完成；严禁静默以其他服务替代（例如不得用 Gemini/Vertex 顶替 Flow，不得用 Dreamina 顶替 CapCut）。
- **主人 2026-11-22 / 2026-11-23 口径**（见 [#106 评论 7092289381](https://github.com/good-night-oppie/MontClip-Cindy/issues/106#issuecomment-7092289381) 及会话 `e78e42c1-fc18-4b6e-9f52-ac89c63c0002`）：
  1. 源码归属 `good-night-oppie/MontClip-Cindy`，指定 **BB** 为唯一实现人，**Cindy** 协同查错、复核与交付跟进。
  2. **CapCut** 优先保证手机版能正常读取打开；Win11 桌面版沙盒安装搁置（原 `7075723505` 桌面沙盒安装提请不再需要答复）。
  3. 验收与费用门槛不变：G1–G4、F2 照旧。本 ADR 及对应提交仅覆盖离线实现与 G2 前置安全审查，**不放行**插件安装、账号连接、真实生成或任何扣费。
- **对应开发包基线**：`art-media-gateway-dev-0.2.2.cindy`（124,890 字节，SHA-256 `03f1fe710efc3f14d2b8e4244c302aee8efc17cbec5e799c98517cfcb84eaf24`，未安装、未发布）。其解包后的 19 个插件文件已逐字节一致地补齐至本仓库 `media-gateway/`（不含 `.cindy` 二进制归档本身）。

---

## 一、逐供应商与操作的联网、触发、接收方、字段、取消与不支持边界

### 1.1 逐操作联网与外发矩阵

| 供应商 / 入口 | 操作 | 是否联网 | 触发方式 | 实际接收方 | 发送字段 | 本构建状态 |
|---|---|---|---|---|---|---|
| **既有 Art 兼容工具**（`gen_image` / `edit_image` / `gen_video` / `edit_video`） | 参数整理 | 否（仅调宿主本地 `/media-models` 与 `/kv`） | Agent 调用工具 | Cindy 本机宿主 | 媒体类型 `type`（本地）；不直接向外部供应商发请求 | 与官方 Art `1.15.7` 行为一致 |
| **Dreamina** | 授权登录（外部步骤） | 是（主人手工执行） | **主人本人在本机终端手工执行官方 CLI 登录**（插件无登录工具、无触发按钮） | Dreamina 官方认证端点（`dreamina.capcut.com`） | 主人账号认证交互（插件不可见） | 未连接，G1 未放行 |
| **Dreamina** | `dreamina_capabilities` | 视本地 CLI 状态：先调 `version`（不联网），若通过再调 `connection`（见下） | Agent 调用工具 | 无 / 本机 CLI（若 `auth status` 校验在线态则连 Dreamina 官方） | 无用户提示词或素材 | 已接线（只读） |
| **Dreamina** | `version` | **否**（纯本机子进程读版本） | Agent 调用 `dreamina_operation(operation="version")` | 本机 `dreamina-canvas.exe` | 固定参数 `--format json --non-interactive --profile cindy-art-gateway-dev version` | 已接线（只读） |
| **Dreamina** | `connection` | **可能只读联网**（依赖 CLI `auth status` 实现；未登录隔离 profile 下仅读本地状态） | Agent 调用 `dreamina_operation(operation="connection")` | 本机 CLI / 已登录时可能访问 Dreamina 鉴权状态接口 | 仅隔离 profile 标识 `cindy-art-gateway-dev`，无提示词或素材 | 已接线（只读；仅离线验过未登录态） |
| **Dreamina** | `quote` | **是**（只读联网） | Agent 调用 `dreamina_operation(operation="quote", ...)` | Dreamina 官方服务端（经官方 CLI） | `projectId`（UUID）、`nodeId`（正则白名单标识符） | 已接线（只读；返回积分上限 `totalMaxCredits`，`authorizesSpend: false`） |
| **Dreamina** | `submit` | **本构建不联网**（编译期关闭 `SPENDING_ENABLED = false`，直接返回 `SPENDING_DISABLED`） | 未来启用后须：**报价 → 主人显式确认单次 `quoteId` → 提交** | 未来：Dreamina 官方服务端（经官方 CLI） | 未来：绑定当次 `quoteId` 的任务参数、提示词、参考素材与请求标识 | **本构建禁用**，待 G1–G4 放行后接线 |
| **Dreamina** | `query` | **是**（只读联网；若传 `requestId` 先查本地账本，仅 `running` 态查远端） | Agent 调用 `dreamina_operation(operation="query", ...)` | Dreamina 官方服务端（经官方 CLI） | `projectId`（UUID）、`submitId`（UUID） | 已接线（只读） |
| **Dreamina** | `fetch` | **本构建不联网**（未接线，返回 `UNSUPPORTED_OPERATION`） | 未来：Agent 在任务 `ready` 后调用 | 未来：Dreamina 官方返回并校验后的受管下载端点 | 未来：仅原单 `providerJobId` 对应的取件请求 | 未接线 |
| **Dreamina** | `cancel` | **否**（纯本地返回） | Agent 调用 `dreamina_operation(operation="cancel")` | 无 | 无 | 返回 `CANCEL_UNAVAILABLE` 与扣费风险提示 |
| **Dreamina** | `ledger` | **否**（纯本地读 `ledger.json`） | Agent 调用 `dreamina_operation(operation="ledger")` | 无 | 无 | 已接线 |
| **Google Flow** | `flow_capabilities` | **否**（纯本地检查 PATH 是否存在 `gflow`，不执行、不联网） | Agent 调用工具 | 无 | 无 | 返回 `adapterApproved: false`，标明阻塞项 |
| **Google Flow** | `ledger` | **否**（纯本地） | Agent 调用 `flow_operation(operation="ledger")` | 无 | 无 | 已接线 |
| **Google Flow** | `version` / `connection` / `quote` / `submit` / `query` / `cancel` / `fetch` / `import` | **否**（纯本地拦截，零进程、零联网） | Agent 调用 `flow_operation` | 无 | 无 | 本地返回 `OFFICIAL_AGENT_INTERFACE_UNVERIFIED` 与 JJ 定稿文案 |
| **CapCut 国际版** | `capcut_capabilities` / `ledger` | **否**（纯本地） | Agent 调用工具 | 无 | 无 | 已接线 |
| **CapCut 国际版** | `draft`（可编辑草稿交接） | **否**（纯本地文件复制与 JSON 生成，无登录） | Agent 调用 `capcut_operation(operation="draft", ...)` | 本机 `~/.cindy-media-gateway-dev/capcut-drafts/<name>` | 仅本地绝对路径素材与时间线参数；草稿内 `device_id`/`hard_disk_id`/`mac_address` 均留空 | 已接线（暂存目录，不写主人现用 CapCut 库） |
| **CapCut 国际版** | 生成类操作（`version` / `connection` / `quote` / `submit` / `query` / `cancel` / `fetch` / `import`） | **否**（纯本地拦截，零进程、零联网） | Agent 调用 `capcut_operation` | 无 | 无 | 本地返回 `OFFICIAL_AGENT_INTERFACE_UNVERIFIED` 与 JJ 定稿文案 |

### 1.2 四类敏感与业务字段去向

| 字段类型 | 当前 0.2.2 离线构建去向 | 未来 G1–G4 放行后的去向边界 |
|---|---|---|
| **提示词（prompt）** | 既有 Art 工具透传给 Cindy Core media；新网关三家入口均**不外发**提示词（Dreamina `submit` 已关闭，Flow/CapCut 本地拒绝） | 仅在主人对单次报价确认后，发往所选供应商的官方生成接口；不写入无关供应商或遥测端点 |
| **参考素材（本地路径/媒体）** | CapCut `draft` 仅在本地复制到 `~/.cindy-media-gateway-dev/capcut-drafts/<name>/media/`；三家均**不上传**任何参考素材 | 仅发往主人当次选定并确认的单一供应商接口；严禁跨供应商转发 |
| **账号标识与凭据** | 插件与账本不读取、不存储、不传输；Dreamina CLI 仅按隔离 profile 名 `cindy-art-gateway-dev` 调用本机二进制 | 仅留在主人授权的官方 CLI 隔离配置或宿主受管连接中，绝不进入插件 JS、Agent 上下文、账本或日志 |
| **任务号（`requestId` / `projectId` / `nodeId` / `submitId`）** | `requestId` 仅存本地 `ledger.json`；Dreamina 只读 `quote` / `query` 仅将 `projectId`、`nodeId`、`submitId` 传给官方 CLI | 按供应商独立记录 `requestId ↔ providerJobId` 映射，仅用于原单查询、取件与对账 |

### 1.3 取消行为与已提交费用提示

1. **只读调用（`capabilities` / `version` / `connection` / `quote` / `query` / `ledger`）**：`media-gateway/main.js` 传递 `cancelWithCall: true`，取消调用会终止本次插件请求并停止继续等待。
2. **长时/写状态调用（`submit` / `fetch`）**：`media-gateway/main.js` 有意以 `detached` 模式调用 worker（不传 `cancelWithCall`），防止关闭任务视图或切换任务中断在途提交/落盘导致丢单或重复扣费。
3. **远端任务取消**：Dreamina 公开文档未确认取消接口，调用 `dreamina_operation(operation="cancel")` 立即在本地返回：
   `{ code: "CANCEL_UNAVAILABLE", message: "平台没有公开的取消方式；已提交的任务可能照常扣费。" }`
   明确提示用户已提交的费用可能照常扣除，不假称已取消。

### 1.4 Flow 与 CapCut 阻塞口径（FL0 / CG0）

- **Google Flow**：目前未核实官方第三方开放接口。参考仓库 `ffroliva/gflow-cli`（MIT，commit `cdc7d024`，v0.105.0）为独立第三方项目，通过驱动用户已登录 Chrome 浏览器自动化操作 Flow 网页，触及 #106 正文“非官方接口 / 自动操作消费类客户端”排除项，且默认包含每周用量遥测与每日更新检查。按 PG 7075635337 决定，**本构建不安装、不调用 `gflow-cli`**，所有非账本操作在本地直接返回 `OFFICIAL_AGENT_INTERFACE_UNVERIFIED` 与 JJ 定稿提示：「目前还没有核实可从 Cindy 调用这项服务的官方方式。」
- **CapCut 生成（CG）**：目前未核实官方第三方生成接口，同口径本地返回 `OFFICIAL_AGENT_INTERFACE_UNVERIFIED` 与同一提示文案。
- **CapCut 手机版 vs 桌面版（主人 2026-11-22/23 口径）**：桌面版沙盒安装已搁置；手机版 `20.1.0`（隔离安卓模拟器，未登录）已验证通过相册正常导入合成视频、进时间线、播放、保存与强杀重开。`capcut-draft.cjs` 写出的桌面格式草稿保留在暂存目录作为离线能力，**不计入**手机版草稿直开验证，也不计入 CG 生成完成。

---

## 二、五方凭据边界、回执白名单与脱敏扫描证据

### 2.1 主人 / 宿主 / Agent / CLI / 供应商凭据边界

| 参与方 | 签发 / 来源 | 存放位置 | 谁可读取 | 如何撤销 | 限定服务范围 |
|---|---|---|---|---|---|
| **供应商**（Dreamina 等） | 签发账号会话令牌或密钥 | 服务端校验 | 仅供应商服务端 | 服务端吊销 / 过期 | 仅限该供应商自身服务 |
| **主人（Eddie）** | 亲自在官方认证流完成登录与预算授权 | 仅在主人本机受控环境 | 主人本人 | 主人在供应商账号后台退出/吊销，或删除本机 CLI 隔离 profile | 按供应商分别授权，禁止共用或静默迁移 |
| **本机官方 CLI**（Dreamina Canvas CLI） | 不自签发，接收主人交互登录结果 | 隔离配置目录（`--profile cindy-art-gateway-dev`） | 仅本机 `dreamina-canvas.exe` 进程 | 主人执行官方 CLI 登出或清理该隔离 profile | 仅限 Dreamina 官方服务端 |
| **Cindy 宿主与插件进程**（`main.js` / `worker.cjs` / `gateway-core.cjs`） | **不签发、不接收、不存储**外部供应商凭据 | 仅保存业务账本 `~/.cindy-media-gateway-dev/ledger.json` 与暂存媒体/草稿 | 插件 worker 仅读本地账本与暂存文件 | 删除插件数据目录 | 无凭据权限；`worker.cjs` 不向 CLI 传入任何凭据参数 |
| **Agent** | **无权获取、读取或设置凭据与预算** | 无凭据持久化 | 仅接收经白名单过滤后的结构化回执 | — | 无法触达 `setBudget`（无对应工具暴露） |

### 2.2 回执字段白名单与类型

所有回执均由 `worker.cjs`、`gateway-core.cjs`、`capcut-draft.cjs` 显式构造，**不透传上游原始对象**：

| 入口 / 状态 | 允许返回字段及类型 |
|---|---|
| `dreaminaRead('version')` | `{ provider: "dreamina", code: "OK", version: "1.4.0", build: "68e27033" }` |
| `dreaminaRead('connection')` | `{ provider: "dreamina", code: "OK", connected: boolean }` |
| `dreaminaRead('quote')` | `{ provider: "dreamina", code: "OK", maximumCredits: safeInteger>=0, cash: null, currency: null, authorizesSpend: false }` |
| `dreaminaRead('query')` | `{ provider: "dreamina", code: "OK", state: string(/^[a-z_]{1,40}$/), projectId: uuid, submitId: uuid }` |
| `dreaminaRead` 失败 / 校验拒绝 | `{ provider: "dreamina", code: enumString, providerCode?: safeInteger \| null }`（无 `message` / `stderr` / `stdout` 原文） |
| 账本视图 `view(job)`（`quote` / `submit` / `query` / `fetch` / `ledger`） | `requestId: string`, `provider: string`, `mediaType: enum`, `state: enum`, `providerJobId: string \| null`, `quote: { quoteId, credits, cash: null, currency: null, cashBasis: "unknown", basis: string(<=120), quotedAt } \| null`, `submittedAt: string \| null`, `settled: { credits: number \| null, cash: null, currency: null, source: string }`, `file: { name, bytes, sha256 } \| null` |
| `capabilities` | 仅固定静态结构字段（`route`, `routeKind`, `cli`, `connected`, `accountEntitlements`, `operations`, `billing`, `openGaps` 等，不含本机路径、用户名或凭据） |
| `capcut_operation(operation="draft")` | 成功：`{ provider: "capcut", code: "OK", generated: false, installedInCapCutStore: false, draftId, name, requestedName, renamed: boolean, folder, durationMs, clipCount, clips }`; 失败：`{ provider: "capcut", code: enumString, message?: string }` |

### 2.3 原始 `stdout` / `stderr` 过滤机制

在 `media-gateway/worker.cjs`（第 46–63 行）：
- 子进程仅以 `execFile` 捕获 `stdout`，`stderr` **完全丢弃**，不拼入任何返回值或日志。
- `stdout` 必须满足 `JSON.parse` 成功且 `schemaVersion === '2' && ok === true && data`，随后仅按上述白名单逐字段做类型与正则校验（如 `version === '1.4.0'`、`typeof data.loggedIn === 'boolean'`、`Number.isSafeInteger(data.totalMaxCredits)`、`/^[a-z_]{1,40}$/`）；任何未知字段均被丢弃。
- 子进程非零退出、超时（12,000 ms）或输出非预期 JSON 时，仅尝试读取 `JSON.parse(error.stdout).error.code` 且仅在为安全整数时填入 `providerCode`，其余错误正文、签名 URL、路径或诊断栈一律丢弃，统一返回 `{ code: 'CLI_READ_FAILED', providerCode }`。

### 2.4 无真实凭据的脱敏扫描证据

在 `media-gateway/test-gateway-offline.cjs` 中使用假凭据标记 `FAKE-TOKEN-7f3a9c-do-not-leak` 注入以下全部路径：
1. `quote` 抛出异常消息（`boom FAKE-TOKEN-7f3a9c-do-not-leak`）；
2. `submit` 超时异常消息（`timeout FAKE-TOKEN-7f3a9c-do-not-leak`）以及成功回执中的未知字段 `token: SECRET`；
3. `query` 成功回执中的未知字段 `debug: SECRET`；
4. `fetch` 回执中的签名下载链接 `url: 'https://cdn.example/x?sig=' + SECRET`。

在本分支检出副本上实跑 `node media-gateway/test-gateway-offline.cjs media-gateway` 的实测结果：
- **扫描范围**：临时测试根目录下递归全部落盘文件（`ledger.json`、媒体文件、草稿 JSON 与清单等共 **14 个文件**）以及全部工具回执序列化 JSON（`quote` / `submit` / `query` / `ledger`）。
- **命中数**：**0 次命中**（`scanned 14 files under the test root, 0 hits`，`replies.includes(SECRET) === false`）。
- 同时 `test-art-gateway.cjs` 验证了三家 `capabilities` 回执中不包含本机临时用户目录路径 `profile`（`JSON.stringify(caps).includes(profile) === false`）。

---

## 三、CLI 校验、付费确认、幂等与待核销边界

### 3.1 Dreamina CLI 清单与预期哈希（含待复算标注）

| 项目 | 值 / 规则 |
|---|---|
| **来源** | Dreamina 官方 CLI（来源链接同 `three-provider-matrix.md`）：Agent CLI `https://dreamina.capcut.com/tools/dreamina-cli`；安装入口 `https://dreamina.capcut.com/ai-tool/install`；Canvas CLI 2_0_0_26 发行文档 `https://dreamina.capcut.com/canvas-cli/install/2_0_0_26/skill.tar.gz` |
| **版本 / 构建** | `1.4.0`（commit `68e27033`） |
| **固定路径** | `<USERPROFILE>\bin\dreamina-canvas.exe`（仅限 `win32` / `x64`，不从 `PATH` 查找） |
| **代码钉死预期 SHA-256** | `1f764bc64fc7d43d451547b664cd0f6ebd4b1e74013a98fdee8a4acb0ba15876` |
| **独立复算状态（如实标注）** | **本机没有找到原 CLI 二进制，哈希未复算。** 固定路径实测 `Test-Path "$env:USERPROFILE\bin\dreamina-canvas.exe" === False`；此前测试用的临时目录已不存在，目前没有任何可用的 1.4.0 原二进制副本可供复算（仅残留一个用于拒绝路径测试的 18 字节占位文件，不能用来复算 1.4.0）。上述 1.4.0 SHA-256 系沿用原开发任务记录，尚未经第二方独立复算。在从上列官方来源重新获取二进制并完成独立复算前，不放行实机运行。 |

### 3.2 执行前校验点与命令白名单

在 `media-gateway/worker.cjs`（第 22–47 行）中，每次调用 CLI 之前按顺序强制执行：
1. **命令白名单**：仅允许 4 个只读动作，其他动作返回 `UNSUPPORTED_OPERATION`：
   - `version` → `["version"]`
   - `connection` → `["auth", "status"]`
   - `quote` → `["node", "quote", "--project-id", <uuid>, "--node-id", <nodeId>]`
   - `query` → `["operation", "status", <submitId>, "--project-id", <uuid>]`
2. **参数格式校验**：`projectId` / `submitId` 必须匹配标准 UUID 正则；`nodeId` 必须匹配 `/^[A-Za-z0-9_][A-Za-z0-9_-]{0,127}$/`（首字符不得为 `-`，拒绝 `--help` 等选项注入），不通过立即返回 `INVALID_REFERENCE`。
3. **平台校验**：非 `win32` / `x64` 返回 `UNSUPPORTED_PLATFORM`。
4. **执行前逐次 SHA-256 校验**：流式读取固定路径文件计算 SHA-256；文件不存在返回 `CLI_NOT_INSTALLED`，读取异常返回 `CLI_UNREADABLE`，哈希不等于 `expectedHash` 返回 `UNVERIFIED_CLI_BUILD`，**均不启动任何子进程**。
5. **无 shell 启动**：通过 `child_process.execFile` 传入参数数组，固定前置 `--format json --non-interactive --profile cindy-art-gateway-dev`，`windowsHide: true`，`timeout: 12000`，`maxBuffer: 1048576`。

本地替身验证（`media-gateway/test-art-gateway.cjs` 在本分支实跑通过）：
- 参数注入 `query` + `projectId: "--help"` → 返回 `INVALID_REFERENCE`，不启动进程；
- 未知操作 `operation: "nonsense"` → 返回 `UNSUPPORTED_OPERATION`，不启动进程；
- CLI 缺失 → 返回 `CLI_NOT_INSTALLED`，不启动进程；
- 在 `<profile>\bin\dreamina-canvas.exe` 写入伪造内容 `invalid executable` → 返回 `UNVERIFIED_CLI_BUILD`，不启动进程。

### 3.3 付费确认、预算上限、幂等与待核销边界

- **编译期熔断**：`worker.cjs` 中 `SPENDING_ENABLED = false`，调用 `dreamina_operation(operation="submit")` 直接返回 `{ code: "SPENDING_DISABLED", submitted: false }`。
- **账本强制规则（`media-gateway/gateway-core.cjs`，已由 `test-gateway-offline.cjs` 15 项离线测试覆盖）**：
  1. **无报价不提交**：未先成功 `quote` 或 `quote` 失败（`QUOTE_UNAVAILABLE`），`submit` 返回 `QUOTE_REQUIRED`（供应商调用次数 = 0）。
  2. **确认单次绑定**：`quote` 持久化 `provider`、`mediaType`、`contentHash`（`sha256(JSON.stringify([provider, mediaType, content]))`）与随机 `quoteId`。`submit` 缺失或传入过期 `quoteId` 返回 `CONFIRMATION_REQUIRED`。
  3. **报价变化立即作废旧确认**：`submit` 前复查 `driver.quote`，若当前积分与原确认 `job.quote.credits` 不一致，立即删除旧报价记录并返回 `QUOTE_CHANGED`，再次用旧 `quoteId` 提交返回 `QUOTE_REQUIRED`。
  4. **预算上限与权限隔离**：各供应商默认预算为 `0`；仅内部 `setBudget` 可修改（无 Agent 工具暴露）。`spent(state, provider) + job.quote.credits > budget` 时返回 `OVER_BUDGET` 及 `overByCredits`（且 `pending_reconcile` 态已承诺积分计入 `spent`，防止绕过预算）。
  5. **幂等与重启恢复**：提交前先原子写入（写 `.tmp` 后 `renameSync`）`state: "submitting"` 与 `submittedAt`。已获得 `providerJobId` 的同一 `requestId` 无论同进程重复提交还是新建进程重启后再提交，均直接返回 `{ code: "OK", deduplicated: true, providerJobId }`，不二次调用供应商。
  6. **响应丢失 / 崩溃停在「待核销」**：若 `driver.submit` 抛错、超时、返回非法 `providerJobId`，或进程在写入 `submitting` 后、收到回执前崩溃，再次 `submit` 或 `query` 均停在 `PENDING_RECONCILE`（`resubmitted: false`），绝不自动重提；须主人到供应商侧人工核对后，通过 `reconcile(provider, { requestId, providerJobId })` 显式绑定原单。

---

## 四、取件下载、防覆盖、完整性校验与未实测项

### 4.1 下载来源、重定向与凭据发送规则

- **当前构建状态**：真实供应商下载尚未接线（Dreamina `fetch` 返回 `UNSUPPORTED_OPERATION`，Flow / CapCut 返回 `OFFICIAL_AGENT_INTERFACE_UNVERIFIED`）。
- **未来接线强制约束（G2 准入条件）**：
  1. **允许来源**：仅允许经已校验的官方 CLI 或供应商原单 `query` 返回并校验域名白名单的 HTTPS 下载地址；拒绝 Agent 任意传入的 URL。
  2. **重定向规则**：仅允许 HTTPS 重定向且限制最大跳数（如 ≤ 3 跳），拒绝降级至 HTTP 或跳转至内网/回环地址（SSRF 防护）；跨域重定向必须剥离 `Authorization` / `Cookie` 等认证头。
  3. **凭据发送范围**：账号凭据仅发往供应商官方 API 域名，不随 CDN 签名下载 URL 发送；签名下载 URL 仅存在于内存下载步骤，不写入 `ledger.json`、日志或 Agent 回执（已由假凭据扫描覆盖）。

### 4.2 本地落盘、防覆盖与完整性校验（已离线实测）

1. **媒体落盘（`media-gateway/gateway-core.cjs`）**：
   - **落盘目录**：`~/.cindy-media-gateway-dev/media/`（与主人素材目录隔离）。
   - **防中断显示完成**：先写入 `<requestId>.part`，下载返回后校验 `bytes > 0` 且与 `expected.bytes` 一致，再用 `matchesType` 校验前 16 字节魔数（视频 `ftyp` / EBML `0x1a45dfa3`；图片 PNG / JPEG / WEBP；音频与音乐 WAV / ID3 / MPEG / FLAC / `ftyp`）。任何截断、空文件或类型不符（如过期签名链接返回 `<html>...</html>`）立即删除 `.part`，返回 `DOWNLOAD_INCOMPLETE` 或 `MEDIA_TYPE_MISMATCH`，任务状态保持 `ready`、不显示完成。
   - **永不覆盖已有文件**：落盘前使用 `fs.openSync(..., 'wx')`（`O_EXCL` 独占创建）抢占 `<requestId>.<ext>`；若目标已存在（例如已有主人素材），自动顺延 `-1`、`-2` 后缀再原子 `renameSync`，原文件逐字节不变。
   - **哈希记录与复核**：落盘后流式计算 `sha256File` 写入账本；二次 `fetch` 命中缓存时重算磁盘 SHA-256，一致则返回 `fromCache: true`，若磁盘文件被改动或缺失则返回 `LOCAL_FILE_CHANGED`。
2. **CapCut 草稿落盘（`media-gateway/capcut-draft.cjs`）**：
   - **落盘目录**：`~/.cindy-media-gateway-dev/capcut-drafts/`（暂存目录，不触碰主人现用 `%LOCALAPPDATA%\CapCut\User Data`）。
   - **防覆盖与并发安全（CD4）**：同名草稿通过独占占位文件自动另起名称 `<name> (2)`…`<name> (99)`，8 个并发进程同时请求同名草稿互不冲突、原草稿整棵目录树哈希不变。
   - **原子提交与失败清理（CD6）**：先在临时目录复制全部素材、核对每个素材的 `sourceSha256` 与入出点并写出 JSON，全部成功后原子改名；中途复制或写 JSON 失败时清理残留并返回 `DRAFT_WRITE_FAILED`，不留半成品。

---

## 五、本分支源码绑定、实跑测试与未实测项清单

### 5.1 0.2.2 完整插件补齐与哈希核对

本分支 `media-gateway/` 已从 `art-media-gateway-dev-0.2.2.cindy`（SHA-256 `03f1fe710efc3f14d2b8e4244c302aee8efc17cbec5e799c98517cfcb84eaf24`）补齐全部 19 个插件文件（含 `main.js`、`ghost.json`、设置页、四语语言包、图标、许可与商标文件）以及同源测试脚本 `test-art-gateway.cjs`，并与 0.2.2 包逐字节比对通过（19/19 完全一致）。源码树不包含 `.cindy` 归档文件（遵循仓库 `AGENTS.md`）。

### 5.2 在检出分支上实跑的离线测试（2026-11-23，Node `v22.15.1`，Windows）

1. **账本与 CapCut 草稿离线测试**：
   - 命令：`node media-gateway/test-gateway-offline.cjs media-gateway`
   - 结果：**15/15 PASS，0 FAIL**（退出码 `0`）；假凭据扫描测试根目录下 14 个文件与全部回执 **0 命中**；8 进程并发同名草稿分获 `race (2)` 至 `race (9)`。
2. **插件入口 + Worker + 官方 Art 基线对照测试**：
   - 命令：`node media-gateway/test-art-gateway.cjs media-gateway "<cindy-art-1.15.7-dir>"`（对照本机官方 `cindy-art` `1.15.7`，未传第三个 `vendor` 参数）
   - 结果：**PASS**（退出码 `0`）：4 个既有 Art 工具 schema 与 8 组分发对照一致；三家能力与稳定错误码通过；`SPENDING_DISABLED` 熔断通过；CapCut 草稿经入口→worker 串联及双 worker 并发改名通过；参数注入、缺失 CLI、伪造 CLI 哈希不符均在启动进程前拦截。

### 5.3 未实测与阻塞项（如实列明）

以下项目**均未实测或处于阻塞状态**，在对应前置条件满足前不计入通过：

1. **三家真实生成均为 0 次**：未连接任何账号，未发起任何真实生成，0 扣费；G1–G4 均未通过。
2. **Dreamina CLI `1.4.0` 二进制哈希待第二方独立复算**：本机没有找到原 CLI 二进制，哈希未复算（此前测试用的临时目录已不存在，仅残留 18 字节拒绝路径占位文件，不能用来复算），`test-art-gateway.cjs` 的可选实机 CLI 分支（第 3 参数）未跑；Dreamina `submit` 与 `fetch` 尚未接线至账本；账号私测/订阅资格与按任务号现金账单（F2）未知。
3. **Google Flow 无官方第三方通路（FL0 阻塞）**：`gflow-cli` 未安装、未批准，FL1–FL6 均未跑。
4. **CapCut 生成（CG）无官方第三方通路（CG0 阻塞）**：CG1–CG7 均未跑。
5. **CapCut 草稿端到端实窗未验**：桌面版沙盒安装按主人 2026-11-22/23 口径搁置，桌面格式草稿未在任何 CapCut 客户端打开过；手机版 `20.1.0` 仅验证了相册导入合成视频并保存重开，**未验证**直接打开外部生成的草稿文件。
6. **宿主安装与回归（G5 / G6）未验**：0.2.2 开发包未安装至真实 Cindy，新旧对照与退回官方 Art 均未验。
7. **真实媒体解码与设置页预算项未验**：本机未跑 `ffprobe` 真实生成视频解码（E1）与 MontClip 真实生成产物导入（E2/E3）；预算上限目前仅支持代码调用 `setBudget`，设置页尚无面向主人的预算配置项。
