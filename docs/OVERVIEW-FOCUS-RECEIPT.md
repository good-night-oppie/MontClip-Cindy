> 最新：JJ已定稿入口三键，来源 workspace/documents/2026-11-06-PR134-139-PR13文案定稿-JJ.md，由Deja转述、绑定e77c9706。以下旧草稿为历史；当前六句见文末。只替换文字，不改判断语义。入口技术审查仍独立待，不与#154两键混算。

# 总览任务入口回执：独立待审增量

## 公开依据和实际范围
读取Cindy插件技能plugin-task-view.md §4.22：taskView({sessionId,focus:true})需要真实点击；ok/sessionId表示宿主打开请求返回，focusRequested:true只表示导航请求已投递，不保证任务存在、实际前台或编辑器ready。旧宿主可能忽略focus。目标现场0.1.126与公开源码未精确匹配限制保留；本轮没有操作宿主/实装或读取逆向资料，也没有捏造目标宿主返回记录。
缺陷是总览只检查r.ok，对旧宿主未确认聚焦保持沉默。以前并没有明确输出“已显示”成功句；本次补齐状态，不把历史沉默描述成已观察的假成功文本。

## 最小修改
- main.js open-task只接受非空、无首尾空白的string session，拒绝未知上下文（INVALID_REQUEST），不String化对象或落默认台前任务；此路径不node/bind/start。
- 保留现有公开taskView({sessionId,focus:true})，不改宿主；同reqId重发沿原Map去重。
- main-view-model.taskOpenResult：ok必须严格true；匹配sessionId+focusRequested严格true才requested，其余ok回执unconfirmed，失败/异常/无上下文为failed。
- main-view真实项目按钮始终显示固定状态；不输出宿主raw错误、目录或凭据。保留现有“在任务中打开”按钮和任务列表路径。不自动重试导航，不自动创建项目/任务或开第二引擎。
- 现有页面默认中文继续；英文字符串列给JJ，不宣称新增GUI语言切换。旧失败辅助函数其它调用不扩大改动。

## JJ待定稿：精确key与文本


### overview.focus-requested
- 中：已请求切换到这个任务。请查看右侧的 MontClip 剪辑器，时间线出现后再继续。
- 英：A switch to this task was requested. Check the MontClip editor on the right and wait for the timeline before continuing.

### overview.focus-unconfirmed
- 中：Cindy 没有确认切换到这个任务。请从任务列表进入对应任务，再让 AI 打开 MontClip 剪辑器；也可以检查 Cindy 是否有更新。
- 英：Cindy did not confirm a switch to this task. Open the matching task from the task list, then ask the AI to open the MontClip editor. You can also check for Cindy updates.

### overview.open-failed
- 中：这次没能打开任务剪辑器。请从任务列表进入对应任务，再让 AI 打开 MontClip 剪辑器。
- 英：The task editor could not be opened this time. Open the matching task from the task list, then ask the AI to open the MontClip editor.

## 验证及门禁
9项定向：旧源码基线1通过8失败→修复9/9；覆盖missing/false focus、missing/wrong session、明确requested、拒绝及raw隐私、无效context不调host/node、重发不重复调用、host异常。中英分类均覆盖。
首次测试抽取器误选复制按钮callback导致SyntaxError，已修定位到open-task分支，并对HEAD原源码重新做有效红测；该测试工具错误不算产品失败证据。有效日志dist/overview-focus-before-valid.log与overview-focus-after.log。
本轮只提交可审代码及定向测试；不Forge打包、不升级版本、不改引擎pin。trial.11原包备份dist/preserved-trial11，线上共享原包不动。旧trial.11的QQ MediaPipe限定通过不覆盖本增量。JJ三键未定稿、目标宿主真实导航/手势/实窗未验；未来与#154原作者两键补丁协调，未审入口不得悄悄进下一包。
插件 npm test 112/112 通过；测试build仅生成未打包工作产物，不是新候选。原trial.11完整原包已保留并恢复原交付路径，SOURCE仍4ea2200。

## JJ最终入口三键（原样）

### overview.focus-requested
- 中：已请求切换到这个任务。请在 Cindy 里查看 MontClip 剪辑器，等时间线出现后再继续。
- 英：A switch to this task was requested. Check the MontClip editor in Cindy and wait for the timeline before continuing.

### overview.focus-unconfirmed
- 中：Cindy 没有确认切换到这个任务，可能已经切换，也可能没有。请从任务列表进入对应任务，再让 AI 打开 MontClip 剪辑器；也可以检查 Cindy 是否有更新。
- 英：Cindy did not confirm a switch to this task. It may or may not have switched. Open the matching task from the task list, then ask the AI to open the MontClip editor. You can also check for Cindy updates.

### overview.open-failed
- 中：这次打开任务剪辑器的请求没有成功，页面可能没有切换。请从任务列表进入对应任务，再让 AI 打开 MontClip 剪辑器。
- 英：The request to open the task editor did not succeed, so the page may not have switched. Open the matching task from the task list, then ask the AI to open the MontClip editor.

本轮精确锁句旧源码9过3败→12/12通过，保留missing/false/失败及任务不匹配负控。实窗/英文切换/截断/真实导航未验，不承诺更新宿主可解决；不打包、不改版本/engine pin，不覆盖trial11原包。
插件 npm test 115/115 通过；未重新生成候选包。
