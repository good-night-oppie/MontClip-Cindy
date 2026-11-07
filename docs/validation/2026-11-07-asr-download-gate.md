# ASR 下载开关与验收边界

依据：Deja 在 PR #8 的决定（2026-11-07，基于 9d6bb6f8）：
https://github.com/good-night-oppie/MontClip-Cindy/pull/8#issuecomment-6712495724

## 默认关闭

`asr-download.json` 的 `enabled` 为 `false`。`node build.cjs` 使用同一配置生成
`dist/montclip/main.js` 与 `ghost.json`：不显示下载按钮，不注册
`montclip_install_asr`。源代码直接运行也默认关闭。旧卡片触发安装动作时立即返回
“听写下载尚未开放”，不查询 worker、不弹确认、不下载。不自动探测 release，
不会为检查开关而联网。已有本机听写资源的使用方式不变。

## 本机验收构建

仅在独立作者源码目录将 `asr-download.json` 的 `enabled` 临时设为 `true`，
运行 `node build.cjs`，从 `dist/montclip` 用 Forge 打包。构建产物会同时启用
按钮、工具声明和处理器；确认框仍是原来的 `cindy.confirm`，没有跳过确认的分支。
不提交或发布这个开启配置。验收后还原 `enabled:false` 并重新构建。

安装本机验收包需要主人明确要求，并使用 Forge 安装的真实实例身份进行测试；
不直接修改已安装插件目录。本轮不上传 release 资产，不点击实际下载确认。

Win11 Cindy 待验收：确认框原文、取消后的下载记录、会话“这个聊天中都批准”时
仍显示确认框。记录必须脱敏；模拟宿主测试不算以上实跑证据。

## 正式打开前提（后续 PR）

1. 主人已看过文件清单，按 ADR 完成资产上传并核实 release 存在。
2. 国内网络实测完成。
3. 在真实 Cindy 点下载，所有文件校验、安装完成，听写可用。
4. 以该 PR 的新 head 送 QQ 核验后，才可提交 `enabled:true`。

真实下载验收延后是 Deja 的排期决定，仍待 QQ 接受；本文件不是终审批准或 SOP 例外。

## 归档防护

Linux 使用 `/usr/bin/tar`，Windows 使用绝对系统目录下的 `System32/tar.exe`，
不回退到 PATH。提取前拒绝绝对路径、`..`、Windows 盘符和非普通文件/目录条目；
提取后遍历整个暂存目录，拒绝符号链接/junction、硬链接、特殊文件和解析后越界的路径。
这层防护不替代固定字节数及 SHA-256 的先行校验。
