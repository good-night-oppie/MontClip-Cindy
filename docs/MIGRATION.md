# 独立仓库迁移

源仓库：good-night-oppie/MontClip。
源提交：5b312e634ad092b253577f390de98d9c30824fb6。
原路径：plugins/montclip-cindy/。

通过 git subtree split 提取该目录的提交历史，保留原作者、提交说明与归属。提取后的提交 SHA 会变化，原仓库与原 PR 不改写。

独立仓库新增固定版本的 engine 子模块、构建暂存目录 dist/montclip、跨平台构建冒烟测试和 CI。插件 id、数据位置、权限以及功能基线保持不变；未把 Europa 的本地 Linux 预览补丁当作已合并修复。

后续插件新增修改在此仓库提交；引擎共享修改在 MontClip 提交，再更新本仓库的固定版本。旧 PR 的剩余修复应引用旧评审并明确迁入此仓库，不能仅因建仓而关闭旧问题。
