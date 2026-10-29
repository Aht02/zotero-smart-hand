# Zotero Smart Hand · 智能手型

[![Latest release](https://img.shields.io/github/v/release/Aht02/zotero-smart-hand?label=release)](https://github.com/Aht02/zotero-smart-hand/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Zotero 10 PDF 阅读器的原生手型工具增强：开启手型工具后，悬停文字区域自动变成 I 型并可以正常选字，悬停空白区域保留原生拖动。

## 安装

1. 打开 [Releases](https://github.com/Aht02/zotero-smart-hand/releases/latest)，下载最新的 `zotero-smart-hand-1.0.0.xpi`。
2. 在 Zotero 中打开「工具 → 插件」，点右上角的齿轮，选择「从文件安装插件」，选中刚下载的文件。
3. 在阅读器中开启原生手型工具。

**与 [Zotero Blank Drag](https://github.com/Aht02/zotero-blank-drag) 功能重叠，请只启用其中一个**（前者作用于默认选择工具，本插件作用于手型工具）。

安装后插件会通过本仓库的 [`updates.json`](updates.json) 检查更新。

## 使用

- 悬停文字区域：立即停用原生拖拽并显示 I 型；按下使用 Zotero 原生文字选择逻辑选字。
- 按文字行识别区域，只连接相邻行之间的小空白以减少闪烁。首行缩进、段尾、分栏间隙、图片及章节之间的较大无文字空白使用手型。
- 边缘缓冲：进入区域留 2 像素容差，离开时多留 3 像素，减少边缘抖动。
- 悬停空白：恢复原生手型，原始鼠标事件直接交给原生 GrabToPan，不自行计算滚动。
- 滚动条：箭头，保留拖拽和点击交互。手型工具开启时，鼠标位于竖向滚动条一列，普通竖向滚轮每次移动约半个当前阅读视图高度；带 Ctrl/Shift/Alt/Meta 的滚轮保留原行为。
- 手势锁定：从文字开始就持续选字，从空白开始就持续拖动，直到松开。
- 关闭手型工具：插件不改变选择或拖动行为。链接、控件和批注保留原生交互，不强制覆盖光标。

## 实现与限制

只暂停当前阅读视图的原生手型实例，不切换工具栏选项。

文字区域由可见字符 rect（缺失时用 inlineRect）组成，显式行首/行尾空格不扩大区域；结合换行标记和几何间距拆分行及较大横向空隙。仅连接间距不超过较小行高的相邻行，并只连接两行共同覆盖的水平范围，不扩展缩进和短行尾部。按字符数组缓存，拖动过程中不重复计算。

这是文字几何判定，不做图片语义识别；图片上的可选文字或 OCR 文字仍可进入选字区域。

用 `Components.utils.exportFunction` 将动作包装函数导出到阅读器内容沙箱，选字时使用阅读器自带的 `_tools.pointer` 对象，调用结束立即还原工具引用，避免内容沙箱访问插件特权对象。在原生 `getActionAtPosition` 的 `mousedown` 入口补判手势，确保原生监听器先执行时也能开始选字；保留原生拖选、双击选词和选区结束流程。

入口使用 `loadSubScriptWithOptions` 并设置 `ignoreCache: true`，确保同一路径 XPI 升级后执行新代码，不会命中旧缓存。

依赖 Zotero 10 的内部接口，升级后需复测。扫描 PDF 只有具备可选文字层时才能识别文字。

## 从源码构建

```powershell
node --test tests/bootstrap.test.cjs tests/smart-hand.test.cjs
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build.ps1
```

安装包位于 `dist/`，只包含 `manifest.json`、`bootstrap.js` 和 `content/smart-hand.js`。打包脚本会先校验 `id`、`update_url`（必须是 HTTPS 绝对地址）和 `strict_max_version` 三个字段——Zotero 10 缺少它们会直接拒绝安装。

## 测试

本版已在 Zotero 10.0.6 上实机测试：悬停即 I 型、拖选与双击选词、空白处原生拖动、滚动条拖动与点击、切换工具、禁用插件后的清理。

开发期另有两类记录，见 [`TESTING.md`](TESTING.md)：

- Node 测试（19 项），含同一 XPI URI 升级的缓存回归测试；
- 在隔离配置的 Zotero 10.0.6 进程中的无头集成测试（9 项）。

`TESTING.md` 沿用开发期版本编号（0.1.x，对应首次公开发布的 1.0.0）。无头集成测试通过 `windowUtils` 注入鼠标事件，不等于物理鼠标或可见窗口的体验验证。

## 版本

- **1.0.0** —— 首个公开发布版（开发期编号 0.1.7）。补充 Firefox 系统事件组监听、原生滚动条识别及覆盖式滚动条的 16 CSS 像素边缘列兜底。

## 许可证

[MIT](LICENSE)
