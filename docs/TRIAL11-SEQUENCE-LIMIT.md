> 最新依赖：主仓 #154 的 3bf4f508 已由 QQ 正式 APPROVED，本轮直接读回；不再等待主仓QQ。候选仍需独立核移植一致性。JJ未定文案与真实模型运行未销账。见 [trial.11原包源码映射](TRIAL11-MEDIAPIPE-SOURCE-MAP.md)。下文旧状态为当时记录。

# trial.11：序列上限最终文案

来源：主仓 PR175 64ef89f5d3ba37b68d04be7e23ce828b1713d313。仅移植 app.js 的 {aspect,limit:SeqLib.MAX}、ui-preferences.js 的 {limit} 模板和原作者最后一项定向回归（单独 test/trial11-sequence-limit.test.js）。未移植 demo/CHANGELOG 或其他分支功能。

引擎 pin：d563ed80bb7b22a816c41a93dd18862ebd6179a2。trial.10 中句子已为 JJ 最终版但写死64；本次补齐参数化。guard及 SEQUENCE_LIMIT 分类不变，仍在读帧前拒绝。其余文案未改。

64 时逐字输出：
- 中：这个工程已有 64 个序列，暂时不能再新建。请先删除一个不需要的序列，再试。
- 英：This project already has 64 sequences. Remove an unneeded sequence, then try again.

回归先红1/1（替代上限17仍显示64）→定向及竞态6/6通过。覆盖中文/英文和 Seq.MAX/17、真实错误显示分支；原有满序列测试证明sample=0、undo=0。GUI语言切换/截断未验，不冒充实窗通过。

保留 trial.10 全部9资源完整性实现及原包13/13合成浏览器证据；本轮没有重跑无关媒体/模型测试，不把旧结果称trial.11原包全流程。本轮最终包核 SOURCE clean/head/pin、运行文件字节和定向文案回归。

trial.10原包保留dist/preserved-trial10及Europa e5b495d目录。新版本0.5.1-trial.11，Forge仅dist/montclip。QQ新head增量待审；own.bgremove-assets-failed仍待JJ，不能混同本键已定稿。真实Linux/宿主/模型及Video全流程仍未验。未安装、启用、下载、替换、合并。
