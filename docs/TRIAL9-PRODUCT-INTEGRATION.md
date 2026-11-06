# trial.9 同包产品集成（SOP v2）

独立候选 `montclip-candidate` / `0.5.1-trial.9`，仍为 Draft 待审，不安装、启用、下载工具、替换或合并。trial.8 原包保存在 dist/preserved-trial8 和 Europa c8af1bd 目录。trial.8 的 QQ COMMENTED 只绑定旧产品，不自动批准本次新增量。JJ 已定稿文字按以下来源移植，不重复请求定同句。

## DAG、移植来源和冲突

从候选引擎 `6abdba1b65ac0f7dbef4852d5ba30d2d12cb8939` 保留全部已有功能，先 #154，后 #172→#175→#176；不合入上游分支整头/main，不改 Cindy 的 #120 工作树。#151 askFontConsent 前置已在候选。上游核对 heads：154 b783bd36、172 3a1d93ce、175 de31439d、176 d219d74f。最小产品差异采用 git diff 原提交父→原提交的明确文件列表，以三方应用逐处解决；不是整文件覆盖候选。

| 原 PR/提交 | 新引擎提交/文件 | 保留的行为和冲突处理 |
|---|---|---|
| #154 414a3eb6,d5be1303,1355bb13,59b4364a,b783bd36 | `79476aa9`：app.js、ui-preferences.js，bgremove-consent/copy tests | 显式同意才下载；主动重试；逐帧新有效蒙版、有效属性/范围检查；无蒙版拒绝成功导出，realtime拒绝。字体定稿保留候选版本；fastExport 同时保留现有编码器早拒绝与新抠像检查。三键采用 b783bd36 JJ全文。 |
| #172 a5209ea3,1669fa91,fb2692fb,317112ad | `fa9cd139`：chat-proposal、agent-limits/format、pane、app、index、ui-preferences及测试 | 空方案按全局累计半帧容差判断、无应用按钮、宿主不自动应用。最终加入#175后，旧“助手不会改比例”分支按上游撤去；不带#169声音facts/发送能力。测试仅移除与候选无关的soundNote JSX断言，空方案/累计删减负控保留。 |
| #175 b09e1ba2,f59454e3,f55095c6,a87b9815 | 同 fa9cd139：agent-conversation/plan/policy、capabilities、chat-proposal、app、pane、ui-preferences及测试 | sensitive每次确认、9:16/1:1/4:5新序列、取消/项目变化/64序列上限拒绝、一次撤销；不做plan步骤。JJ文案来自f55095c6及后续明确竞态提示来源，未顺手加入其他功能。 |
| #176 b213541a,3f3743cd,0a7666ec及d219d74f注释 | 同 fa9cd139：reframe.js、app.js、mcp-server.js及测试 | 编辑器最后帧采样；MCP按实际源PTS/time_base取源窗口内最后显示帧；24/30fps、VFR间隙、下一镜头边界、非零入点/慢放及无源帧拒绝。旧序列不自动重算。 |

最终 engine pin `fa9cd1394bb59226b51ce72771b5bff71e1b946d` 已发布在原 `trial/cindy-isolated-20261106` 分支。pane 从当前源码重新构建 cindy-official.js，使用本机已有依赖（逐一核对package.json固定版本），没有下载；不拿上游混入其他功能的生成包覆盖。许可证与NOTICE保留。修改后的CLAUDE/README记录能力，未同步无关demo资产。

## 本次测试，不冒用原 PR 结果

- #154 合成负控：候选旧实现 13/13失败；移植后加字体同意共20/20。只有模拟MediaPipe，无真实模型下载。
- #172 旧实现测试加载失败（缺agent-limits模块），随后组合回归包含累计删减/无变化检测；不把该加载失败称为全部行为红灯。
- #175/#176 旧实现18/18失败；最终组合涵盖上述文件、reframe、capabilities、modes、format、font/bg consent：**75/75**，0 skip。
- 插件 `npm test`（含build）：**103/103**，0 skip。engine release-check通过，26工具匹配manifest。没有重复无影响全量引擎矩阵。
- Windows Node22.15.1，现有FFmpeg/FFprobe9.0.1-full_build-www.gyan.dev，现有Edge；不是Cindy下载LGPL工具。构建目录合成MP4导入/落轨修改/撤销/页面重载、无同意抠像导出拒绝、改9:16/导出/一次撤销通过；最终Forge解包运行结果以原包同目录receipt为准，不将dirty构建目录SOURCE当交付SOURCE。
- `tools/verify-trial-workflow.cjs --reframe` 新增实际runAgentReframe、拒绝无同意抠像导出、60帧计数、最后90ms提示音RMS、≤40ms音画偏差及返回原序列断言。服务器独占根/PORT0/私有协议/127.0.0.1，浏览器独占profile+私有pipe，外网请求拦截。包内机器验证调用产品函数，不等于Video点击批准界面。

机器运行的完整命令：设置MONTCLIP_FFMPEG/MONTCLIP_FFPROBE为本机已有二进制后，`node tools/verify-trial-workflow.cjs <Forge解包目录> <新独占证据目录> --reframe`。硬超时和所属child清理沿原脚本，receipt记录childrenStopped。最终包SOURCE clean/head/pin、全部关键文件hash、原包SHA256、两端路径及合成输出hash写入交付receipt/PR13交接，生成包和素材不进Git。

## 剩余验收与交接

这四项现为“已入候选源码，待本次增量审查”，不再按trial.8缺项处理。QQ应审新移植及冲突解决、网络同意/失败导出、助手能力权限和源尾帧边界；JJ已有定稿来源如上。不得沿用trial.8审查当新包批准。

真实Linux/Europa本包、真实MediaPipe、真实模型回复及完整人工确认UI均未验；HEVC仅既有Windows合成范围，mono旧pan不迁移，FLV直接入轨timeout、preview.4七文件歌词缺项仍保留。机器页面重载不是Cindy真关闭重开；宿主关闭/失败/双任务实窗仍待。已装trial.3保持Disabled。

获得后续正式授权后，DD仅从候选详情⋮→Update from file升级`_ns__local__montclip-candidate`，按新receipt选trial.9原包，保留原Video任务/项目/媒体；不使用trial.8清单中的旧包路径/hash。本任务不执行安装。Video待新包受影响审查和现场准备后，从已导入素材加入时间线继续完整流程，实际看到哪些按钮就用哪些；先前空方案/改比例/尾帧缺项应在新版本补验。FFmpeg下载及启用仍须相应授权，不因本轮打包解除。
