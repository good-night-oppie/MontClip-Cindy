# #43：工具切项目后的编辑器重绑

负责人：Cindy。范围仅机制 2；不处理原生 Create/Duplicate 回写（机制 1）、初票过期恢复（机制 3）、无页签伙伴操作（#56）或 panel 跨任务读取。

## 协议

- `binder.projects` 在切换操作及任务映射写入成功后才返回瞬时 `projectSwitched`。失败回滚和 `open:false` 不返回标志。
- worker 只将原有文本保存为持久回执；标志仅来自本次执行的 callback。历史 taskId、idempotency_key 重放不会重新通知。
- main 从宿主 `taskOf(msg)` 取得 session，只发送 `{type:'task-project-switched', session, project}`；事件无票据、token 或路径，工具回执移除内部标志。
- task frame 仅响应相同 session。重新读绑定，对比本 iframe 已放置项目及在途项目，使用现有 place 序号取消旧放置。通知丢失时 visibilitychange 重新绑定并比较。
- 每次 place 现领一次性票；票响应附带 worker 实际绑定的 project，防止把通知中的旧项目当成票据身份。重新设置 iframe.src 建立新 SSE，保留固定引擎的 claim/boundTo 检查。
- editor-ticket 问答 15 秒截止；同一目标失败后展示错误，不自动无限重试。重新打开页签可重试。旧 iframe 的异步 reconnect 票响应也检查 place 序号。
- panel 不响应切项目事件，现有票据和读取边界保持不变。

引擎 gitlink 与 engine-lock.json 保持 `de6640df37a5b0f6e6f2d1591b4b1d768cc3083c`；没有新增权限、依赖、联网声明或 CI。

## 已执行验证（2026-11-11）

`node --test test/project-editor-rebind.test.cjs`：7/7 通过。校准后的改动前红测 1 通过、6 失败。首次夹具错误（SSE 事件名应为 conn）不算产品红测；测试结束前等待未完成 RPC 的修正不算产品修复。

真实 worker、固定引擎 HTTP/SSE/claim/UI 路由，执行实际 main 工具 handler 和完整 frame.js 的 DOM 适配器：

1. new、duplicate、open：新 conn claim 成功，真实路由向新连接发送 undo 并取得 200；旧连接不收命令，taskB 和 panel 零额外放置。
2. open:false、错误目标、任务映射写入失败均不刷新；无页签任务不预发票。
3. 同 key 和历史 taskId 回放不刷新；广播字段精确校验，回执与 worker 日志不含测试票据或测试目录。
4. 快速连续切换丢弃迟到旧票；后台错过通知后切回只重放置一次；新票失败显示错误，无自动循环。

**证据边界：undo 应答由测试端模拟，这证明连接和命令路由，不证明真实 UI 撤销了时间线。没有把 DOM 适配器或本机 headless 测试写成 Win11 Cindy 实窗。**

`npm test`：184 项，180 通过、0 失败、4 跳过。3 项是既有 Windows shell-FFmpeg 夹具限制；1 项等待另行批准的上游引擎集成基线。本次不改 pin 以消除跳过。

原始日志保留本地 `.artifacts/`，不入 Git：

| 文件 | SHA256 |
| --- | --- |
| cindy43-red-calibrated.tap | a1748d6e7fff1072e141849b5ceb9d07975fc4158d5d0457ada44df97f8f97f2 |
| cindy43-rebind-green.tap | 5aac3f80d31861e5b8dea491073820419784338b118d650350fd341bbac90640 |
| cindy43-npm-final.tap | d196f0105fa2bcbef4122a8bca6376c7b95e9e80f6666e70d40137e10e7c6f0a |

## 实窗门槛与候选隔离

当前未安装、未部署，未修改现用数据。保持 Draft，未请求 DD/QQ 代码初审或终审。

安装前必须另交确切候选包 SHA256、SOURCE.json 的 wrapper/engine SHA、数据与配置目录、端口及回退方案，先由 QQ 核方案再获主人授权。本机 Cindy 查询版本为 0.1.130；尚未核定该运行构建的源码和可用隔离安装接口，不声称支持平行安装同 id 插件。

worker 已有隔离变量 `MONTCLIP_CINDY_DATA`、`MONTCLIP_CINDY_CONFIG`、`MONTCLIP_CINDY_PORT=0`；只在自行启动的测试 worker 验证过。宿主是否允许对候选 worker 注入这些变量必须先确认，不能把 shell 的环境变量能力当成 Cindy 安装隔离能力。若不支持，不覆盖现用 montclip，不改插件 id 或产品默认目录来绕过；由 QQ/主人确定隔离 Cindy/Windows 测试环境。

获授权后的验收：在 Win11 普通 Cindy 任务窗、全新临时数据与配置下，新建 A/B 两任务；对 new/open、duplicate/open、open 各走「读旧项目 → 工具切换 → 读新项目/list → 修改 → 真 undo → 导出」；核对工程内容、revision、片段与导出归属。另验任务 B 不刷新、open:false、幂等重放、失败回滚、快速连续切换和后台切回。记录精确包/hash/head/engine/编码器与打码窗口证据，执行 scope:cindy43-paths。

取消或失败时只停止测试实例和其随机端口 worker，保留证据；现用插件未改则无需替换恢复。未确认隔离前不执行安装；无当前 head 的 QQ 明确实跑例外前不转 Ready、不叫审、不关 #43。
