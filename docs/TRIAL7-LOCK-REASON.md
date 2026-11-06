# trial.7：锁归属无法确认的固定提示

JJ已经定稿，本次按定稿实施，不再等待JJ。文案定稿不是产品审查或安装授权。未操作已安装实例、不启用、不下载、不替换；DD/Video继续暂停。trial.6并未修复原始目录直显，此包是新的引擎和插件增量。

## 精确分支及信息边界

engine/writer-lock.js仅在readLock无法取得对象、PID不是正整数时附加reason=LOCK_OWNER_UNVERIFIED，同时保留code=DATA_DIR_IN_USE和原拒绝行为。引擎提交6abdba1b65ac0f7dbef4852d5ba30d2d12cb8939，pin准确更新。

活owner（含PID复用/EPERM）、确认已退出owner的接管、两轮争用耗尽均不附该reason，不改锁算法、不夺锁、不扩大成所有DATA_DIR_IN_USE。

根router和任务engine-worker仅传递精确code/reason配对；child-channel同样白名单传递并将该类异常message替换为无目录固定文本。main.js按结构化配对映射JJ定稿，frame不为该原因显示“重试”按钮。未识别reason不被提升为该类提示。copyLine仍沿用trial.6受控code/固定诊断，原始错误不进入复制内容。

争用耗尽等旧分支未改，不能将本次结果扩成所有锁错误的隐私审计通过；活锁既有提示及其重试行为保留。

## JJ定稿逐字读回

中：现在没法确认这里的项目是不是正在被其他窗口使用，所以 MontClip 先不打开。请别反复重开，也别删除项目文件；把这段提示发给给你这个包的人，让他们检查。

英：MontClip can't tell whether your projects are being used by another window, so it won't open them right now. Don't keep reopening MontClip or delete any files. Send this message to the person who gave you this package so they can check.

页面当前使用中文，英文通过errorEn保留，与既有语言机制一致；不是新增语言切换功能。定向测试分别精确比较这两个字符串，包括原文“发给给你”。

## 实证与复现

- test/lock-visibility.test.cjs：真实router/engine锁检查→实际main处理→实际frame show(textContent)，独占合成目录。root/task两条路径各测坏JSON、无效PID、活owner；修复前4失败2通过，修复后6/6。核锁文件字节不变、RPC无目录、页面无目录、两种定稿逐字一致、仅新reason不显示重试。没有连接真实Cindy或用户目录。
- node --test test/writer-lock-lifecycle.test.js（engine）：9/9，覆盖正常退出、失败、强停后dead恢复、活PID复用、同进程二次获取、EPERM、坏元数据及争用耗尽不误分类。
- npm run test:trial7：构建和35/35定向测试，包含上述6项、child-channel14项（新增3项code/reason白名单负控）、copyLine12项、既有refresh控制流3项。copyLine12/12沿用trial.6产品实现，未谎称本轮新修。
- 最终Forge原包可解压到独占目录，用MONTCLIP_TEST_PACKAGE指向解包目录，再运行同一lock-visibility测试；准确结果随包receipt/日志交接。

不重跑未受影响媒体矩阵。前后日志trial7-lock-before.log/trial7-lock-after.log，构建后trial7-built-targeted.log，engine结果trial7-engine.log；最终包交接补trial7-package-lock.log和receipt。trial.6原包保留dist/preserved-trial6及原Europa4d20c81目录，不覆盖旧证据。

## 下一步

QQ仅核本次reason传播、原文/目录出口及分支回归；JJ文案已实施，不再写“待JJ定稿”。当前没有安装许可，不安排DD启停。若后续另获许可，只用候选详情Update from file处理_ns__local__montclip-candidate，入口montclip_candidate_open_task_view→montclip_candidate_status核实际版本/SOURCE/session/DATA；不是旧montclip。

其余限制不变：Linux工具与导出、双任务真实页面、启动中关闭/失败清理和Video完整流程未验；preview.4歌词七文件不含、mono旧pan不迁移、HEVC仅Windows合成、旧FLV直接落轨timeout保留。未读asar/逆向材料，不合并发布或建议替换。
