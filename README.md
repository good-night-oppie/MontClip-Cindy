# MontClip for Cindy

MontClip 的 Cindy 插件独立仓库。在 Cindy 任务中打开剪辑器，用对话操作本机录像、时间线、字幕和导出。

**当前为开发预览版，尚未正式发布。** 插件标识仍为 `montclip`，迁仓不改变已有用户的数据目录或配置。

## 构建

需要 Git 和 Node.js 18 或更高版本，无运行时 npm 依赖。

```sh
git clone --recurse-submodules https://github.com/good-night-oppie/MontClip-Cindy.git
cd MontClip-Cindy
npm test
```

构建产物在 `dist/montclip/`。在 Cindy 中使用 `ghost_forge_pack({dir: "<绝对路径>/dist/montclip"})` 打包；明确需要安装时使用 `ghost_forge_install`。不要从仓库根目录打包，否则会带入开发文件。

已有克隆先运行 `git submodule update --init --recursive`。`engine/` 是 [MontClip](https://github.com/good-night-oppie/MontClip) 的固定提交；`engine-lock.json` 记录同一个提交，构建会检查一致性。

## 维护边界

- 此仓库维护插件入口、聊天卡片、任务页、侧栏、Node worker 和打包。
- 剪辑引擎继续在 MontClip 维护；预览与导出使用同一引擎，不另建一套实现。
- 更新引擎时同时更新子模块指针与 `engine-lock.json`，验证后提交 PR。
- Cindy 宿主最低版本以 `ghost.json` 为准；当前为 0.1.122。

## 试用与问题处理

DD 负责 Europa 安装与更新，demo 任务边使用边反馈；JJ 复核产品和用户体验方案；Deja 与 Cindy 实现；QQ 与 Rea 审查、合并。安装试用不代表代码通过审查。

迁仓时尚未完成：长期导出恢复、轮询异常回执、无硬链接文件系统回退，以及 Cindy 内完整操作验收。Europa 的 `0.5.1-preview.1` 包另含 Linux 专用预览修补，不能用此仓库当前基线覆盖它而宣称功能相同。原仓库的 [#115](https://github.com/good-night-oppie/MontClip/pull/115)、[#116](https://github.com/good-night-oppie/MontClip/pull/116)、[#117](https://github.com/good-night-oppie/MontClip/pull/117) 保留已有评审记录，待明确迁移后再关闭。

架构与既有验收清单见 [插件说明](docs/PLUGIN.md)，来源和迁移边界见 [迁移记录](docs/MIGRATION.md)。

## License

MIT，保留 [LICENSE](LICENSE) 中原有版权声明。MontClip 源自 [FableCut](https://github.com/ronak-create/FableCut)；引擎第三方声明保留在子模块中并随所需运行资源构建。
