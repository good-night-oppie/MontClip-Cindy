# 独立候选试用 — 不替换现用 MontClip

当前状态和可交 Video 的剩余验收单以 [trial.8 产品覆盖](TRIAL8-PRODUCT-COVERAGE.md) 为准：已装 trial.3 保持 Disabled，trial.8 原包待审，#172/#175/#176/#154 未包含。以下各段为分阶段历史记录，不将旧的“尚无实例/待安装”等文字当作最新现场结论。

本分支 `trial/isolated-candidate-20261106` 从已交付 preview.7 的 `4633f90d4cf5533cb055da26f1972fed533a1d63` 建立。仅用于独立试用，不应合入正式插件默认身份。原 PR #12、原包与真实项目保留。本任务不安装、重启现用实例、合并或发布。

## 身份与宿主证据

- id `montclip-candidate`，显示名「MontClip 候选试用」，命令「候选剪辑」，版本 `0.5.1-trial.3`，minCindyVersion `0.1.126`。
- 本机只读宿主查询为0.1.127。Europa dpkg及实际运行资源为0.1.126，`/usr/lib/cindy/resources/cindy-source.json` 声明 `a87d49a1a3bf1de408cfe44362f0fc78f1495deb`。官方仓该commit查询404，官方v0.1.126标签指向另一个commit `5ab30ec856e57e2ae8944657e9e2d69264c672f5`，不拿标签代替实际构建源码。
- 只读核验Europa实际app.asar：主bundle SHA256 `07378332965fe9b18a210aeb4f53d6ee9da54c1452420f0e1e050c44112bc919`；Node worker SHA256 `4a82a7b84f075721e9b1ccfd10341420ba701bf99863ccfc5af25a2884eb034f`。核实id正则、local身份安装、taskView按实例/session路由、session_context由宿主注入、node子入口契约。
- 目标宿主由DD报告为Cindy0.1.126。正式UI选择原包→inspect给出packageSha256→install校验expectedPackageSha256；不直接调用内部IPC。同namespace/id重复导入拒绝，install_copy不是任意克隆入口。未发现单实例DATA注入公开配置，候选自行设置路径。
- 新增 `node.childSpawn:true` 与申报入口 `node/engine-worker.cjs`。在宿主通过 `await __CINDY_NODE__.spawnEntry(entry,args)` 启动，子入口在加载引擎前验证参数并自行设置路径，不假定process.execPath是Node，也不依赖宿主注入DATA。普通Node测试有独立分支。缺入口能力/配置拒绝启动。
- 精确构建开源源码不可取回的限制仍在；本次使用随包技能契约加实际部署bundle核验，未声称已在Cindy真窗口运行。

## 隔离与负控

默认根为 `~/MontClip-Cindy-Candidate`。独立根需有候选标记；已有非候选非空目录拒绝复用。显式 `MONTCLIP_CANDIDATE_DATA` 仅是独立启动配置，不声称宿主会转发环境变量。

每个session取SHA256目录名：`tasks/<hash>/`，拥有独立project/versions/media/exports/frames、runtime/ffmpeg、runtime/asr、runtime/asr-models、cache/config、浏览器profile及engine子进程。每个引擎只绑定127.0.0.1、PORT0，来源由私有进程协议报告；鉴权token独立。Linux临时根使用短独占`/tmp/mcc-*`、0700；浏览器不使用共享profile。工具按任务安装，下载进度也带session；不会为了一个任务装工具而重启其他任务。

拒绝已知旧根`~/MontClip-Cindy`、`~/MontClip`、`~/FableCut`及配置旧根的重叠目录；拒绝junction/symlink祖先及候选内容中的链接。导出目的地额外拒绝旧根、其他候选实例及本候选的其他任务目录。写锁拒绝两个router共用一根。正常退出等待正在启动的spawnEntry，向子进程发送EOF并等待退出，超时只清理自己的子进程。

最多4个引擎子进程（包含管理/工具目录进程），试用建议至多同时开3个任务。资源上限明确拒绝，不借用其他任务引擎。侧栏无session时显示打开具体候选任务的提示，不连接control工程。overview只读各任务持久文件，重启后不需要切换其活跃项目。

负控先红后绿：原worker的任务A/B返回相同origin，且允许使用合成旧根；两个测试均失败。改为router后通过。扩展7项包括：双候选根×双任务独立写入/worker重启重开；查询B不改变A活跃工程；无页面返回NO_EDITOR；同根写锁/junction/内部链接拒绝；异步宿主形态spawnEntry（无exitCode属性）启动中EOF清理；status每个任务请求携带正确session；导出目录策略。合成旧实例哨兵内容和目录均不变。另1项验证全部工具安装进度带原session。

## 保留能力与媒体覆盖

| 范围 | 来源和实现 | 本次证据/限制 |
|---|---|---|
| preview.7全部修复 | 原插件4633f90、engine2866d4d8祖先 | 保留#7/#9/#11、149/146/165/178/190、恢复/隔离/侧栏/不透明配方；原矩阵在INTEGRATION-CANDIDATE.md，身份/路径以本文为准 |
| 新mono导入居中 | 已合#179：2c870b6f测试+6598b370修复；本引擎5868b071/22a9500a | 原包左−12dB/右−91dB负控；原始单测2过5败。修复后mono suite9/9，真实router导出左右均约−15.06dB。保留旧项目有意pan，不强改既存项目 |
| #183 | head b52452d5fc63550608e410b06dc54b82d1f6c536，OPEN、无GitHub review | panAuto/旧项目提示/单边导出警告不纳入，不冒称已迁移 |
| HEVC预览 | 同包合成hvc1/yuv420p竖屏、in=5、B帧；实际setTime及帧工具 | Windows Source5/10和Timeline0/5对应白/红，通过；旧单次黑图探针未同步时间，归因无效。真实素材/Europa仍待验，无新增HEVC修复 |
| FLV | H.264/AAC正常导入prepareMedia remux成MP4 | 新流程通过；其他需转码路径未验。旧直接FLV落轨presented frame timeout仍保留 |
| preview.4歌词七文件 | 未提交专项 | 不包含，不能能力等价替换现用版 |

