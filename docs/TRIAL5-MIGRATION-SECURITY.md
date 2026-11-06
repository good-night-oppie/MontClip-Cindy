# trial.5：旧迁移阻塞复核

仅供 PR13 人工预审。旧 #112/#115 不因迁仓或本次测试自动关闭；QQ 保留安全最终判断。当前已安装 trial.3 保持 Disabled，本任务不操作安装实例、旧项目、桌面或端口47777。trial.4原包保留在 dist/preserved-trial4。

## 逐项映射与证据

| 问题 | 原复现/排除 | 最小改动与测试 |
|---|---|---|
| #112 非 ASCII token | 隔离 PORT0/IPC 服务7个非法请求中4个500；服务捕获异常，合法请求200、进程存活。不是已证明进程崩溃 | engine/server.js sameToken先限定64位小写hex，再比较ASCII Buffer；39eee696；embed-token-bytes.test.js 七个请求均403 |
| #115 安装后300ms停机 | 项目保存延迟400ms，undo PUT另有延迟；旧路径不等待flush，不能承诺reload不丢 | node/engine-worker.cjs改用既有/api/ffmpeg/detect，不停机或重载。失败明确FFMPEG_REFRESH_FAILED；已下载重试也检测。ffmpeg-live-refresh.test.cjs原3失败/1通过，现4通过 |
| 打开页面缓存missing | 仅更新server不足，页面仍禁用导出 | engine ab90da01广播ffmpeg-state/delivery-presets；app.js刷新已有卡片和编码选项。ffmpeg-refresh-events.test.js原2失败，现2通过；真实隔离HTTP/SSE，项目与持久化undo读回不变 |
| raw console/error路径 | 合成Windows、任意POSIX根、含空格用户名、JSON token；旧log及tool exception/download failure会泄露 | node/safe-log.cjs仅event/code及指定数值/布尔元数据，console不记raw；main.js通用异常/下载失败固定文案；frame缺诊断模块时也不记raw。migration-security.test.cjs |
| agent-ui LICENSE/NOTICE | trial.4 ZIP含cindy-official.js而agent-ui/及NOTICE条目为0，licenses/160文件存在不能替代 | build.cjs显式拷贝两份LICENSE/NOTICE、THIRD-PARTY-NOTICES、BUNDLED-LICENSES/PACKAGES、SOURCES及licenses目录；9项与engine源码逐字节比对 |

日志少了原始错误细节是有意取舍：保留安全事件/错误码，不依靠路径正则覆盖所有隐私。合法状态结果中的明确DATA路径、用户请求的业务内容不在本次删改范围。copyLine仍是既有正则策略，不能据日志修复宣称所有可复制诊断都通过完整隐私审计；这一剩余项交QQ复核。

## 复现命令与准确范围

在本分支：npm test，最终71/71。新增 test/migration-security.test.cjs（5项）及 test/ffmpeg-live-refresh.test.cjs（4项）。
引擎：node --test --test-concurrency=1 test/embed-token-bytes.test.js test/ffmpeg-refresh-events.test.js test/writer-lock-lifecycle.test.js test/cindy-engine-split.test.js，最终34/34。插件和引擎同时运行曾出现隔离40秒和SSE3秒限额超时；最终分开运行、保持原限额通过，不抹掉该次失败。
失败和通过日志保留本地任务目录：embed-token-before/after.log、migration-security-before.log、ffmpeg-refresh-before.log、ffmpeg-events-before.log、migration-full-test.log、engine-migration-after.log。

安装归档部分使用已有隔离文件测试和VM依赖替身；没有下载或运行新增FFmpeg。页面通知回归执行实际监听函数；HTTP/SSE回归运行真实隔离server。它们不等同于真实Cindy下载、完整浏览器剪辑/undo操作或Europa验收。此前HEVC/mono/合成导出结论只沿用其已测源码范围，不称新包已重复媒体全流程。

## DD / Video 后续（需团队审查后另行安排）

1. 不循环启停现用候选。若批准升级，只在Plugins→MontClip候选试用详情→⋮→Update from file选择trial.5，目标仅namespace local / _ns__local__montclip-candidate。核原文件SHA256与receipt的packageSha256、版本、revision、enabled；UI不显示完整hash。不手改安装目录，不碰_ns__local__montclip。
2. 保留当前工程/录像；原任务通过候选实例montclip_candidate_open_task_view打开，montclip_candidate_status核SOURCE、版本、session、DATA和实际页面state。入口ack不能替代页面通过。
3. 工具正式入口仍为候选外层“下载并安装”或montclip_candidate_install_ffmpeg。固定n9.0.2-42-gd7643a0fe3，LGPL-3.0-or-later；归档/来源/安装范围详见TRIAL4-LOCK-AND-FFMPEG.md。trial.5覆盖其中“安装后重启”的旧描述：现在同进程重新检测。记录实际-version/-L、任务工具目录、ready/noH264等真实状态，不把文件安装完成当可导出。
4. 先合成工程制造待保存编辑及两步undo/redo，再按正式入口安装或重新检测；记录页面未重载、同origin/所属PID、编辑和撤销链、保存后重开、第二任务未变。检测失败应有错误码，引擎保持，重试不重复下载已验证归档。
5. Video从现有真实导入后的加入时间线继续，亲自完成切点/替换→撤销恢复→保存重开→导出→实际播放核音画/尾音/静音/定位。机器回归不替代人工体验，缺按钮如实记录。

## 显式保留的限制

两次正式停用留死owner锁与此前无手删自动接管成功同时成立；精确退出信号未知，不是无法启动，也不是全部清理通过。双任务真实页面隔离、启动中关闭/失败清理、FFmpeg实际下载及Linux导出、Video完整流程仍未验。旧系统FFmpeg5.1.9不冒充候选工具。

歌词专项preview.4七文件未纳入；mono仅新导入居中，旧pan不迁移；HEVC仅Windows合成已测，非Europa真实素材修复结论；FLV正常remux路径与旧直接落轨timeout分开。#7/#9及旧PR正式批准不全，旧#117引擎范围不能批量视作过期。

只读公开宿主行为和插件自身源码；本轮未读asar/REA。此前接触事实及Cindy0.1.126源码tag不匹配限制保留。Draft可人工预审，不代表批准/可安装/可替换；QQ、Rea、VV/JJ、Deja门禁不变。
