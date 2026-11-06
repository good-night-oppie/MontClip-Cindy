# 历史 trial.8 升级步骤（SOP v2）

> **历史 trial.8 步骤，仅供后续新包复用；当前暂不升级 trial.8。** trial.8 缺少 #154/#172/#175/#176，不是当前推荐升级包。四项修复已进入 **trial.9**，见 [新包集成及验证](TRIAL9-PRODUCT-INTEGRATION.md) 和 [PR13 当前原包交接](https://github.com/good-night-oppie/MontClip-Cindy/pull/13)。下面的 trial.8 路径、hash 和当时状态仅为历史记录，不得直接用于下一次安装。trial.9 也仍需受影响审查及相应安装/启用授权。

**准备完成，尚未获正式安装/启用授权。本清单不执行这些动作。** 当前已装候选 trial.3 保持 Disabled，Video 保留已导入工程与录像，暂停在加入时间线之前。QQ 对 trial.8 的 COMMENTED 增量安全复核已完成，允许独立测试机试用的技术范围，不等于安装或替换授权。

## 唯一原包与目标

- 目标：namespace `local`、instanceId `_ns__local__montclip-candidate`，显示「MontClip 候选试用」，manifest id `montclip-candidate`。
- 版本：`0.5.1-trial.8`。
- 插件 SOURCE：`c8af1bd0dba6d322c444b4316ab2551206f49eda`，dirty=false。
- 引擎：`6abdba1b65ac0f7dbef4852d5ba30d2d12cb8939`。
- 本地原包：`C:/Users/tyb90/orca/projects/MontClip-Cindy/.cindy-worktrees/zealous-kapitsa/.cindy-worktrees/isolated-trial/dist/montclip/montclip-candidate-0.5.1-trial.8.cindy`。
- Europa 原包：`/home/admin/montclip-review/candidates/c8af1bd/montclip-candidate-0.5.1-trial.8.cindy`。
- SHA256：`f7fe5e08e551f15b6febafb217945f9de925242b56c421ae0df9aca34600bb39`。上一覆盖核对已读回两端一致，未改变包；正式操作时 DD 再核所选择文件。
- 文档提交不是新包源码，不改名、不重打包、不把文档 head 填进 SOURCE。

## 需要的实际确认

1. 由主人/有授权的现场操作者明确确认：仅将已安装的候选从 trial.3 更新为上述 trial.8，保留该候选已有数据；不更新旧 `_ns__local__montclip`。QQ 评论及 size gate 上线授权不能代替此确认。
2. DD 使用实际 Cindy 的正式 Update from file 流程；若宿主显示文件、权限或更新确认页，由现场操作者检查目标/版本并确认。此前 UI 不显示完整 hash，因此不要虚构可见 hash 字段：先在共享文件核 hash，保留正式流程能提供的 receipt/inspect 信息；信息不足则明确记未证实，不调用内部 IPC 补绕。
3. 更新不等于启用。须明确候选启用及恢复 Video 试用的授权；未获得时保持 Disabled。若更新后宿主自动改变 Enabled 状态，记录并上报，不把它当作已批准继续使用，不擅自循环启停。
4. 本轮无 FFmpeg 下载授权；正式工具来源/版本和任务安装范围确认前不下载。也没有现用版替换、合并或发布授权。

## 授权后 DD 执行，保护 Video 已有项目

1. 更新前记录当前候选版本、Disabled 状态、原 Video 任务/session、候选 DATA 路径及已导入工程/媒体清单。仅按已确认的候选根保存恢复副本与校验记录，备份保留在内部；不把真人素材放 Git/公开资料。未知项目路径先停止定位，不猜目录；保留现有文件，不清空 DATA/cache，不删除 writer lock，不卸载重装。
2. 打开 **Plugins → MontClip 候选试用详情 → ⋮ → Update from file**，选择上述 Europa 原包。这是已装实例升级，不走首次导入或 install_copy。若目标为旧 montclip、要求删除数据、找不到正式更新入口或版本不符，停止并回传界面事实。
3. 保存正式回执中的目标身份、版本、时间、可提供的 package hash 和 Enabled 状态。旧实例、候选 DATA、Video 原任务及素材应保留；不要因候选版本升级新建替代工程来掩盖数据丢失。未授权启用时到此为止。
4. 获准启用后，在 **原 Video 验收任务**通过候选实例调用 `montclip_candidate_open_task_view`；实际打开「MontClip 候选试用」页面，再调用 `montclip_candidate_status`。核版本 trial.8、SOURCE c8af1bd/6abdba1b、原 session/独立 DATA 和原已导入素材。原任务找不到时停止查明，不创建新 session 声称保留成功。ACK 不等于页面通过，NO_EDITOR 表示页面未加载。
5. 由 Video 从“加入时间线”继续：切点与替换→撤销/恢复→保存并真正关闭重开→导出并实际播放。精确逐项记录见 TRIAL8-PRODUCT-COVERAGE.md。第二任务 status 不改变第一任务活跃工程、启动中关闭/失败清理仍须专门证据；不以旧单任务死 PID 恢复替代。

## 仍缺与停止条件

trial.8 **未含 #172/#175/#176/#154**；#151 字体同意前置已有，但不等于 AI 抠像同意/导出保护。不要开启 AI 抠像或用带 bgRemove 项目试用；不把助手改画幅新能力、最新尾帧修复列为已验。FFmpeg 未就绪前导出为阻塞；系统5.1.9不能代替最低6.0候选工具。HEVC Windows 合成通过不等于 Europa 真实素材通过；mono 仅新导入，旧 pan:-1 不自动迁移。FLV 正常导入/代理链与直接入轨 timeout 分开记录。preview.4 七文件歌词专项未含。

升级/试用失败时保留项目、回执及结构化安全诊断，暂停并交 Deja；不自行卸载、回滚安装目录、删锁、重启旧实例或下载替代工具。Video 完整验收与团队审查后，再由 Deja 给是否替换建议。
