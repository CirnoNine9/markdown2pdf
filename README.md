# Markdown To PDF

Markdown To PDF 是一个 VS Code 扩展，可将本地 Markdown 文档导出为排版精美的 PDF。它支持 MathJax 数学公式、Shiki 代码高亮、表格、图片、适合打印的学术文档主题，以及带自动分页的 4:3 Beamer 幻灯片主题。

## 功能

- 从命令面板导出当前 Markdown 文件。
- 从资源管理器右键菜单导出选中的 `.md` 或 `.markdown` 文件。
- 在编辑器旁实时预览 Markdown，并可从活动栏侧边栏导出。
- 使用本地 MathJax 和 Chromium 渲染复杂数学公式。
- 使用 Shiki 高亮围栏代码块。
- 根据 Markdown 文件所在目录解析相对图片路径。
- 导出带布局感知自动分页的 4:3 Beamer 风格幻灯片。
- 配置文档主题、代码主题、页面格式、页边距、字体、自定义 CSS 和浏览器路径。

## 开发

安装依赖并完成类型检查、测试和构建：

```powershell
npm install
npm run package
```

生成可安装的 VSIX 扩展包：

```powershell
build.bat
```

也可以在 VS Code 中打开本项目并按 `F5`，启动扩展开发宿主进行调试。
