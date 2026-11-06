# trial.9 MediaPipe 资源安全前置与文案清单（2026-11-06）

**最新状态已更新：修正源3bf4f508的run42189854839六项SUCCESS，旧add981df CI阻塞已消除。** 按Deja最新明确指令，已独立完成候选最小移植/验证，见 [trial.10交接](TRIAL10-RESOURCE-INTEGRATION.md)。QQ当前head审查和JJ新增文案仍待；下文失败/批准前暂停的段落保留为历史，不继续阻止本次已明确要求的可独立实现，也不当作新包批准。

**当前阻塞：add981df 源补丁 CI 失败，不可放行移植。** 已直接核验 [run 42187166174](https://github.com/good-night-oppie/MontClip/actions/runs/42187166174) 的 head 为 `add981df73c0599fa7859ada636fd78effc26e8a`：Tests(Node18/20/22)及Tests(Windows,Node22)四项均 FAILURE，失败步骤均为测试套件；Syntax & sanity、Release readiness两项 SUCCESS。根因尚未由本任务确认，不猜测失败是环境问题，也不用上游本地通过数字覆盖CI失败。原作者已接手排障，本任务只读准备，不重复下载、不并行改其源码。

恢复依赖顺序：**原作者修正SHA → 核该SHA实际CI与QQ审查/JJ文案 → 重生成并核对最小移植diff → 候选引擎受影响验证 → 新原包**。下文add981df补丁及9资源清单仅为待修正的准备快照，不能直接应用；收到修正SHA后需核新旧差异及是否改变资源字节/hash/许可，不默认为文档修订或等价实现。冻结trial.9继续保持原包与限制。

**硬依赖：主仓 #154 资源锁定补丁的当前 head 审查/JJ文案 → 候选最小移植与验证 → 主播交付。** 主仓是唯一实现方，本任务不并行写同一加载器。源码输入已到：远端核验 `add981df73c0599fa7859ada636fd78effc26e8a`，父提交 `b783bd36cc38adbdf67333786d2f3c09ea38c287`，9资源清单、真实字节审计及许可限制已读。当前 head 的 QQ 核查通知已入队不等于批准；本轮 GitHub reviews 返回空列表，未取得当前批准，因此不移植、不重打 trial.9。JJ新增提示及此前未定稿文字仍待，不再写“源码输入未到”。

## add981df 可执行移植准备（尚未应用）

已 fetch 到引擎隔离仓 `refs/audit/pr154`，未切换/修改候选引擎工作树；原候选 pin 仍 fa9cd139。上游只新增 add981df 一个提交，共26文件，不应整头合入其main历史。

| 文件/增量 | 批准后操作 | 当前核对 |
|---|---|---|
| bgremove-assets.js | 原样移植锁定清单及load/verify/readBounded/locateFile | 9文件，固定0.1.1675465747，共12,379,063字节；fetch integrity+WebCrypto、拒绝重定向、流式字节上限、全部通过后才创建Blob；不另写加载器 |
| app.js | 仅移植ensureBgSeg资源加载/失败dispose和相关注释 | 保留候选已有#172/175/176、编码器早拒绝及抠像失败导出；不整文件覆盖 |
| index.html | 加bgremove-assets.js，位于app.js之前 | 保留候选agent-limits与其余script顺序 |
| ui-preferences.js | 仅新增own.bgremove-assets-failed及最终JJ修订 | 旧17key矩阵保留，不覆盖既有三句/字体定稿；若JJ新commit改变文字，映射实际获审head |
| LICENSES.md、licenses/mediapipe/LICENSE、README.md | 移植准确来源、许可全文及限制 | 插件build.cjs明确复制LICENSES.md、递归复制tracked licenses目录；根tracked .js会包含新加载器。须以最终ZIP逐字节证实，不仅靠源规则推断 |
| test/bgremove-assets.test.js、test/bgremove-consent.test.js、real-tests/bgremove-assets-byte-audit.cjs | 移植必要测试，按候选实际引擎执行 | 保留bgremove-copy/font现有测试；字节审计脚本需明确本地材料，不自动下载或执行资源 |
| real-tests/bgremove-consent-browser-smoke.cjs | 先审启动隔离，再选取受影响浏览器负控 | 不因上游13/13就称候选已测；必须符合独占目录/PORT0/127.0.0.1/所属握手/私有调试pipe；不复用固定端口脚本 |
| package.json、desktop/package-win.cjs | 记录为上游npm/Electron分发许可入口；不直接移植桌面专用改动 | Cindy由build.cjs复制许可证，须验证实际产物；无须把桌面打包功能引入候选 |
| docs/demo/*、docs/docs/*、docs/demo/sync.js | 不移植生成demo和无关网站资产 | 候选自有文档需按实际范围更新，不省略上游验证/许可来源引用 |

已生成未应用的选定文件补丁 `dist/pr154-add981df-prepared.patch`（37,023字节，SHA256 `8566130ebf3a5666c95bdaa8c186437cf91ad3a78c5de6deb37033cf1b4828f1`）和9项清单 `dist/pr154-add981df-resource-inventory.tsv`，仅本地准备材料，不入包、不入Git。获当前批准后先重核remote head及补丁基线，再应用明确文件diff并人工解决候选语义冲突；不得把此准备补丁当已审或直接无检查执行。完整文档来源：主仓该head的 `docs/validation/2026-11-06-pr154-pinned-assets-wip.md` 与 `licenses/mediapipe/README.md`。

上游报告27/27单测、13/13合成浏览器、全量1745 pass/7 skip、真实9文件离线WebCrypto及篡改拒绝：均属于上游报告，本轮没有在候选重跑。其授权真实字节审计下载精确npm tarball（4,049,373字节），不包含真实初始化/推理或live CDN运行授权，本任务也未下载。

许可限制：精确npm包声明Apache-2.0，但无LICENSE/NOTICE/gitHead；随附官方项目LICENSE是参考证据，不证明该commit构建这些二进制，也不证明模型许可证已单独核实。真实9文件hash匹配不扩大成网络沙箱保证；上游静态检查仍说明通用FS helper可接受URL，未见初始化调用，真实运行未验。

### 新增第18项：未定稿、尚未入候选

`own.bgremove-assets-failed`：

- 中：AI 抠像文件未能完成下载和校验，已停止加载。请关闭再开启 AI 抠像重试。
- 英：AI background removal files could not be loaded and verified. Loading stopped. Turn AI background removal off and on again to retry.

这是 add981df 的新草稿，将替代下文记录的无key英文失败toast；等待JJ，不能写成已定稿。下文旧17key表继续准确描述冻结trial.9。当前可完成的是映射、包路径规则核对、资源清单和验证步骤准备；实际移植与新包首先阻塞于当前源CI失败，之后仍需核修正head的QQ审查及JJ所需定稿。

[QQ review 5797240147](https://github.com/good-night-oppie/MontClip-Cindy/pull/13#pullrequestreview-5797240147) 已直接读回：COMMENTED，绑定文档head e5193751 / engine fa9cd139；确认仅文档差异使结论适用于 SOURCE fcd2279 的 trial.9。允许独立测试电脑试用，出现抠像下载提示选“先不用”（评论称“不下载”，当前实际按钮为“先不用”）。不得交主播、替换现用或据此合并；不是本任务安装/启用授权。非 AI 抠像功能的独立试用不依赖此补丁，仍按各自授权/现场条件执行。

## 原包声明与未知边界

源码 ghost.json 与 trial.9 ZIP ghost.json 均为顶层 `network.hosts = ["github.com", "release-assets.githubusercontent.com"]`，**不含 cdn.jsdelivr.net**。这只证明声明，不证明 Cindy 对本机引擎所提供页面的 script/wasm/model 请求实际拦截；没有真实宿主下载验证，不以白名单代替供应链修复，也不扩大白名单。

实际引擎 app.js 的 ensureBgSeg 使用未锁版本的 `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation`；loadScript 设置 src/onload/onerror，无 integrity/crossorigin；locateFile 复用同一未锁版本路径。本轮只读代码/包元数据，没有请求CDN或模型。既有合成MediaPipe测试不是远程资源真实性验证。

## 抠像下载及恢复路径的可见文案

以下从 trial.9 实际 engine/ui-preferences.js 精确提取中英文，不是拟稿。requestBgRemove 使用标题/what/hosts/sent/no和两按钮；noteBgRemove 使用fallback及font-fallback-load；导出错误使用unavailable/realtime；desktop使用desktop。表末同时列共享字体确认框的其它句子，避免把其#151来源误当抠像全文定稿。

| key | 当前中文 | 当前英文 | 定稿依据/待办 |
|---|---|---|---|
| `own.font-net-title` | 要联网下载字体吗？ | Download fonts from the internet? | 复用#151：源码标JJ wording；抠像语境是否直接沿用交Deja/JJ确认 |
| `own.font-net-fonts` | 要下载的字体：{names} | Fonts: {names} | 复用#151：源码标JJ wording；抠像语境是否直接沿用交Deja/JJ确认 |
| `own.font-net-hosts` | 会连接 Google 字体的网站：{hosts}。 | MontClip will connect to Google Fonts: {hosts}. | 复用#151：源码标JJ wording；抠像语境是否直接沿用交Deja/JJ确认 |
| `own.font-net-sent` | 发出去的只有字体名，加上浏览器联网时都会带的基本信息，比如你的 IP 地址。项目、录像和字幕都不会发出去。 | Only the font names are sent, plus what every browser sends when it goes online, such as your IP address. Your projects, recordings and captions are not sent. | 复用#151：源码标JJ wording；抠像语境是否直接沿用交Deja/JJ确认 |
| `own.font-net-no` | 不下载的话，这些文字会用默认字体显示和导出。 | If you don't download them, this text shows and exports in the default font. | 复用#151：源码标JJ wording；抠像语境是否直接沿用交Deja/JJ确认 |
| `own.font-net-deny` | 先不用 | Not now | 复用#151：源码标JJ wording；抠像语境是否直接沿用交Deja/JJ确认 |
| `own.font-net-allow` | 联网下载 | Download | 复用#151：源码标JJ wording；抠像语境是否直接沿用交Deja/JJ确认 |
| `own.font-fallback-load` | 联网下载… | Download from the internet… | 复用#151：源码标JJ wording；抠像语境是否直接沿用交Deja/JJ确认 |
| `own.bgremove-net-title` | 要联网下载 AI 抠像吗？ | Download AI background removal? | 未找到逐项定稿依据；源码仍标草稿，交JJ |
| `own.bgremove-net-what` | AI 抠像要用 Google 的 MediaPipe：第一次用时，MontClip 要下载它的程序和模型。 | AI background removal uses Google's MediaPipe: a program and a model that MontClip downloads the first time. | 未找到逐项定稿依据；源码仍标草稿，交JJ |
| `own.bgremove-net-hosts` | 会连接 jsDelivr 的下载网站：{hosts}。 | MontClip will connect to jsDelivr: {hosts}. | 未找到逐项定稿依据；源码仍标草稿，交JJ |
| `own.bgremove-net-sent` | 只下载，不上传。抠像在这台电脑上算，录像、字幕和项目都不会发出去。对方网站能看到浏览器联网时都会带的基本信息，比如你的 IP 地址。 | It only downloads. The background is removed on this computer: your recordings, captions and projects are not sent. The site sees what every browser sends when it goes online, such as your IP address. | 未找到逐项定稿依据；源码仍标草稿，交JJ |
| `own.bgremove-net-no` | 不下载的话，AI 抠像用不了，预览会保留背景。想保留背景导出，请先关闭这些片段的 AI 抠像。 | Without the download, AI background removal can't run and the preview keeps the background. To export with the original background, turn it off on these clips first. | 已定稿：#154 b783bd36，候选79476aa9；逐字测试覆盖 |
| `own.bgremove-fallback` | 这个项目里有片段开了 AI 抠像，要先联网下载才能用，现在先显示原画面。 | Some clips here use AI background removal, which needs a download first, so they show with their background for now. | 未找到逐项定稿依据；源码仍标草稿，交JJ |
| `own.bgremove-export-unavailable` | 现在不能导出：这个片段的 AI 抠像还没准备好。请回到浏览器剪辑器，按提示下载，或把这个片段的 AI 抠像关掉再开一次；准备好后在同一页导出。想保留背景，先关闭这个片段的 AI 抠像。 | This clip's AI background removal isn't ready, so it can't be exported yet. Go back to the browser editor and follow the download prompt, or turn the clip's AI background removal off and on again. When it's ready, export from that same tab. To keep the original background, turn it off on this clip first. | 已定稿：#154 b783bd36，候选79476aa9；逐字测试覆盖 |
| `own.bgremove-export-realtime` | 边播边录这种导出方式不支持 AI 抠像。请改用「快速（ffmpeg）」或「显卡加速编码」，或者先关闭这些片段的 AI 抠像。 | Realtime recording doesn't support AI background removal. Choose “Fast (ffmpeg)” or “WebCodecs (HW encode)”, or turn off AI background removal on these clips first. | 已定稿：#154 b783bd36，候选79476aa9；逐字测试覆盖 |
| `own.bgremove-desktop` | 桌面版暂时用不了 AI 抠像。要抠绿幕，可以改用按颜色抠像。 | AI background removal isn't available in the desktop app yet. To cut out a green screen, key it by color instead. | 未找到逐项定稿依据；源码仍标草稿，交JJ |

范围说明：#154 明确的三键定稿仅 net-no、export-unavailable、export-realtime；标题、what、hosts、sent、fallback、desktop 六键无本任务可核逐项定稿，不能写成“全部文案已审”。font-* 是已有#151共享机制，源码整段注明JJ wording，本轮不重新代定稿。资源方案若变成随包本地提供或改地址/版本，上述“联网下载/网站/首次下载”等内容必须与最终行为重新对应，旧三键定稿也不能自动适用于改义后的句子。

无 key 的失败 toast（app.js ensureBgSeg catch）：`Background removal unavailable — couldn't load MediaPipe (offline?). Using chroma key still works.` 当前仅英文，未找到JJ定稿依据，且会触及下载失败路径；交Deja/JJ与上游唯一实现方协调，不在候选另造一套提示。loadScript内部Error的 `script load failed: <src>` 被同一catch转固定toast，不能将其误记为已存在的可见翻译key。

## 当前补丁获审后的移植/验收步骤

1. 核最终主仓全SHA、父提交及资源方案；建立原commit→候选diff→新引擎commit映射，只移植实际加载器/资源清单/必要测试/许可与定稿，不整头引入无关main。不修改#120或另一活动分支。
2. 清点主入口JS、运行时再加载的JS/wasm/model/其它文件，每项记录精确版本、文件名、来源URL、字节数、加密摘要、许可证/NOTICE/对应源码及再分发范围。不能假定只有脚本SRI就覆盖wasm/model，也不能把包SHA当第三方来源真实性证明；缺项退回主仓明确补齐。
3. 若远程方案，核固定版本路径、脚本SRI/crossorigin和所有后续资源的实际校验边界；若本地随包方案，核构建追踪/打包路径/许可进入最终ZIP且没有CDN回退。不擅自下载补缺资源或扩大network.hosts。
4. 合成负控先红后绿：缺文件/错hash/篡改字节/非清单路径/加载失败必须不执行不成功导出；同意与拒绝、显式重试、fresh-mask与headless/realtime边界保留。测试只用合成资源，不执行未知远程代码、不下载真实模型。需要真实资源验证时先说明来源与当前授权限制。
5. 对最终候选实际引擎跑受影响测试与构建；资源/NOTICE逐字节核ZIP，SOURCE clean、plugin head、engine pin一致；唯一新版本Forge仅dist/montclip。冻结trial.9原包和receipt，另目录交新包；两端hash读回。既有无变化媒体通过记录保留，不因本通知重跑。
6. QQ审资源供应链/最终差异，JJ核与实际行为一致的全部可见句；DD/Video仍只在明确授权下按正式候选入口处理，不触碰现用版。本轮不安装/启用/下载/重打包。

冻结trial.9：plugin fcd2279889bf616cfa9e44c335726b260678db56，engine fa9cd1394bb59226b51ce72771b5bff71e1b946d；SHA256 8c1748df721e54ebb28e58c00b3a65c7f3de521eedb4ea85ee52f11e62dd96da；Europa `/home/admin/montclip-review/candidates/fcd2279/montclip-candidate-0.5.1-trial.9.cindy`。本轮仅文档追加不修改该包身份。
