> 最新依赖：主仓 #154 的 3bf4f508 已由 QQ 正式 APPROVED，本轮直接读回；不再等待主仓QQ。候选仍需独立核移植一致性。JJ未定文案与真实模型运行未销账。见 [trial.11原包源码映射](TRIAL11-MEDIAPIPE-SOURCE-MAP.md)。下文旧状态为当时记录。

# trial.10：资源完整性补丁已移植，待审

本次执行依据为 Deja 最新明确指令：修正源 CI 已绿，先完成可独立的最小移植与候选验证，QQ 当前 head 审查及新增提示 JJ 定稿分别保留。不是沿用旧“批准前不移植”状态，也不是把 CI 当作批准。无安装、启用、模型/工具下载、真实 MediaPipe 执行、合并或替换。

## 来源和准确覆盖

已核主仓 #154 head `3bf4f508717af27b6cdde589302329eda8ab1e18`，run42189854839 六项 SUCCESS。相对旧 add981df 只撤README新增段并补纠错说明，加载器及测试预期未变；旧run42187166174四项测试失败已由这一修正替代，历史不删除。

新引擎提交/pin `c2fe5ca345ef76572c6f3522f1d0d0f51c16d416`，基于 trial.9 的 fa9cd139，保留原候选功能。只移植 b783bd36→3bf4f508 的明确文件diff：

| 输入 | 候选路径/处理 |
|---|---|
| bgremove-assets.js | 原样移植9资源版本0.1.1675465747、尺寸和SHA256；全部验证后才创建Blob；未知资源/重定向/错误字节/缺crypto拒绝 |
| app.js、index.html | 替换ensureBgSeg加载调用/失败释放；include在app.js之前，未覆盖助手/尾帧/导出旧修复 |
| ui-preferences.js | 新增own.bgremove-assets-failed草稿，未自改文案，原三键不变 |
| LICENSES.md、licenses/mediapipe/LICENSE、README.md | 原样许可参考及限制；Cindy build明确复制LICENSES和tracked licenses树，无需引入desktop/package-win或npm分发改动 |
| test/bgremove-assets.test.js、test/bgremove-consent.test.js、real-tests/bgremove-assets-byte-audit.cjs | 原样必要验证输入；真实字节审计脚本仅移植未运行，没有取回作者cache |
| CLAUDE.md | 合并资源说明一处文档冲突，保留候选其它手册说明 |

未移植被撤回README段、desktop打包、docs/demo和生成网站。产品引擎没有另写一套加载器。9资源共12,379,063字节，仅固定清单入包，真实JS/WASM/模型不随包、不下载。许可仅精确npm包Apache-2.0声明及官方LICENSE参考，仍无精确二进制源码映射/包内NOTICE，不宣称这些限制已解决。

## 本次候选验证

- 先放入上游受影响测试：旧候选13项失败（含缺新模块/旧加载器接口），日志保留；移植后bg assets/consent/copy/font **27/27通过**，无真实下载。
- `tools/verify-bg-assets.cjs` 复用上游13项断言，仅改测试启动：独占runRoot及DATA/profile/temp、127.0.0.1+PORT0、IPC就绪和随机proof、私有CDP pipe，强制合成模式。固定端口上游脚本未执行。模拟入口没有worker，因此不启用真实第三方worker运行；不是完整真实MediaPipe初始化证明。
- 浏览器合成检查 **13/13通过**：打开/拒绝不发外网请求；用拦截后的合成清单及字节测试实际SRI/WebCrypto，损坏WASM在入口JS执行前拒绝；显式重试成功，蒙版与ProRes导出像素通过，新headless页导出拒绝。所有远程地址由CDP合成响应或拒绝，真实资源未执行。
- 首次测试适配发生 Fetch.enable 不支持的子target错误，原日志保留；去掉合成场景不需要的auto-attach后通过。只改测试工具，未改变加载器；没有加超时掩盖原因。未发现该失败遗留的独占browser/server进程。
- 插件整套npm test和release-check结果、最终Forge解包13项及关键文件字节核对以最终交付receipt记录。未重复无变化媒体同步/尾音整链，trial.9既有证据仍限定原范围。

## 当前门禁和原包

版本 `0.5.1-trial.10`，id仍montclip-candidate。先提交clean head再build/Forge，仅dist/montclip；ZIP必须含node/app/bgremove-assets.js、index引用、app调用以及LICENSES/两份mediapipe许可资料，与所测源码逐文件hash一致。新包原路径/hash/source记录于PR13交付，不复用trial.9身份。trial.9原包保留dist/preserved-trial9和Europa fcd2279共享目录。

QQ当前增量审查待；`own.bgremove-assets-failed`仍为JJ草稿：中“AI 抠像文件未能完成下载和校验，已停止加载。请关闭再开启 AI 抠像重试。”；英“AI background removal files could not be loaded and verified. Loading stopped. Turn AI background removal off and on again to retry.” 原17key矩阵及尚未定稿范围保留在TRIAL9-RESOURCE-SAFETY-GATE.md。不得把旧三键或trial.9评论批准迁到新包。

network.hosts未扩大，仍只GitHub两域；真实Cindy对iframe下载的限制未知，不用其兜底宣称资源安全。Linux/Europa本包、实际CDN/模型初始化/推理、Video完整人工流程、包内LGPL工具仍未验。未给主播/替换许可。后续只由另获授权的DD使用正式候选Update from file，保留原Video项目；本任务不安装启用。入口仍候选实例的montclip_candidate_open_task_view→montclip_candidate_status，核新版本/SOURCE/session。
