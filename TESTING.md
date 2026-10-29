> 本文是 0.1.x 开发期的验证记录，版本编号对应首次公开发布的 1.0.0。文中"本机""实际项目"均指作者的开发机，路径已做简化。

# 2026-10-19 续接验证

## 0.1.5 缓存修复（后续验证）

- 用户报告安装 0.1.4 后空白仍为 I 型。确认启用版本为 0.1.4，已安装 XPI 的 JavaScript 与源码逐字节一致。
- 在用户当前 PDF 的真实阅读器中注入悬停事件，16 个采样点中，大空白位置出现源码预期为 false、实际光标为 text 且原生手型未激活的差异。
- 使用同一已安装 XPI URI，分别默认加载和 `loadSubScriptWithOptions(..., {ignoreCache:true})` 加载内部脚本。对 iframe 坐标 (430,140) 的同一空白位置，得到 `cached:true, uncached:false, sameFunction:false`。确认脚本缓存仍在执行旧版本判定。
- 0.1.5 的 bootstrap 对内部脚本强制跳过缓存；文字区域及选字实现不变。
- 新增入口缓存回归测试，与现有 18 项回归一并运行。此次未自动安装 0.1.5 或修改日常文库。

以下为 0.1.3 的历史记录。

## 现场

- 实际项目：作者本机的 zotero_smart_hand 目录；不是旧回复中的 zotero 子目录。
- 当前 manifest 版本：0.1.3。已有 0.1.0–0.1.3 安装包，全部保留。
- 本轮没有修改产品 JavaScript、manifest 或重建安装包；保留现场跨沙箱修复和整页文字块识别行为。
- 0.1.3 XPI 三个文件与源文件逐字节一致。
- XPI SHA256：01434a6da6cc29dd5929102e8e400069897ec1c8dcddbd1126832c600866b52f。

## 已完成

`node --test tests/smart-hand.test.cjs`：15 项通过，0 跳过。

独立验证工程在单独的 validation 目录中，未访问日常文库。
运行 `node scripts/prepare.cjs` 准备配置，使用 Zotero 的 `-headless -no-remote -profile` 启动 `.test-profile`。
验证脚本为 `tests/harness/bootstrap.js`；结果为 `.test-results/integration.json`。

Zotero 10.0.6 的 9 项集成检查全部通过：

1. 从现有 XPI 安装并启用 0.1.3。
2. 悬停文字时，原生拖拽激活类已移除，光标属性为 text。
3. 注入 mousedown/mousemove/mouseup 后，原生文字范围包含 `ectable`。
4. 双击选中 `Selectable`。
5. 悬停空白恢复原生手型激活类。
6. 空白拖动产生原生 GrabToPan 遮罩，scrollTop 从 18 变为 58（40 px）。
7. 松开移除原生遮罩。
8. 切换指针工具后清除插件光标覆盖。
9. 在文字上悬停后禁用插件，恢复原生手型并清除光标覆盖。

首次运行因测试脚本使用正斜杠路径，被 Zotero.File.pathToFile 拒绝；修正测试脚本路径后重跑通过。这不是插件运行故障。

## 尚未确认

- 无头测试以 windowUtils 注入鼠标事件，不代表物理鼠标启动延迟或绘制帧率。
- 滚动条拖动/点击在当前版本仅有模拟测试，尚未做真实原生滚动条集成验证。
- 分屏、旋转页、复杂 PDF、与第三方插件共存需要进一步验证。
- 当前整页外接矩形内的栏间/段间空白也选字。保留现场行为，未擅自改回逐行或逐字命中。

## 同类插件检索

检查 GitHub 仓库搜索和 Zotero 中文社区插件目录，未找到明确描述相同自动悬停切换行为的成品；不代表绝对不存在。

- https://github.com/qiwei-ma/zotero-pdf-setHorizontal ：作者说明支持自动开启手型以及视图默认设置，未说明文字悬停自动转选字；未安装，未验证 Zotero 10 兼容性。
- https://github.com/qifu04/zotero-pdf-hand-catcher ：实际为辅助下载 PDF 的插件，排除。
- https://github.com/zotero-chinese/zotero-plugins/blob/main/src/plugins.ts ：中文社区插件目录来源，包含 Set HorizontalScroll。
- https://forums.zotero.org/discussion/112258/hand-tool-request ：原生手型需求讨论，不是同类插件。

下次继续应以这里记录的 0.1.3 和实际文件为准，不覆盖已有改动，不把无头测试通过当作流畅度问题已解决。
