# trial.3 宿主兼容与已装候选升级

trial.2已正式UI安装到namespace local、instanceId `_ns__local__montclip-candidate`，随后因`child.stdin.on is not a function`启动失败。现在Installed/Disabled。旧`_ns__local__montclip` preview.4未动，不重新新装、不卸载、不手改安装目录。

## 契约及修复

依据随宿主公开skill plugin-node-worker.md §4.12.4及DD输入输出说明：await spawnEntry、stdout.on(data)、stdin.write、child.on(exit)、kill。宿主适配不要求stdin.on/end/destroy、child.once/stderr/exitCode。普通Node适配另用Writable回调和EOF，不将其行为说成宿主证明。

写入同步异常及实际thenable拒绝进入失败清理；写入返回不视作请求成功，只有JSON-RPC响应确认。宿主false返回因无公开drain契约明确失败，不猜测背压恢复；队列上限32、请求256KiB、响应行1MiB、协议超时120秒。异步写按序提交；协议错误、超时、初始化失败均终止持有child，等待exit。关闭宿主child使用公开kill，不依赖stdin.end。未在6秒收到exit则报CHILD_EXIT_UNCONFIRMED，保留失败占位避免重复启动，不称清理成功。EOF等候已发起spawnEntry返回后关闭持有句柄。

初始化先注册exit，再接触其他表面；ready后才登记可用entry。合法JSON坏结构亦进入协议失败。公开契约没有说明spawnEntry永不返回、返回前已退出是否补发exit；若出现这些情况须DD提供外部事件记录，不能假设已清理。kill只覆盖已持有句柄，整棵FFmpeg/浏览器后代退出须真宿主复验。

## 回归证据

原host-stdin-before.log明确复现同一stdin.on错误。test/child-channel.test.cjs覆盖最小非EventEmitter输入流、同步throw、thenable拒绝、false背压、无回复、早退、坏JSON/null、初始化失败、关闭中写入、未确认退出。test/trial-isolation.test.cjs补实际引擎启动/EOF、异步启动中EOF、初始化同步退出后同任务可重试。旧普通Node形态mock不冒充真实宿主。

原trial.2 DD行为材料：候选router及四个spawnEntry PID在报错后仍活；详情Enabled停用后五PID消失、候选锁移除，旧锁仍活。未观察到归属候选的Chrome/FFmpeg，不称ready。仅两个task marker，无项目/媒体/导出；四个空0700 /tmp目录保留，本任务不删除。

## DD最小升级与复验（由DD执行，本任务不安装）

1. 记录候选Disabled状态、旧montclip版本/锁及项目基线。Plugins→MontClip候选试用详情→⋮→Update from file，选择最终trial.3原包；确认目标仍为`_ns__local__montclip-candidate`、版本trial.3及包hash。若目标是旧montclip或不支持升级，停止并回传界面，不绕过正式入口。
2. 记录升级回执hash与启用状态。按验收安排仅启用候选；在原DD验收任务调用候选实例`montclip_candidate_open_task_view`，再`montclip_candidate_status`。open返回只证明路由；须页面实际加载、status给出正确SOURCE/head/version、session/dataDir、enginePid与loopback来源后才称ready。
3. 第二独立任务重复status，记录两任务DATA/进程/工程不同、B查询不改A活跃工程。只用合成工程测试写入/保存/重开/撤销；NO_EDITOR先打开页面。
4. 在合成空闲状态关闭候选任务/停用候选，记录已持有engine PID、候选router及已归属后代是否消失，另一实例/项目不变。另单独记录启动中关闭及失败退出；未确认所属资源不按父PID或目录名盲杀。
5. 出错回传工具原始errorCode/message、时间、任务session、版本/SOURCE、可观察PID及退出事件。`CHILD_EXIT_UNCONFIRMED`不视为已停；仅按已证实候选详情Enabled处置，不扩大到旧实例。
6. ready与隔离通过后Video再做选材→导入→生成/加入草稿→切点/替换→撤销/恢复→保存重开→导出→实际播放核音画/尾音/静音/定位。无对应按钮照实记录。

## 限制

本轮未读app.asar或REA摘录；此前接触事实保留，不追溯宣称clean-room。目标0.1.126的sourceCommit与官方tag不一致，源码未精确匹配。宿主最小形态测试只是契约回归，真实Cindy/Linux必须由DD复验。

引擎pin不变；mono只修新导入，旧pan不迁移；HEVC Windows合成通过不外推Europa真实素材。歌词七文件未集成，包内下载LGPL/Video完整流程仍未验。旧FLV直接落轨timeout不在本轮范围。不安装、重启旧实例、合并或发布。
