# 找我呀 - 本地智能文件内容搜索系统

<div align="center">
  <img src="public/app.png" alt="找我呀 Logo" width="150">
</div>

## 项目概述

"找我呀"是一款基于语义搜索的本地文件内容检索工具，能够帮助用户快速找到存储在本地计算机上的文件内容。通过自然语言理解技术，用户可以使用日常语言描述需求，系统会智能匹配相关文档内容。

## 主要特性

- **语义理解搜索**：支持自然语言查询，理解用户意图
- **多格式支持**：支持PDF、Word、Excel、PowerPoint、文本等多种文件格式
- **自动索引更新**：监控文件变化，自动更新索引
- **本地隐私保护**：所有处理均在本地进行，保护用户数据隐私
- **跨平台兼容**：支持Windows、macOS和Linux
- **系统托盘支持**：关闭窗口后继续在后台运行
- **轻量级安装**：首次运行时动态下载环境，安装包体积小
- **一键清理索引**：支持一键清理所有索引数据，方便处理存量或错误数据
- **索引进度详情**：提供详细的索引统计信息，包括成功、失败和跳过的文件数量
- **优化的文件处理**：支持处理最大100MB的文件，大幅提升文档覆盖范围
- **分批向量化处理**：智能分批处理文本块，避免API限制错误

## 安装与使用

请参考[使用说明文档](readme/使用说明.md)获取详细的安装和使用指南。

## 配置通义千问API密钥

在使用本项目前，你需要配置通义千问API密钥：

1. 注册[通义千问平台](https://dashscope.aliyun.com/)账号并获取API密钥
2. 打开 `python/api.py` 文件
3. 找到以下代码行并替换为你的API密钥：
   ```python
   # 请替换成你自己的通义千问API密钥
   DASHSCOPE_API_KEY = "your_api_key_here"
   ```

**注意：** 没有配置正确的API密钥将无法使用本应用的语义搜索功能。

## 配置服务空间（可选）

如果需要使用用户数据统计、反馈等功能，需配置阿里云服务空间：

1. 打开 `electron/main.js` 文件
2. 找到EMAS_CONFIG部分，替换以下内容：
   ```javascript
   const EMAS_CONFIG = {
     spaceId: 'YOUR_SPACE_ID',  // 服务空间标识 - 请替换为你自己的服务空间ID
     serverSecret: 'YOUR_SERVER_SECRET_KEY',   // 服务空间secret key - 请替换为你自己的密钥
     endpoint: 'https://api.next.bspapp.com'      // 服务空间地址
   };
   ```

**注意：** 不配置服务空间不会影响核心搜索功能，但反馈、统计等功能将无法使用。

## 技术架构

"找我呀"基于以下技术栈构建：

- **前端**：React + Material-UI + Electron
- **后端**：Python + FastAPI + LangChain
- **向量存储**：FAISS
- **向量嵌入**：通义千问Embedding API

完整的技术架构文档请参阅[需求架构文档](readme/需求架构.md)。

## 依赖管理

本应用使用Python作为后端处理引擎，并依赖多个Python库来实现其功能。依赖分为几类：

### 核心依赖

这些依赖是应用程序正常运行所必需的：

- **API服务**：fastapi, uvicorn - 提供Web API服务
- **系统工具**：watchdog, httpx, orjson - 提供文件监控和基础功能
- **AI服务**：dashscope - 提供通义千问AI嵌入和检索服务
- **向量数据库**：faiss-cpu - 提供高效向量检索功能

### 文档处理依赖

这些依赖用于处理不同类型的文档：

- **文档解析**：python-docx, python-pptx, pandas, openpyxl - 处理Office文档
- **PDF处理**：PyPDF2, PyMuPDF, pdfminer.six - 处理PDF文档
- **图像处理**：Pillow, pytesseract - 处理图像和OCR功能

### 依赖管理机制

应用实现了智能依赖管理：

1. **启动时依赖检查**：应用启动时会检查核心依赖是否安装
2. **运行时依赖检测**：在运行过程中检测是否缺少依赖，并提供安装选项
3. **分类安装**：区分核心依赖和文档处理依赖，允许用户选择性安装
4. **自动镜像选择**：自动使用国内镜像加速依赖安装
5. **强制核心依赖安装**：核心依赖使用专用安装窗口强制安装，不允许取消，确保应用基本功能可用
6. **实时安装反馈**：在安装过程中显示详细的进度和日志信息

### 开发环境

如果您是开发者，可以通过以下命令安装所有依赖：

```bash
cd ~/.findmeapp/python/bin
./pip install -r /path/to/requirements.txt
```

或者直接使用：

```bash
python -m pip install -r requirements.txt
```

应用会在~/.findmeapp/python目录下维护自己的Python环境，而不是使用系统Python。

## 开发者指南

### 环境配置

1. 安装Node.js (>= 18.0.0)
2. 安装Python (>= 3.10)
3. 克隆仓库
   ```bash
   git clone https://github.com/yourusername/findme.git
   cd findme
   ```
4. 安装依赖
   ```bash
   npm install
   pip install -r requirements.txt
   ```

### 开发运行

```bash
# 开发模式运行
npm run dev

# 仅运行React开发服务器
npm run dev:react

# 仅运行Electron
npm run dev:electron
```

### 打包构建

```bash
# 构建Windows版本
npm run package-win

# 构建macOS版本
npm run package-mac

# 构建Linux版本
npm run package-linux
```

## 项目结构

```
findme/
├── electron/           # Electron主进程代码
├── cloud-functions/    # 阿里云函数
├── src/                # React前端代码
├── python/             # Python后端代码
├── public/             # 静态资源
├── readme/             # 文档
├── requirements.txt    # Python依赖
└── package.json        # Node.js依赖和脚本
```

## 最新更新

### 2025年4月更新

- **索引管理改进**：添加一键清理所有索引数据功能
- **索引进度优化**：显示详细的文件处理统计信息（成功/失败/跳过）
- **文件大小限制提升**：文件大小限制从10MB提升至100MB
- **向量化处理优化**：实现分批文本块处理，解决API限制错误
- **文本分块调整**：优化文本分块大小，提高处理效率和准确性

## 贡献

欢迎贡献代码、报告问题或提出功能建议！请遵循以下步骤：

1. Fork项目
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 提交Pull Request


## 联系方式

如有问题或建议，请联系：support@example.com 
