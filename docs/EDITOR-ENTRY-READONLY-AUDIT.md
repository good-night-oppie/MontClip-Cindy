# 入口缺口只读归因与最小方案

## 同包与审查归属
- trial.10：SOURCE e5b495d824fd299b60323ad40c05d47d31fda985，engine c2fe5ca345ef76572c6f3522f1d0d0f51c16d416，SHA256 4fbb3168f87e2156983f2f29ea06e3829ca3c76d06d8813416978cd341c03e4d。已含MediaPipe移植；#175最终句已有，但写死64且调用只传aspect，未含参数化。
- 后续trial.11：SOURCE 4ea220074f635bfc0c493ee80dac274a23f9b3cb，engine d563ed80bb7b22a816c41a93dd18862ebd6179a2，SHA256 c12c07753bfc5371b56bd2db06dae8b124b855880839c3a643037d63e531e8e2。已最小移植原作者64ef89f5d3ba37b68d04be7e23ce828b1713d313：app.js传limit:SeqLib.MAX、ui-preferences模板{limit}及原作者定向回归。6/6、plugin103/103、原包文案1/1；GUI语言切换/截断未验。
- 主仓#154 3bf4f508已直接读回QQ APPROVED；候选只待移植一致性独立复核。JJ新增失败及其它未定句、真实模型不随批准销账。见TRIAL11-MEDIAPIPE-SOURCE-MAP.md。
- 两份包保留不重打；此文档head不冒充原包SOURCE。导航没有混入MediaPipe审查或产品。

## 当前点击路径
| 入口 | 当前目的页面与行为 |
|---|---|
| 插件panel | ghost.json panel→panel.html→frame.js→/cindy/panel.html，文稿/属性辅助页，不是完整编辑器 |
| 左导航mainView | main-view.html跨任务总览；已有项目按钮“在任务中打开”→广播open-task→main.js cindy.taskView({sessionId,focus:true}) |
| 聊天工具/状态卡 | montclip_candidate_open_task_view或open-editor→cindy.taskView→task-view.html→frame.js→引擎根页面，完整编辑器 |
| 全局panel没有session查询参数 | frame.js boot先wake逻辑页，然后提示并return；不bind、不发editor/start，不自动造项目或连其他任务 |

这是入口分离，不是#11回退。#11 head0dfa868686d1faa78d38ceec5230e6bb8d531221仍在当前历史，根frame.css保留[hidden]{display:none!important}。其测试针对task/panel×明暗遮挡，不能证明插件卡片会导航到任务编辑器。

## 公开能力与版本限制
本轮只读Cindy技能plugin-task-view.md §4.22、plugin-main-view.md §4.20、plugin-panels.md §5以及自身代码，不读asar/REA。
- taskView跟任务；同插件同任务重复打开聚焦已有页签；session参数由宿主供给。
- taskView({peek:true})公开为只查询台前任务，不开页；没有任务HOST_NOT_READY。
- 指定sessionId并focus:true可以从真实用户点击导航，但需最近3秒手势且只能消费一次；focusRequested只是导航投递，不是编辑页ready。
- mainView.open=sidebar只改变全局总览容器，不会自动获得任务身份，也不等于taskView。
- panel是全局贡献项；没有读到“插件卡片点击事件”可供本插件直接接管的公开保证。不能用加载/恢复事件冒充用户点击。
目标现场Cindy 0.1.126与官方sourceCommit/tag未精确匹配的既有限制仍在；当前技能契约不冒充目标版本的已验实现。先由DD给peek/指定session/focusRequested输入输出行为证据，暂不操作已装实例。

## 最小独立增量方案（未实现）
1. 全局panel初始只呈入口，不启动引擎；增加“打开当前任务剪辑器”按钮（新文案需JJ按流程确认）。按钮真实点击→逻辑页peek；没有任务则固定提示回到已有任务，不自动创建任务、项目或默认engine。
2. 有任务时仅调用cindy.taskView({sessionId:peek.sessionId,focus:true})，核返回session和focusRequested；拒绝/缺能力/手势超时不静默兜底到其他任务，也不自动重复消耗手势。
3. 编辑页继续由宿主注入session，沿现有bind/start路径；不把全局panel直接改成共享编辑器。mainView仍保留已有任务选择，不依赖缓存的“上次任务”。
4. 该方案比当前更可发现，但仍需要面板内一次点击；用户要求的“点击插件即直达”若要零额外点击，先证明宿主公开入口能提供可靠任务上下文与用户手势。未有证据前不以auto-boot重定向实现，不改宿主或实装。

## 独立验证边界
- 合成公开契约桩：无任务/未知能力→零bind/start；正确session才open；错误session回执/拒绝/focusRequested缺失不报成功。
- 重复点击/消息重发去重，只打开同任务一页，不多建工程/engine；切任务及延迟响应不能回连旧任务；后台消息不抢焦点。
- 保留#11遮挡负控与实际页面可点击检查；入口文字、明暗、小屏单列，不与MediaPipe测试混算。
- DD另获授权后仅候选实窗：具体按钮→正确任务页→时间线ready/实际版本/实例/session，重复点击复用、无任务不建项目；不以ACK或NO_EDITOR当完整页面验收。
- 本轮未实现/安装/启用/下载/替换，也未占桌面；导航方案不阻塞原包MediaPipe一致性审查。

