# 下一候选：PR154两键定稿输入（待原作者提交）

2026-11-06 直接读取主仓PR154，head仍3bf4f508717af27b6cdde589302329eda8ab1e18；两键最终提交尚未到。按Deja指令不在候选另写实现，不重打trial.11。

## 审查状态
已直接读取QQ评论6681614180：
https://github.com/good-night-oppie/MontClip-Cindy/pull/13#issuecomment-6681614180
trial.11 MediaPipe加载移植一致性限定通过，独立绑定plugin4ea220074f635bfc0c493ee80dac274a23f9b3cb / engine d563ed80bb7b22a816c41a93dd18862ebd6179a2 / 原包SHA256 c12c07753bfc5371b56bd2db06dae8b124b855880839c3a643037d63e531e8e2。不是整个PR批准或安装授权。
QQ亦指出ghost.json由CRLF变为LF；实际原因是本任务trial.11版本编辑使用JSON序列化并写LF，不据此推断宿主或工具版本变化。下一包编辑应保留现有LF，新增最小文案补丁不再转换全文件换行。旧包不修改。

## JJ输入（Deja转述定稿，不是候选已包含）
来源：europa ~/montclip-labels/jj/2026-11-06-PR154-抠像文案定稿-JJ.md，绑定3bf4f508；本轮未宣称已直接读取该文件。

own.bgremove-assets-failed
- 中：AI 抠像没能准备好：下载的文件没有全部通过检查，所以没有启用，画面先保留背景。把 AI 抠像关掉再开一次，可以重试，但不一定成功。
- 英：AI background removal isn't ready: the downloaded files didn't all pass the check, so it wasn't turned on and the background stays for now. Turn AI background removal off and on again to retry; it may still fail.

own.bgremove-net-what
- 中：AI 抠像要用 Google 的 MediaPipe：每次重新打开 MontClip 后第一次用，都要下载它的程序和模型，并先检查文件，全部通过才使用。
- 英：AI background removal uses Google's MediaPipe: each time you reopen MontClip, the first use downloads its program and model, and MontClip checks every file first. It's only used if all of them pass.

仅这两键；title/hosts/sent/no及旧三键不动，不将本次定稿扩展到其它句子。JJ只读代码，未实窗验证重试/截断或运行真实模型。trial.11原包仍含此前文案；定稿收到不等于已入包。

## 接入顺序
原作者最终SHA/最小diff → 核两键及行为依据 → 移植同一独立引擎分支 → 精确中英定向回归和安全文件/hash不变核对 → 与下一包已有工作合并一次build/Forge → 新版本/clean SOURCE/pin/两端hash及限定审查。
不下载资源/模型，不重测无关媒体；不覆盖trial.11，不安装启用替换。

## 本轮可独立入口核查补充
main.js open-task分支已经调用cindy.taskView({sessionId,focus:true})；main-view.js只判r.ok，未判focusRequested。全仓检索未发现peek调用或focusRequested回执校验。因此EDITOR-ENTRY-READONLY-AUDIT提出的peek及导航回执校验目前是待实现方案，不是已验能力。
后续独立增量应对旧宿主忽略focus、缺focusRequested、无任务、切换任务期间回执等做负控；不得用当前返回ok宣称已跳转或剪辑器ready。目标0.1.126公开行为验证仍待，不读逆向产物、不操作实装；文案与MediaPipe审查不包含导航修改。

