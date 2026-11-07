# ADR-005 插件接上引擎已有的「主播自选 FFmpeg」（用于 H.264 导出），设置文件放在插件自己的设置目录

日期：2026-11-07　负责人：DD　状态：待 QQ 核验　裁定：Deja（2026-11-07，在 #35 上选「把设置文件搬出 DATA」）

## 背景
- 引擎已经有一个功能：主播可以自己选一个电脑上已有的、带 libx264 的 FFmpeg，H.264 导出就用它。代码在 `engine/external-ffmpeg.js`，规则见引擎 ADR `engine/docs/decisions/2026-11-02-h264-encoder.md`。这个功能只在环境变量 `MONTCLIP_EXTERNAL_FFMPEG_SETTINGS` 指向设置文件时才启用。插件之前一直没设这个变量，所以 europa 上用合成素材导出 H.264 失败了，报错是「这个导出设置要用 x264，需要先在设置里选一个带 x264 的 FFmpeg」。
- QQ 审 #35 第一版（把设置文件放在 `<DATA>/external-ffmpeg.json`）时指出：引擎自己会往 DATA 根目录写文件。设置文件放在那里，以后引擎里任何一个路径逃逸的 bug，都可能被利用来写进这个设置，变成「运行任意程序」。

## 决定
- 设置文件放在插件自己的设置目录（`node/lib.cjs` 的 `configDir`），不放在 DATA 下面，也不放在插件目录里（插件更新会整体替换插件目录）。这和桌面版放在工作区外的 userData 是同一个思路。各系统的位置：
  - Linux：`$XDG_CONFIG_HOME/montclip-cindy`，没有这个变量时用 `~/.config/montclip-cindy`；
  - macOS：`~/Library/Application Support/MontClip-Cindy`；
  - Windows：`%APPDATA%\MontClip-Cindy`。Cindy 启动插件时会裁剪环境变量，可能没有 APPDATA，这时用 `<home>\AppData\Roaming\MontClip-Cindy`。
  - `MONTCLIP_CINDY_CONFIG` 可以覆盖这个位置，只给测试用。
  - 这几个环境变量（`APPDATA`、`XDG_CONFIG_HOME`、`MONTCLIP_CINDY_CONFIG`）只认绝对路径；空值或相对路径都当没设，走默认位置。所以算出来的位置永远是绝对路径，不会随进程从哪个目录启动而变（Rea 在 #35 指出；XDG 规范本来也要求忽略相对的 `XDG_CONFIG_HOME`）。
- worker 把这个绝对路径（`<设置目录>/external-ffmpeg.json`）传给 `MONTCLIP_EXTERNAL_FFMPEG_SETTINGS`。如果这个文件**实际**落在 DATA 里面，就不设这个变量，功能保持关闭，不会去 DATA 里读。判断方法：
  - 设置文件和 DATA 两边都先解析真实路径再比较（`realLocation`：从最近一级已经存在的目录用 `fs.realpathSync.native` 解析，没建的部分原样接上）。所以路径上任何一层是符号链接或 Windows 目录联接（junction）、指进 DATA 的，或者 DATA 本身是经链接访问的，都会被认出来（Rea 在 Win11 上用 junction 实测绕过了上一版的字面比较）。
  - 设置文件本身是链接、指进 DATA 的，同样关闭。悬空链接（目标还不存在，以后可能被建出来）、或者任何一层解析失败的，一律关闭。
  - Windows 上比较不分大小写。
- 没有设置文件时（ENOENT），引擎判定为 `none`，行为和现在完全一样。DATA 里以前留下的同名文件不再被读取。
- 不加界面，不加文案，也不改引擎代码。

