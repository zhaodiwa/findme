# FindMe 下载页面

这是 FindMe 应用的静态下载页面，用于提供 Windows、macOS (Intel) 和 macOS (Apple Silicon) 安装包的下载。

## 文件结构

```
download/
├── index.html       # 主页面
├── style.css        # 样式表
├── script.js        # JavaScript 脚本
├── logo.svg         # 应用 Logo
├── downloads/       # 下载文件目录
│   ├── findme-windows-1.0.0.exe      # Windows 安装包
│   ├── findme-mac-intel-1.0.0.dmg    # macOS Intel 安装包
│   └── findme-mac-arm64-1.0.0.dmg    # macOS Apple Silicon 安装包
└── README.md        # 本文件
```

## 如何使用

1. 将实际的安装包放入 `downloads` 目录中，确保文件名与 HTML 和 JS 文件中引用的名称匹配。
2. 如果需要更改版本号，请同时更新 HTML 文件中的版本号显示和 JavaScript 文件中的下载链接。
3. 可以自定义 `style.css` 文件来修改页面外观。
4. 将整个 `download` 目录上传到您的托管服务（如阿里云 OSS）。

## 自定义

### 修改版本号

在 `index.html` 文件中，找到 `.version` 元素并更新版本号：

```html
<div class="version">v1.0.0</div>
```

在 `script.js` 文件中，更新 `downloadLinks` 对象中的文件名：

```javascript
const downloadLinks = {
    windows: 'downloads/findme-windows-1.0.0.exe',
    macIntel: 'downloads/findme-mac-intel-1.0.0.dmg',
    macArm: 'downloads/findme-mac-arm64-1.0.0.dmg'
};
```

### 修改样式

修改 `style.css` 文件以更改页面颜色、布局和其他视觉元素。

### 替换 Logo

替换 `logo.svg` 文件为您自己的 logo。