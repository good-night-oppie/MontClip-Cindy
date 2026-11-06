# trial.6：复制诊断的最小隐私增量

依据[QQ绑定trial.5的完整预审](https://github.com/good-night-oppie/MontClip-Cindy/pull/13#pullrequestreview-5796354098)。本轮仅改插件problem-details.js诊断输出，engine仍为ab90da01b0af66b8fee1cbc25bf6298e1ca600c8。未读asar/逆向材料，未访问安装实例、旧工程或真实凭据；DD/Video暂停状态不变。QQ的候选实窗技术范围判断不是安装授权。

## 隐私修复与先红后绿

copyLine与logLine共用输出：固定来源标记、时间、明确集合中的错误码、既有固定句子。未知code统一UNKNOWN；不读取error或任意metadata，不以增加秘密格式正则作为安全保证。这样保留时间/错误类别供关联日志，但主动放弃原始错误摘要。legacy scrub仍导出供兼容，不再参与复制或日志输出，不声称它成为全面安全过滤器。

test/copy-line-privacy.test.cjs共12项，旧实现12失败，新实现12通过：
- 假X-MontClip-Session、JSON api_key、token冒号、Authorization Basic、ghp_/gho_/github_pat_、假邮箱、任意路径和未分类文本，输出均精确等于固定模板。
- code路径、换行、非字符串以及看似合法全大写秘密都映射UNKNOWN。
- error getter故意抛错仍不被访问；任意超长metadata不进入输出。

没有使用真人/真实token。新代码集合是维护边界：新增错误码须显式加入，不自动接受格式相似的任意字符串。现有按钮和界面句子未改，不代JJ定稿。

## 非阻塞项复核

1. 已下载FFmpeg刷新失败：main.js installFfmpeg的refresh确在内层try外，但工具调用由onHostMessage顶层catch转成失败tool-result；页面由channel.onmessage catch返回error/code，frame实际点击handler转成progress(failed)，使用现有通用失败/重试/复制界面。test/trial6-control-flow.test.cjs直接执行这些实际函数，验证两条路径都不漏拒绝，工具保留FFMPEG_REFRESH_FAILED，失败后installing释放且可再次成功。无需改运行实现；不是新增真实宿主验证。
2. 损坏根锁：writer-lock拒绝的message是Writer lock ownership cannot be verified，不含Another MontClip；engineError不会将它误翻为另一个窗口正在用，而是保留英文技术信息和目录，frame因DATA_DIR_IN_USE走特殊显示。现状仍缺面向用户的定稿。引擎子进程已去raw时则显示通用失败；不可混同两种错误来源。

给JJ的候选句（未实施、未定稿）：
“暂时无法确认这些项目是否正在被其他窗口使用，MontClip 已暂停打开。请保留当前状态，联系支持人员检查。”
不指示手删锁、夺锁、重启或循环启停。当前特殊锁提示也没有复制按钮，不用尚不存在的按钮作恢复步骤。文案与准确恢复动作由JJ定稿。

## 验证范围

npm run test:trial6：构建及24/24定向测试（复制12、真实调用控制流3、既有迁移安全5、下载重试4）。未重复引擎、媒体、真实桌面或未变化的完整隔离链。trial.5此前71/71及引擎34/34仅作为相同未变源码的历史证据，不能称本包又跑了全套。

原失败日志trial6-copy-before.log、通过日志trial6-copy-after.log及trial6-targeted.log保留本地/候选共享目录；trial.5原包保留dist/preserved-trial5及Europa原29a4c8f目录，不重写旧证据。

最终提交后仅从dist/montclip走Forge，SOURCE必须clean/head/pin一致；包哈希、路径及与trial.5文件差异清单见同目录receipt和PR13最新正文。新包不是旧原包。

## 交接门禁

先请QQ仅复核本次code白名单/不读取raw的增量，再等JJ定稿。当前不安装、不启用、不替换、不交主播。若后续另获授权，唯一正式升级入口是候选详情⋮→Update from file，目标_ns__local__montclip-candidate；入口montclip_candidate_open_task_view→montclip_candidate_status核版本、SOURCE、session、DATA及实际页面，不能用ack当页面通过。

trial.5的其他限制全部保留：真实Linux工具/导出、双任务页面和启动失败清理、Video完整流程未验；preview.4歌词七文件不含，mono旧pan不迁移，HEVC仅Windows合成，旧FLV直接落轨timeout保留。不是角色批准或替换建议。
