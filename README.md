# Tauri WebApp Wrapper

一个极简的 Tauri Web 应用壳：把任意 URL 打包成桌面 App。

**核心特点**
- 单配置文件：`app.config.json`
- 窗口默认隐藏，远程页面加载完成后显示（避免白屏闪烁）
- 极简 macOS 菜单栏仅保留应用名菜单（含“关于/退出”）

## 配置
编辑 `app.config.json`，重启应用生效：

- `name` 应用名（窗口标题 + 菜单栏 + 包名显示）
- `url` 目标网址
- `author` 作者/发布者
- `version` 版本号
- `icon` 图标路径（相对项目根目录）
- `identifier` 包名
- `window.width` / `window.height` 初始窗口尺寸
- `window.visible` 是否启动就显示（默认 `false`）

示例：

```json
{
  "name": "示例应用",
  "url": "https://example.com",
  "author": "dfvips",
  "version": "1.0.0",
  "icon": "assets/app-icon.png",
  "identifier": "com.example.app",
  "window": {
    "width": 1280,
    "height": 720,
    "visible": false
  }
}
```

## 运行

```bash
npm install
npm run tauri dev
```

## 构建

```bash
npm run build
```

注意：如果目标站点禁止抓取（反爬/CSP）, 可能白屏
