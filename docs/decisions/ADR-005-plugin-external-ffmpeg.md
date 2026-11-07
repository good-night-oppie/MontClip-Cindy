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
- worker 把这个绝对路径（`<设置目录>/external-ffmpeg.json`）传给 `MONTCLIP_EXTERNAL_FFMPEG_SETTINGS`。如果算出来的位置落在 DATA 里面（比如 DATA 被设到了设置目录上层，Windows 上路径比较不分大小写），就不设这个变量，功能保持关闭，不会去 DATA 里读。
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
- 打包进安装包的仍然只有钉死的 LGPL FFmpeg。GPL 的 x264 不随包分发。

## 验证
- `test/external-ffmpeg.test.cjs`：
  - 所有系统（包括 Windows）都跑：各系统的设置目录位置；设置文件不在 DATA 下面；设置目录落在 DATA 里面时功能关闭；Windows 路径比较不分大小写；worker 不再用 `path.join(DATA, "external-ffmpeg.json")`。
  - 只在 Linux/macOS 跑，经过构建出来的 worker 端到端验证：设置文件在设置目录里时，`/api/export/h264` 返回 `external.ok:true`；同样的文件放在 DATA 里会被忽略（`none`）；没有设置文件时返回 `none`。Windows 上不跑这三条：引擎有意用 execFile、不经过 shell 来运行 FFmpeg，而 Node 修了 CVE-2024-27980 之后，`.cmd`/`.bat` 替身程序没法这样启动；要做真正的 `.exe` 替身，CI 机器上得有编译器。
- 合并前（按 QQ 的要求）：在 europa 上用 `/usr/bin/ffmpeg` 实测一次带音轨的 H.264 导出，报告声画差。
