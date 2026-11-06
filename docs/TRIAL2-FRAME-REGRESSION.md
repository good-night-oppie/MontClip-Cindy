# trial.2 帧请求定向回归

原trial.1失败保留：`dist/video-offset-32c3034/{receipt.json,server.log,audit-source.cjs}`及`h264-control/receipt.json`，未覆盖。失败来自相同包32c3034。仅用合成媒体，不读现用实例。

## 两个独立原因

1. 产品路径：`montclip/call → engine(session) → safeTree(root) → noLinks/lstat 或 readdir`。Chromium删除自身CRX_INSTALL目录会触发ENOENT。`test/trial-path-race.test.cjs`确定性先2失败、2通过；仅容忍消失后4通过。权限/链接仍拒绝；不宣称瞬时检查能阻止恶意并发换链。
2. 测试路径：旧脚本设置`FABLECUT_NO_FS_WATCH=1`，`replaceMedia → writeProject`后磁盘revision4而页面3。`fablecut_frame(timeout:15) → runExportJob`等待150×100ms同步，脚本请求在15213ms取消。显式同步后同15秒参数328ms成功；正常watch的stage正控324ms成功。不延长超时、不修改引擎行为。旧替换后红图可能仍来自旧HEVC，须同时核对页面revision及src。

## 复现命令

在本仓运行，`<package>`必须是最终Forge原包解包目录，证据目录必须不存在：

```powershell
node --test test/trial-path-race.test.cjs
node tools/verify-replace-frame.cjs <package> <new-watch-evidence> generate --watch
node tools/verify-replace-frame.cjs <package> <new-negative-evidence> <new-watch-evidence>
```

`generate`仅生成720×1280 HEVC/hvc1与H264、30fps、GOP90/B帧、AAC mono44100Hz合成片；也可传上述已生成合成目录复用。脚本使用已知本机FFmpeg及浏览器、不下载工具。正常watch必须验证替换后页面revision/src、15秒内红色帧成功，再验证H264 start10/in22/duration8的timeline15蓝色帧。关闭watch负控必须观察页面落后与timeout，然后显式同步后同期限通过。receipt.ok有断言，不将包含error的回执标全过。

浏览器与引擎专属目录、loopback来源握手、调试pipe、硬期限和定向清理沿用原规范。回执记录所属引擎PID及childrenStopped；不是Cindy真实宿主整棵后代清理证明。原始命令、工具版本和失败回执与最终包一起交接。

## 仍未验

Linux/Europa实际Cindy、包内下载LGPL、Video人工选材至实际播放全流程未验。HEVC仅Windows合成通过；真实素材问题不宣称修复。mono仅新导入居中，旧工程pan不迁移。默认文件监视必须由真实宿主正常提供；若DD遇到替换后帧失败，专用候选任务记录替换前后status、页面与磁盘revision、src、15秒帧请求原始回执，保持另一任务工程不变，不触碰现用实例。
