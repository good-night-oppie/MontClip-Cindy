# PR154两键定稿移植（源码已完成，未打包）

输入主仓a4134cc5484c41c18d054ddd031b5a603544b2cc；对3bf4f508仅两键四句/注释、两个关联测试及证据文档。未整头合入。
候选引擎提交e27e72634d9723eaf9d9697b9264a8474733750b，基于trial.11 d563ed80，新增仅ui-preferences.js与test/bgremove-copy.test.js、test/bgremove-consent.test.js。完整两键已按NEXT-PR154-FINAL-COPY.md的JJ输入逐字移植；其余文案不变（包括#175 limit参数化）。原作者测试原样复制，证据文档不作为产品依赖。

验证：
- 移植原作者锁句测试到旧候选：2项中1过1失败；应用两键后，assets/consent/copy/font受影响28/28通过。
- 含新页面再次请求同意/9资源加载、失败后仅显式重试的合成回归；不是宿主恢复/真实CDN/真实模型证明。
- git diff d563ed80 -- app.js bgremove-assets.js index.html LICENSES.md licenses/mediapipe 无差异；加载器清单/hash、安全调用8段、加载顺序及许可未改。仅文案模块两个key的四句话和定稿注释变化。
- 插件完整npm test结果见本轮交接；不重跑无关媒体，不下载模型。

当前门禁：本轮直接读回a4134cc5 CI6/6绿、REVIEW_REQUIRED；旧3bf4f508的QQ review状态DISMISSED，不能当新head批准。QQ对旧trial.11原包的限定评论仍只绑定旧包，不被改写也不扩展到新源码。
PR13同时含独立未审入口e77c970及JJ三组草稿。此轮不从当前工作树打混合包、不升级版本、不Forge，先供文案增量及入口分别审查。未审入口不得混入下一候选；若要独立出文案包，须从trial.11已审运行基线选择最小增量，并明确SOURCE/分支，不拿当前混合工作树冒充。
trial.11原包保留dist/preserved-trial11和原交付路径及Europa candidates/4ea2200，SHA256 c12c07753bfc5371b56bd2db06dae8b124b855880839c3a643037d63e531e8e2，不覆盖。
GUI中英切换/截断、实际模型、宿主恢复及Video完整流程未验。不安装启用替换合并。两键定稿不宣称其余同意框所有文字已定稿。

插件 npm test 112/112 通过；build只是未打包测试产物，旧原包已恢复原交付路径。
