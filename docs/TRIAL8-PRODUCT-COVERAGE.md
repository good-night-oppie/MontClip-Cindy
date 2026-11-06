# trial.8 产品覆盖与 Video 剩余验收（2026-11-06，SOP v2）

这是冻结原包的源码审计，不是新包、安装授权或人工验收通过。已装候选保持 Disabled；本轮未安装、启用、下载 FFmpeg、触碰用户项目或重跑既有安全/媒体测试。QQ 对此包绑定的增量安全复核已完成，详见下一节；不再等待 JJ 或重复请求 QQ 审同一增量。

## 已完成安全复核与仍需宿主确认的范围

已直接读取 GitHub [GoodNightOppie review 5796992644](https://github.com/good-night-oppie/MontClip-Cindy/pull/13#pullrequestreview-5796992644)，提交于 2026-11-06T07:21:56Z，状态 **COMMENTED**，commit_id 为 `c8af1bd0dba6d322c444b4316ab2551206f49eda`，正文绑定引擎 `6abdba1b`。QQ 复用此前 copyLine 十类泄露负控，完成锁 reason 链、JJ 固定文案及诊断码白名单核验，本轮没有重跑测试或安装。允许范围是独立测试机试用；不是 GitHub APPROVED、合并许可、正式安装或替换授权。文档后续提交不改变这份已审产品字节；新增产品变更须按实际增量另审。

Deja 本轮转述 QQ 已报告主人授权上线 size gate `0ee09f0`，默认无例外、config 未改。这里记录为父端授权/上线报告，不继续沿用旧“未上线”说法；本任务未独立部署核验或修改 gate/config，也不将该授权扩展到候选安装、启用、下载或替换。

DD 的确切升级清单见 [trial.8 正式 UI 升级清单](TRIAL8-UPGRADE-CHECKLIST.md)。仍需实际宿主上的正式更新确认，以及独立候选启用/恢复 Video 试用的明确授权；无需再请 JJ 定同一句或请 QQ 重审已过的相同安全增量。FFmpeg 下载仍为单独受限动作。#154 未进包等产品限制不被上述有限安全复核消除。

## 冻结原包与文档 head 分开

- 原包源码：`c8af1bd0dba6d322c444b4316ab2551206f49eda`，版本 `0.5.1-trial.8`，id `montclip-candidate`。
- 引擎：`6abdba1b65ac0f7dbef4852d5ba30d2d12cb8939`；子模块和 engine-lock 一致。
- 本地：`C:/Users/tyb90/orca/projects/MontClip-Cindy/.cindy-worktrees/zealous-kapitsa/.cindy-worktrees/isolated-trial/dist/montclip/montclip-candidate-0.5.1-trial.8.cindy`。
- Europa：`/home/admin/montclip-review/candidates/c8af1bd/montclip-candidate-0.5.1-trial.8.cindy`。
- 两端本轮读回 SHA256：`f7fe5e08e551f15b6febafb217945f9de925242b56c421ae0df9aca34600bb39`。
- ZIP 的 SOURCE.plugin.dirty=false，commit/pin 如上；包内 node/app/{app.js,chat-proposal.js,reframe.js,mcp-server.js} 与当前引擎文件逐个 SHA256 相同。不能将随后仅文档提交的 head 写成此包源码。
- 开始时 fetch 后本地/远端同 c8af1bd、插件/引擎均干净；没有观察到并行修改，这不是对其他会话未来写入的保证。PR13 为 Draft；helper 当前聚合 4/4 checks passed（父端见两 run 共 8 条），review decision=null，不是当前正式 Approve。

## 上游最新修复是否真的在包内

GitHub 当前 head 与本地 fetch 的 refs/audit/prN 一致。四个 head 均不是候选 pin 的祖先；下表再核实现，避免把 cherry-pick 等价修复误判成缺失。上游报告的测试数字不是此包测试。

| PR / 当前 head | trial.8 结论 | 代码证据与范围 |
|---|---|---|
| #172 `3a1d93ce75fb81bcffc5328ae5d34e6fba74ee6d` | 未包含，待集成/审查 | 包内 chat-proposal.js 没有 unchanged 判断，app.js 没有对应预授权短路。上游 a5209ea3/1669fa91 等引入方案与文案；317112ad 修累计删减容差和比例建议。不能声称已拒绝空方案或已具备最新确定性提示。 |
| #175 `de31439da431816040b002dbfc77fe034b6c13e3` | 未包含，待集成/审查 | 包内 app.js 无 runAgentReframe/agentReframeFlow；有旧手动 reframeClips 不等于助手新序列能力。b09e1ba2 为功能，a87b9815 为项目变化/新增片段竞态及序列上限保护；不能只取最终测试提交。 |
| #176 `d219d74f88540984637bc5934e79668207d28a2f` | 未包含，待集成/审查 | 包内 reframe.js 无 sampleTimes，app.js sampleClipFrames 未接 times；mcp-server.js sampleFrames 仍旧实现。b213541a 尾帧采样及3f3743cd/0a7666ec 实际源 PTS/窗口边界修复缺失。旧手动/MCP改比例不保证最新尾帧行为，旧项目也不会自动重算。 |
| #154 `b783bd36cc38adbdf67333786d2f3c09ea38c287` | 未包含，安全缺项 | 包内 app.js 有 ensureBgSeg，缺 bgSeg.consent/askNetConsent/noteExportBgRemove/BG_REMOVE_UNAVAILABLE。不能声称打开带 bgRemove 的工程不联网，或无蒙版导出已可靠拒绝。最新重试、逐帧蒙版、headless/realtime拒绝和 JJ 三键均未进包。 |

这些 PR 当前均 OPEN，作者完成、CI 与历史审查不等于已集成或全员批准。#154 的旧标题仍写依赖 #151，但当前 base 已是 main；不能继续按旧标题判断依赖状态。

## 严格依赖图与最小集成顺序

`#172@3a1d93ce → #175@de31439d → #176@d219d74f`：两条边均 git merge-base --is-ancestor 返回0；GitHub base 分别为 main、#172 分支、#175 分支。`#151 字体联网同意 → #154` 是共享确认框的代码依赖，#154 当前基于 main d51b27a1。没有证据要求 #154 依赖 #176，二者可分别审查，最终汇合到候选引擎，再更新插件 pin、构建及 Forge 新包。

候选已具有 #151 的 askFontConsent/runtime.fontConsent 前置（app.js:18407），无需重入其合并提交。建议先以此已有前置移植 #154 的最小产品增量，再按 #172→#175→#176 集成助手链。#154 重点来源为 1355bb13、59b4364a、b783bd36 及其前置同意框改动；不能只拣最后文案提交。当前不执行 cherry-pick/merge。原因：#172 的历史已合入 main，含 #169 facts、媒体修复等候选未整批采用的变更；把整个 head 合入会扩大范围。先列产品提交及测试/文案/依赖闭包，排除 docs/demo 演示资产和无关功能，再在原引擎集成分支逐层落实；每层记录来源和冲突，保留现有候选专用修改。

预期重叠点（不是已经执行 merge 得出的冲突结果）：app.js 的助手回复/改比例/导出/合成上下文、ui-preferences.js 文案、chat-proposal.js、agent-format.js、agent-ui/pane.tsx 与生成 cindy-official.js、mcp-server.js 读帧/导出路径。当前候选相对共同祖先也修改 app.js/mcp-server.js/ui-preferences.js，不能用上游整文件覆盖。面板源码与 bundle 必须同源重建并保留许可证。完成受影响定向回归后才更新 pin、新唯一版本及 SOURCE/hash；不重打现有 trial.8 来伪装覆盖。

## 已保留能力与证据边界

原有 #7/#9/#11、149/146/165/178、190 导出修复、恢复/隔离/侧栏、独立身份、mono 新导入居中仍沿原集成链保留，未回退 main。详细逐文件来源及测试见 INTEGRATION-CANDIDATE、ISOLATED-TRIAL、TRIAL2 至 TRIAL8 文档；历史结果仅属于各自源码范围。本轮只做源码/祖先/原包一致性检查，不新增媒体运行通过声明。

trial.8 诊断覆盖 23/23、trial.7 锁提示/隐私定向及最终包路径验证沿用原证据；JJ 两语锁归属提示已经落地，不再待定稿。Windows 合成 HEVC 预览通过不代表 Europa 真实 HEVC 已修；mono 仅新导入，旧工程 pan:-1 不迁移。FLV 走正常导入/代理链，直接入轨 timeout 仍保留。preview.4 七文件歌词专项未包含。无包内 LGPL FFmpeg 真实导出通过声明。

## 给 Video 的继续验收单（恢复授权后执行，现在暂停）

1. 由 Deja 确认审查及可用包，再由 DD 按正式候选详情 ⋮ → Update from file 处理 `_ns__local__montclip-candidate`；原包 hash、版本和回执必须一致。此单不授权升级/启用，旧 montclip 不动。当前已装 trial.3 与待审 trial.8 是不同版本。
2. 在保留的专用 Cindy 验收任务，以候选实例调用 `montclip_candidate_open_task_view`，打开「MontClip 候选试用」，再 `montclip_candidate_status` 记录版本/SOURCE/session/独立 DATA；需看到真实编辑页，ACK 不算页面通过。NO_EDITOR 表示页面未打开，不记成撤销故障。不使用裸 localhost。
3. Video 已完成旧候选页面、身份隔离及真实导入；保留工程与录像，从素材加入时间线继续。记录素材与入出点，调整切点、替换素材，实际播放确认预览更新；若没有“生成草稿”等按钮，记缺项，不用脚本或助手 #175 未集成功能顶替。
4. 实际撤销/恢复后比较剪辑，保存，真正关闭并重新打开同一任务工程，核时间线和定位；Already open、磁盘副本一致、Page.reload 不等于真关闭重开。
5. 用第二个候选任务记录独立工程，查询两边 status，确认不切换对方活跃工程且无串写。由 DD 记录候选所属进程/资源，启动中关闭/失败清理仍需专门实窗证据，不能由单任务死 PID 恢复推定全部通过。
6. FFmpeg 当前缺失，系统5.1.9不满足最低6.0。正式候选下载入口和固定 LGPL 来源见 TRIAL4/TRIAL5；本轮禁止下载，须另获确认后由 DD 检查来源/版本/安装范围。工具未就绪时导出记阻塞，不冒充通过。
7. 工具就绪后导出并实际播放成片：音画同步、切点/尾音、静音段、mono 左右声道、字幕/文稿定位；HEVC 用同 codec/channel 合成对照再评估真实素材，FLV 用导入/代理路径。记录素材条件、版本、输出和失败，不公开真人材料。
8. AI 抠像/带 bgRemove 项目暂不验收，不开启它或以此包声称联网边界已修；#172/#175/#176 的新能力及尾帧保证也不在本包覆盖内。歌词专项仍缺。Video 完整体验与团队审查后再由 Deja 给替换建议；本包完成不准许替换。