## 另一种做法（没选）
- 设置文件仍然放在 DATA，但拒绝指向 DATA 里面的程序路径（只允许 DATA 外的 FFmpeg）。
- 没选的原因：这只防住了「被写进来的程序在 DATA 里」这一种情况。只要设置文件本身在引擎能写的地方，路径逃逸的 bug 就能把设置改成指向系统里任何一个已经存在的程序，再配上被篡改的参数或别的漏洞，风险还在。根本办法是让引擎写不到这个设置文件。另外，这种做法要在插件里重复引擎已有的路径规则，两份规则以后容易不一致。

## 这是一条新的「调用外部程序」路径（请 QQ 核验）
- 被调用的是哪个程序：只有设置文件 `{version:1, path}` 里写的那个绝对路径。不从 PATH 里找，也不猜（沿用引擎规则）。
- 什么时候调用：先用参数数组、不经过 shell 运行 `-version` 和 `-encoders` 做检查；检查通过后，只在 H.264（libx264）导出时用它编码。预览、解码、探测和其他格式的导出仍然用插件自带的 FFmpeg。
- 外发：不涉及联网，在本机运行，不新增网络请求，也没有遥测。
- 谁写这个设置文件：主播本人（或由主播授权的测试人员）。插件不自动生成它，也还没有选择 FFmpeg 的界面；要不要加界面、文案怎么写，由 JJ 和 Deja 另定。
- 日志和页面上的路径：沿用引擎的 `maskUserPath`。
- 检查和使用之间的残余风险（请 QQ 判断，我认为可以接受）：worker 只在启动时检查一次，引擎每次用时再读文件，中间设置目录可能被换成链接。但要换它，必须能写主播自己的设置目录；这次要防的是「引擎里的路径 bug 只能写 DATA」，这种 bug 写不到设置目录。能写设置目录的，本来就能以主播身份做任何事，这一步不扩大影响面。所以这一版不在引擎读文件时再核一次，也不改引擎。
- 打包进安装包的仍然只有钉死的 LGPL FFmpeg。GPL 的 x264 不随包分发。

## 验证
- `test/external-ffmpeg.test.cjs`：
  - 所有系统（包括 Windows）都跑：各系统的设置目录位置；设置文件不在 DATA 下面；设置目录落在 DATA 里面时功能关闭；Windows 路径比较不分大小写；相对或空的 `APPDATA`/`XDG_CONFIG_HOME` 当没设、结果总是绝对路径；在真实磁盘上建链接（Windows 用 junction，不需要管理员权限）：设置目录是指进 DATA 的链接、还没建的设置目录的上层是这样的链接、DATA 经链接访问，这几种都关闭；指向 DATA 外的链接照常可用；worker 不再用 `path.join(DATA, "external-ffmpeg.json")`。
  - 只在 Linux/macOS 跑：设置文件本身是指进 DATA 的链接、设置文件是悬空链接，这两种都关闭（Windows 上建文件链接要管理员权限）。
  - 只在 Linux/macOS 跑，经过构建出来的 worker 端到端验证：设置文件在设置目录里时，`/api/export/h264` 返回 `external.ok:true`；同样的文件放在 DATA 里会被忽略（`none`）；没有设置文件时返回 `none`。Windows 上不跑这三条：引擎有意用 execFile、不经过 shell 来运行 FFmpeg，而 Node 修了 CVE-2024-27980 之后，`.cmd`/`.bat` 替身程序没法这样启动；要做真正的 `.exe` 替身，CI 机器上得有编译器。
- 合并前（按 QQ 的要求）：在 europa 上用 `/usr/bin/ffmpeg` 实测一次带音轨的 H.264 导出，报告声画差。
- Windows 没跑的部分：经 worker 的端到端导出、Windows 上的外部 FFmpeg 音画实测（Rea 手上暂时没有带 libx264 的 Windows FFmpeg）。补法：找到一份带 libx264 的 Windows FFmpeg 后，在 Win11 测试机上手工跑一次闪光加提示音，结果补在 PR 上。在那之前，Windows 上的结论只有路径判断的测试，没有导出实测。
