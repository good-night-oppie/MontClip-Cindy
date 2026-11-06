# trial.9 MediaPipe 资源安全前置与文案清单（2026-11-06）

**硬依赖：主仓 #154 / 任务 0cda57b0 的资源锁定修复 → 候选最小移植与验证 → 主播交付。** 主仓是唯一实现方，本任务不并行写同一加载器。尚未收到该补丁的最终 commit/资源清单/许可材料，当前不移植、不重打未变 trial.9。

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

## 收到主仓补丁后的移植/验收准备

1. 核最终主仓全SHA、父提交及资源方案；建立原commit→候选diff→新引擎commit映射，只移植实际加载器/资源清单/必要测试/许可与定稿，不整头引入无关main。不修改#120或另一活动分支。
2. 清点主入口JS、运行时再加载的JS/wasm/model/其它文件，每项记录精确版本、文件名、来源URL、字节数、加密摘要、许可证/NOTICE/对应源码及再分发范围。不能假定只有脚本SRI就覆盖wasm/model，也不能把包SHA当第三方来源真实性证明；缺项退回主仓明确补齐。
3. 若远程方案，核固定版本路径、脚本SRI/crossorigin和所有后续资源的实际校验边界；若本地随包方案，核构建追踪/打包路径/许可进入最终ZIP且没有CDN回退。不擅自下载补缺资源或扩大network.hosts。
4. 合成负控先红后绿：缺文件/错hash/篡改字节/非清单路径/加载失败必须不执行不成功导出；同意与拒绝、显式重试、fresh-mask与headless/realtime边界保留。测试只用合成资源，不执行未知远程代码、不下载真实模型。需要真实资源验证时先说明来源与当前授权限制。
5. 对最终候选实际引擎跑受影响测试与构建；资源/NOTICE逐字节核ZIP，SOURCE clean、plugin head、engine pin一致；唯一新版本Forge仅dist/montclip。冻结trial.9原包和receipt，另目录交新包；两端hash读回。既有无变化媒体通过记录保留，不因本通知重跑。
6. QQ审资源供应链/最终差异，JJ核与实际行为一致的全部可见句；DD/Video仍只在明确授权下按正式候选入口处理，不触碰现用版。本轮不安装/启用/下载/重打包。

冻结trial.9：plugin fcd2279889bf616cfa9e44c335726b260678db56，engine fa9cd1394bb59226b51ce72771b5bff71e1b946d；SHA256 8c1748df721e54ebb28e58c00b3a65c7f3de521eedb4ea85ee52f11e62dd96da；Europa `/home/admin/montclip-review/candidates/fcd2279/montclip-candidate-0.5.1-trial.9.cindy`。本轮仅文档追加不修改该包身份。
