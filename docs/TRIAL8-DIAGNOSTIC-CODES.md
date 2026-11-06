# trial.8：复制诊断码的有界覆盖

仅扩充problem-details.js的静态CODES集合，不修改时间/固定句/未知码拒绝策略。锁提示沿用trial.7已经实施的JJ定稿；引擎仍6abdba1b65ac0f7dbef4852d5ba30d2d12cb8939。本次不是引擎或媒体功能改动，也不要求JJ重复审同句。

## QQ列出的9项逐一核查

| 码 | 生产点与传递路径 | 决定 |
|---|---|---|
| COPY_FAILED | main.js plainFailure仅在copyFailed且c.code缺失时用于工具结果；copy-problem生成problem时缺码固定为EXPORT_FAILED，不采用该返回值 | 不新增；尚无本插件复制入口可达证据 |
| EXPORT_FAILED | main.js copy-problem事件→shown.problem.code兜底→frame copyButton→copyLine | 新增 |
| UNPACK_FAILED | node/lib.cjs unpackCode→engine-worker解包异常data.code→main安装失败→frame progress的logLine；unpack分支本身copy=false | 新增到copyLine/logLine共用集合，保留真实日志码，不谎称当前有解包复制按钮 |
| TASK_LIMIT | node/worker.cjs engine并发任务上限→JSON-RPC data.code→main bind/editor失败→frame failureText/copyButton | 新增 |
| FOLDER_NOT_ALLOWED | node/lib.cjs openFolder、engine-worker open-folder→main-view ask(open-folder)→FAILED.openFolder/problem→copyButton | 新增 |
| NO_FOLDER | lib交付目标/打开文件夹和main open-folder生产；交付copyFailed卡片的code进入copy-problem，主视图失败也生成problem | 新增 |
| NO_ARCHIVE | lib installFfmpeg缺归档→worker JSON-RPC→main安装失败→frame未知安装错误的复制入口 | 新增 |
| TASK_VIEW_FAILED | main openEditorFailed只传给main自己的logProblem；未传MontClipProblem或复制problem | 不新增；此日志本来就保留固定码，不存在CODES降级 |
| CANDIDATE_CONFIG_REQUIRED | engine-worker顶层throw Error，发生在JSON-RPC处理器之前，只有message，没有同名结构化code | 不新增；启动失败走其他已有结构化失败码，不将原文自动提升为码 |

同一有界扫描还发现NO_PINNED_BYTES：lib installFfmpeg归档尺寸契约检查→同一安装异常/复制路径。它是精确稳定生产码，已补入；正常已固定manifest不应触发，损坏规格的错误出口仍须保留定位码。

## 测试与边界

test/diagnostic-code-coverage.test.cjs：7个确认码的精确输出断言，加1个有界源码覆盖检查。修复前8失败，修复后8通过。与copyLine隐私12项及已下载refresh实际控制流3项合跑23/23。未知码、路径夹带、JSON/令牌/邮箱、动态大写字符串、原始error getter和任意metadata的负控保留。

扫描仅存在测试中：main.js、node/worker.cjs、node/engine-worker.cjs、node/lib.cjs的字面code属性，以及plainFailure/openEditorFailed/copy-problem/unpackCode固定区域；新字面码必须已有精确白名单或显式排除理由，否则失败。不会在运行时扫描、自动放行或用泛化正则接受码。没有扩到引擎所有内部码、OS动态errno或宿主任意错误值；动态表达式不在此静态覆盖保证内。

最终包与trial.7应仅problem-details.js、manifest和SOURCE变化；实际差异、clean head/pin和包SHA由receipt及PR13交接。trial.7原包保留dist/preserved-trial7及Europa原7eff551目录，不重写锁分支红绿证据。

没有安装、启用、下载或替换。DD/Video仍暂停，真实Linux/完整Video等既有未验项不变。QQ只需审本次精确常量及排除依据，不重开锁算法/媒体全链。
