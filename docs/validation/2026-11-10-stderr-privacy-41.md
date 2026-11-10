# #41 stderr 隐私验证

按 QQ 的 issue 评论 6756685364，worker 的 note 和 console 出口复用固定引擎的 `redactProblem`。note 先序列化再脱敏并验证 JSON；加载、序列化或脱敏失败时只输出固定事件和错误码，不写原文。不新增文件日志。

合成测试覆盖 Windows 和 POSIX 路径、非标准家目录、令牌、错误码、原有本机 origin、模块缺失、无效 JSON 和异常兜底。打包后的 worker 通过真实方法失败测试；现有票据测试检查票据不进入 stderr。这些都是自动化测试，不是 Cindy 实窗验收。

修改前新增的三个测试 0/3 通过，暴露明文和缺失兜底；修改后专项及现有票据测试通过。全量测试数字和实际提交以 PR 或任务回执为准。

## 数字与证据边界

代码提交：`31a46093205652e8e3f14c5951a1a2d6b8fa29d0`；引擎：`de6640df37a5b0f6e6f2d1591b4b1d768cc3083c`。本文属于后续文档提交；下述测试和包针对代码提交，不能当作后续文档提交的 Cindy 实跑。

- 修改前 `npm test`：155 项，149 通过、2 失败、4 跳过。工具回执保留了汇总、`asr-card.test.cjs` 失败详情和 `export-card-height.test.cjs:68` 堆栈片段，完整原始基线日志未保存，不能独立复核第二项完整名称和错误。两份测试文件在基线和代码提交之间未改动，这不能单独证明失败根因。
- 后续在独立临时 Git 工作树检出未修改 `d4af73fb7d6e805594f9b3855a2ca5b7287fef2b`，使用同一固定引擎运行 `npm test`：155 项、149 通过、2 失败、4 跳过，退出码 1。两个失败的完整名称及 `TypeError: Cannot read properties of null (reading '1')` 与下列最终运行一致。原始日志保存在本机临时目录 `montclip-41-baseline-d4af73fb.log`，SHA-256 `c13e7b85793fc7623c410e2aa5aaa152dec48278361fd24a8ebd5feefaa6aaf6`；日志含本机路径，未提交 Git。此对照确认相同失败，不单独证明根因。
- 修改前的 3 项红测 `node --test test/worker-stderr-privacy.test.cjs`：0 通过、3 失败，分别是 note/console 明文、缺模块时明文、无效 JSON 缺兜底。原始工具回执未另存文件。
- 随后新增异常兜底和打包 worker 方法失败两项，共 5 项。`node --test test/worker-stderr-privacy.test.cjs test/embed-ticket.test.cjs`：7/7 通过，包含 5 项新日志测试和 2 项现有票据测试。票据测试检查真实 worker 的两个票据不进 stderr。
- 最终 `npm test`：160 项，154 通过、2 失败、4 跳过，退出码 1。日志在本机临时目录 `montclip-41-final-test.log`。失败项是 `asr-card.test.cjs:113:54` 的“at 280 px and 360 px every value starts in one column, and the button keeps clear of the card's bottom”和 `export-card-height.test.cjs:68:54` 的“at 280 px and 360 px every export card fits its estimate, and its last button keeps clear of the bottom”；均报 `TypeError: Cannot read properties of null (reading '1')`。

代码提交后运行 `npm run build` 和 Forge pack；`SOURCE.json` 的插件提交为上述代码提交、`dirty: false`，引擎提交如上。包 `montclip-0.5.1.cindy` 的 SHA-256 为 `f7e51f0ac6852b777596fce406d92e5cfcdc9ac3387ea8502c09cd1f26578ae4`。包未安装或发布，不进 Git。

Win11 Cindy 实跑未完成。Forge 支持经明确授权使用 `install_copy:true` 创建实例副本，但 MontClip 默认仍使用用户目录下 `MontClip-Cindy`，尚未发现单实例注入临时 `MONTCLIP_CINDY_DATA` 的宿主入口，因此副本不等于数据隔离。先确认隔离数据与失败注入方式，再授权安装、触发失败并亲眼核对；还需确认按实例 ID 卸载的方式。不能将 Node 测试当作实跑，不得在实跑绑定完整提交前送审就绪。
