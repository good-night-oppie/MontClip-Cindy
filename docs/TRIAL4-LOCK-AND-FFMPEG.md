# trial.4：锁恢复与任务内FFmpeg交接

## 已通过事实保留

DD在Cindy0.1.126正式升级trial.3后已看见真实页面，state HTTP200/revision0/clips0，SOURCE08c8bc4/22a9500及独立DATA正确。空闲正式停用后router2326334及engine2326405/2333777/2343263均退出，旧90375仍活。根锁留有已退出router PID，候选现Disabled；不重做已过启动修复，不手删锁。

## 残留锁解释与修复

writer-lock的release挂在Node exit事件，router正常EOF也主动释放；强停不保证执行JS退出钩子。公开宿主契约不保证每次正式停用必经插件清理，因此文件残留不能直接认定死锁，也不能称清理全过。

已有acquire在owner PID已死时自动接管。新生命周期测试证明正常退出/普通异常释放、SIGKILL残留后自动恢复及再次获取；最终候选router从合成dead-owner根锁启动并正常退出移除锁，无手删。

发现旧判断允许holder.pid等于当前PID时接管；修复为任何活PID都拒绝（包括PID复用、同进程重复获取）。EPERM按存活；损坏/不可读/无有效PID的锁不作为死亡证据，保留并返回DATA_DIR_IN_USE。先7项4通过3失败，修复后7/7；与既有engine-split合计31/31。这里不是并发恶意替换/完整原子锁算法改造，不扩大保证。

引擎最小提交a0f72a7e1af1e204e0c0f846a4f0a90ac52c0df8，保留22a9500祖先所有集成。插件额外修正ffmpeg-state横幅查询携带当前session，避免误读管理进程工具目录；先红后绿。

## DD残留锁复验

1. 只从候选详情Update from file升级trial.4，记录原包/receipt hash、版本、SOURCE及Disabled状态；旧montclip不动。
2. 保留根锁原件，读取其pid及进程是否存在；不删除、不按时间戳推断死亡。仅启用候选并打开原验收任务，status与实页核对ready；记录根锁是否已自动变为本次router PID。若DATA_DIR_IN_USE则保留错误与锁字节，不夺活锁。
3. 用合成空项目正常关闭，再记录候选各PID、根/任务锁；正式停用如果留下dead-owner锁，另一次启用应自动恢复。PID复用为活进程时预期拒绝，不能为了通过而杀该进程。
4. 第二任务必须实页/state/项目均验证，ack不计通过。启动中关闭/失败清理、跨任务工程不变及完整Video操作仍待做；以上机器回归不能替代。

## FFmpeg正式路径（未下载/安装）

推荐在**候选专用任务**点外层插件横幅“下载并安装”，或调用该候选实例的`montclip_candidate_install_ffmpeg`。必须携带任务上下文，无任务返回TASK_REQUIRED，另一任务安装中返回INSTALL_BUSY。Cindy下载服务校验archive size/SHA，候选再检查并暂存解包，验证ffmpeg/ffprobe/LICENSE后原子放入本任务runtime目录，只重启该任务engine。

- 版本：n9.0.2-42-gd7643a0fe3；许可证LGPL-3.0-or-later。
- 来源：[MontClip固定FFmpeg release](https://github.com/good-night-oppie/MontClip/releases/tag/ffmpeg-lgpl-n9.0.2-montclip1)，对应FFmpeg源d7643a0fe3；构建来源见包内desktop/ffmpeg-manifest.json。
- linux-x64归档134885400字节，SHA256 `69a9690a4c0eb7e7059f2141de54b4ec57100741a95a04809734c6adc9a0b8ae`。本轮只读GitHub release metadata与manifest一致，没有下载。
- 安装范围：`~/MontClip-Cindy-Candidate/tasks/<session SHA256>/runtime/ffmpeg/linux-x64/`；不是全局/usr/bin，也不是旧MontClip-Cindy。下载宿主缓存与任务安装目录区分。
- 安装验证要求-L输出LGPL、拒绝--enable-gpl/--enable-nonfree；保留LICENSE及来源/文件hash。没有把系统5.1.9当可用工具，其低于门槛6.0。

另一已有路径是引擎工具卡选择/填写本机FFmpeg完整路径（server /api/ffmpeg/choose经现有UI），同目录应有ffprobe，版本及所需选项通过检测，配置只存本任务config/ffmpeg.json。它不是插件包归档导入，也不自动赋予第三方二进制LGPL来源；没有已核验6.0+工具就走固定下载，不改全局安装。本轮未实际操作该UI，不声称成功。

DD下载前记录当前任务DATA、来源/版本及确认界面；完成后核下载回执hash、status下载状态、实际工具-version/-L及安装路径，等待本任务页面重连，再做合成MP4导出播放。另一任务与旧实例应保持未变。失败保存errorCode，不转用系统旧工具或未知下载源。

## 仍缺

真实Linux固定工具下载/安装及导出、双任务隔离、启动中关闭/失败清理、Video全流程未验。HEVC仅已有Windows合成覆盖；旧pan不迁移、歌词七文件未集成、旧FLV直接入轨timeout不在本轮范围。源码未精确匹配宿主及既往实现接触限制继续保留；本轮无asar/REA阅读。包完成不是替换许可。
