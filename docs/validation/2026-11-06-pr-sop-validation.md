# PR SOP 提示检查验证

只增加PR元数据检查，保持插件身份、用户数据、engine指针与产品运行时代码不变。不设必过检查，不改别人的PR。

- 共享规则24/24通过；rules、runner、名单、分类、生成器和测试与MontClip及本地督查适配副本六份文件逐字节一致，SHA256见scripts/pr-sop/SHA256SUMS。
- 初始基线ad796bb5d5643371cff80abc82459780ff27d461上的npm test：18/18通过；送审前main更新时以PR正文后续实测和真实CI为准，不冒充新版本已测。
- 已重基到当前main 2d00b522c0e5930e98d6f31e0aa091213a5ff87e；重基后npm test为27/27通过，独立送审规则24/24通过。
- 本地督查适配221/221通过，直接调用同一核心，未写线上脚本/台账/Inbox。
- 真实PR与CI链接见送审正文/交付报告，不预造CI成功。文件分类表另列2026-11-06-pr-sop-classification.md，待Deja确认。
- 没有安装/发布插件或修改规则集；真实GUI/媒体操作、产品发布验收没跑。

例外仅核格式且始终标需要QQ核验，不是机器证明证据无可辩驳。新工作流无checkout、无PR代码导入、无npm安装；token只作GitHub只读API鉴权、不打印。

## 追加范围：阻断检查

主人新要求取代先前提示模式。检查改名sop-pr-lint，移除continue-on-error，补四类标签/审查人事件与issues:read。规则回归27/27通过，含标签添加者、移除重加、正文与标签竞态、退出码回归。原测试数字仅对应原版；未改产品运行代码，沿用上节产品基线证据。未修改规则集、线上督查、台账、Inbox或别人PR。

## 审查人补充验证

按Deja代QQ转交的第5项补充：批准后请求清空仍通过；从未请求且无review失败；旧head有最近review但当前未请求，只给notice不失败。三项回归已加入，共30/30通过；runner实际验证notice分支返回0。两仓与督查候选共享相同规则代码，保留当前head正式批准的独立检查。本轮未改产品运行代码，复用已有产品失败/基线对照；真实CI待当前head运行回执。


## Deja七项修订（2026-11-07）

两仓规则/runner/分类表逐字节一致，见scripts/pr-sop/SHA256SUMS。规则回归37/37；联网扫描回归9/9；合计46/46。扫描固定main全SHA，只读blob不执行。MontClip main 542脚本，排除39份docs/demo副本，扫描503份，80份潜在联网接口均已分类；Cindy main 23脚本，7份潜在接口均已分类。README恢复原始基线；文档改在AGENTS Review handoff及开发流程ADR第5条。

MontClip npm test 1995项：1848通过、15失败、132跳过；15项失败名称与先前同分支干净基线完全一致。Cindy npm test 27/27通过。没跑：真人媒体、人工GUI和音画同步验收，本轮没有修改产品执行路径。实际PR正负控CI及只读缺项审计随送审包附上；本文件不冒称尚未完成的CI通过。


## 标签绑定head增量

按Deja裁决：核验GoodNightOppie加标签执行人、之后未移除、created_at严格晚于当前完整head可靠timeline事件时间。缺可靠时间失败，禁止把Git提交时间/PR updatedAt当进入时间。正文不绑定，摘要提示人工重新核验例外行。GitHub官方committed字段无created_at，当前真实#200/#21无强推记录，不能以提交时间给例外放行。普通无例外PR不受此限制。
真源：https://docs.github.com/en/rest/using-the-rest-api/issue-event-types#committed

标签绑定本轮：规则46/46，联网覆盖9/9，两仓各55/55通过；督查共享适配5/5。全库媒体证据沿用上轮70a40253/444abc9c，不冒称在新head重新执行。只改标签元数据路径，相关增量回归已执行。
