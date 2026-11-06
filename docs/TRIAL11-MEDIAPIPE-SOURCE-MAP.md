# trial.11 MediaPipe批准源码映射

主仓QQ已APPROVED，绑定 3bf4f508717af27b6cdde589302329eda8ab1e18；本轮直接读取GitHub review确认。QQ报告独立jsDelivr 9/9与npm 9/9字节核对，此为其审查证据，本任务未重复下载。

候选0.5.1-trial.11；SOURCE plugin 4ea220074f635bfc0c493ee80dac274a23f9b3cb；engine d563ed80bb7b22a816c41a93dd18862ebd6179a2；dirty=false。原包SHA256 c12c07753bfc5371b56bd2db06dae8b124b855880839c3a643037d63e531e8e2。

| 包内node/app路径 | SHA256 | 核验范围 |
|---|---|---|
| bgremove-assets.js | 830344bd778b200d5b9a8489e15409a79eb0a344f135a44eaf1033969b477bed | 完整文件字节一致 |
| licenses/mediapipe/LICENSE | c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4 | 完整文件字节一致 |
| licenses/mediapipe/README.md | 988547a0a11169e5d06893643de90b16834523ee2770a849d896f924c7629aeb | 完整文件字节一致 |
| LICENSES.md | f76b7f013b7e5ccdc4b6ef05c97c0be48026fc382563b262ca2cbe35eec1e609 | MediaPipe条目原样；整文件仅额外保留既有4行Cindy FFmpeg说明，不宣称整文件等同 |
| app.js | 68110a4dede68c86262cd7973b6b2367bd03e1c15372470645279943098edac8 | ensureBgSeg函数体一致；其他候选修复保留 |
| index.html | 66edf05cb2a1f9b2eb5e02e079196b036eb7d3d402fbe48282c848d4f98b18c5 | 批准新增行一致；整文件含其他候选增量 |
| ui-preferences.js | c235a9d2f5ff88b242ed072bc787c8d4138997a984d44a7833ee9ad2a17527f8 | 批准新增行一致；整文件含其他候选增量 |

固定版本/9项清单/校验实现因加载器完整文件一致而被覆盖。包内运行文件均与候选源码逐字节一致；不宣称整个候选引擎等同主仓head。

trial.10受影响27/27、原包合成浏览器13/13证据保留；trial.11插件103/103及包内文案1/1证据保留。未重复无变化媒体测试。本轮只做ZIP/源码映射，未改包。

剩余：QQ候选MediaPipe移植一致性复核独立绑定上述SOURCE/engine/hash；own.bgremove-assets-failed和同意框其他未定稿句仍待JJ，旧17key矩阵有效；真实模型初始化/推理/效果未验。主仓Approve不批准候选安装、启用、替换或合并。

本次仅文档提交，PR head会高于原包SOURCE；原包仍绑定4ea2200，不重打或冒称绑定新文档head。
