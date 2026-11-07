# ADR-005 插件接上引擎已有的「主播自选 FFmpeg」（用于 H.264 导出）

日期：2026-11-07　负责人：DD　状态：待 QQ 核验　裁定：Deja（2026-11-07，选 B+A）

## 背景
- 引擎已经有一个功能：主播可以自己选一个电脑上已有的 FFmpeg，只要它带 libx264，H.264 导出就用它。代码在 `engine/external-ffmpeg.js`，规则见引擎 ADR `engine/docs/decisions/2026-11-02-h264-encoder.md`。这个功能只在环境变量 `MONTCLIP_EXTERNAL_FFMPEG_SETTINGS` 指向设置文件时才启用。
- 插件的 `node/worker.cjs` 一直没设这个变量，所以 europa 上的 `~/MontClip-Cindy/external-ffmpeg.json`（指向 `/usr/bin/ffmpeg`）根本没被读。2026-11-07 在 europa 上用合成素材导出 H.264，失败了，报错是「这个导出设置要用 x264，需要先在设置里选一个带 x264 的 FFmpeg」。

## 决定
worker 启动引擎时设置 `MONTCLIP_EXTERNAL_FFMPEG_SETTINGS=<数据目录>/external-ffmpeg.json`，只做这一件事：不加界面，不加文案，也不改引擎代码。

## 这是一条新的「调用外部程序」路径（请 QQ 核验）
- 被调用的是哪个程序：只有设置文件 `{version:1, path}` 里写的那个绝对路径。不从 PATH 里找，也不猜（沿用引擎规则）。
- 什么时候调用：先用参数数组、不经过 shell 运行 `-version` 和 `-encoders` 做检查；检查通过后，只在 H.264（libx264）导出时用它编码。预览、解码、探测和其他格式的导出仍然用插件自带的 FFmpeg。
- 外发：不涉及联网。这个程序在本机运行，读写本机文件，不新增网络请求，也没有遥测。
- 谁写这个设置文件：主播自己（或由主播授权的测试人员）。插件不自动生成它。没有这个文件时（ENOENT），引擎判定为 `none`，行为和现在完全一样。
- 日志和页面上的路径：沿用引擎的 `maskUserPath`，用户目录显示成 `~` 或 `%USERPROFILE%`。

## 没做的、仍需决定的
- 插件里还没有让主播「选一个 FFmpeg」的界面，桌面版的文件选择框在 Electron 主进程里，插件没有。主播目前只能手写这个文件。要不要加界面、文案怎么写，由 JJ 和 Deja 另定。
- 打包进安装包的 FFmpeg 仍然只用钉死的 LGPL 版。GPL 的 x264 不随包分发，只用主播自己电脑上已有的。

## 验证
- `test/external-ffmpeg.test.cjs`（Linux/macOS 上跑，用替身程序）：有设置文件时 `/api/export/h264` 返回 `external.ok:true`，编码器里有 libx264；没有设置文件时返回 `external:{ok:false, code:"none"}`，和现在一样。
- 合并后重新打包，在 europa 上用 `/usr/bin/ffmpeg` 实际导出一次 H.264（Deja 要求）。