引擎完整pin为 `22a9500ac5a970fdbe0372f9607c55e7ef73f13e`。源链公开在 `trial/cindy-isolated-20261106`。没有将HEVC问题或声道问题混称为尾音修复。

## 验证与交接

Windows插件43通过/0失败；引擎组合141项：140通过/0失败/1环境跳过（无本地FFmpeg的硬件编码器分支）；其中mono9/9。Node22.15.1、Edge/Chrome156.0.8078.80、系统FFmpeg9.0.1 Gyan full build。未下载未知工具。验证fixture在专属任务runtime中放置同一已知系统二进制，仅证明此工具链，不冒充Cindy下载LGPL。

`tools/verify-trial-workflow.cjs <解包目录> <新证据目录>` 必须用最终Forge原包解包运行。通过实际router建立任务A/B的独立引擎；实际importFiles→落轨→x0改37→undo回0→保存→Page.reload并验证timeOrigin变化→导出，两任务均执行。另有FLV正常remux路径。检查输出H.264/音频、时长、音画闪光/蜂鸣偏移、左右RMS。记录所有enginePid，EOF退出并验证均停止。`--hevc`旧直接drawFrame取样不能作为黑屏归因，须实际setTime并核对媒体currentTime。机器函数流程不代替Video人工点击；Page.reload只代表页面重载，另有worker重启持久性测试，不代表Cindy任务重开已验。

最终HEAD/SOURCE clean/包SHA256/本地与Europa完整路径由Draft PR回执给出。Forge只打包dist/montclip。独立包不是旧preview.7原包，旧包仍保留。最终包需两端hash一致。未跑Linux/Europa实际runtime、真Cindy、包内下载LGPL、全套隐私像素矩阵、完整Video验收。

## DD安装与Video人工入口（此任务不执行）

1. 候选已安装且Disabled，不再按首次安装处理。按TRIAL3-HOST-COMPATIBILITY.md从候选详情Update from file升级；核验原包SHA256，保留旧montclip与候选项目。
2. 经Europa Cindy插件界面导入该**新原包**。检查显示「MontClip 候选试用」、id montclip-candidate、版本0.5.1-trial.3、新childSpawn权限。若提示更新montclip或任何现用实例，停止。不要使用install_copy假设数据已隔离；不要重打包后仍称原包。
3. 记录安装回执真实instanceId与namespace，再按该身份查询详情并调用工具，不能只按裸id猜实例。此步骤尚未执行，当前没有可声称的已安装candidate instanceId。
4. 在专用Cindy验收任务中通过候选实例调用 `montclip_candidate_open_task_view`，打开标题「MontClip 候选试用」。再调用 `montclip_candidate_status`，核对pluginId/version/SOURCE、该任务session和dataDir；页面角标也显示候选版本/session。不是裸localhost。工具目录仍为list_tools/call_tool，底层fablecut_*工具名保持原样。
5. NO_EDITOR表示当前任务没有打开页面，先打开候选任务页；不把它记成撤销坏。任务页之外没有session的通用侧栏会提示进入任务，不冒用别的项目。
6. Video亲自完成选素材→导入→生成/加入草稿→调整切点与替换→撤销/恢复→保存重开→导出→实际播放，核音画/尾音/静音/定位；只用真实已有按钮，缺项照实记录。不以脚本绿灯替代人工全流程。
7. HEVC真实环境、歌词缺项及Linux/真Cindy待验保持显眼。Video完整体验、QQ/Rea/VV/JJ及团队审查后，由Deja提出是否替换建议；未验不得替换。Draft可人工预审，不等于批准。独立仓Inbox配置未改，未绕过门禁。

## trial.2 定向修复及证据边界

浏览器删除自身CRX_INSTALL临时目录时，路径检查原先在exists/lstat及readdir之间遇到ENOENT，使正常任务请求失败。test/trial-path-race.test.cjs先2失败/2通过，修复后4通过。仅忽略ENOENT；权限错误及链接仍拒绝。没有延长工具超时，没有删除他人临时目录。

插件npm test为47通过。引擎pin未变，既有140通过/1环境跳过沿用原源码范围，不重复无变化全矩阵。mono只修新导入，旧项目pan:-1不自动迁移。Page.reload与worker重启不等于真实Cindy任务关闭重开；NO_EDITOR不等于撤销坏。

原trial.1失败回执保留在dist/video-offset-32c3034；准确诊断命令和调用链随定向回归脚本及新回执交接。正式包版本/head/hash/路径见PR最新回执，旧包保留。

后续不读取DD的app.asar/REA摘录。此前确曾接触内部实现，不能追溯宣称clean-room。包内sourceCommit与官方tag不一致，源码未精确匹配限制保留；需宿主细节时仅取公开契约或输入输出行为SPEC。broker归属不保证整棵后代树退出。DD应在新候选专用任务分别记录正常关闭、启动中关闭、异常中断前后所属engine/FFmpeg/browser PID，以及另一任务工程未变；只操作候选，真实Cindy清理尚未验证。
