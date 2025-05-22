# 找我呀应用 - 意见反馈云函数

这个目录包含用于阿里云EMAS Serverless云函数的代码，用于收集"找我呀"应用的用户意见反馈。

## 功能说明

该云函数实现以下功能：

1. 接收用户提交的意见反馈信息（包含邮箱和内容）
2. 将反馈数据存储到阿里云EMAS Serverless云数据库
3. 记录用户的基本信息（设备ID、应用版本、操作系统等）
4. 提供反馈状态跟踪（标记为新提交的反馈）

## 部署步骤

### 1. 准备阿里云环境

1. 登录阿里云EMAS管理控制台
2. 创建或选择已有项目
3. 在顶部导航栏选择"平台服务"
4. 在左侧导航栏选择"EMAS Serverless" > "云函数"

### 2. 创建并部署云函数

1. 点击"新建云函数"
2. 输入函数名称：`emas-feedback`（必须与代码文件名一致）
3. 选择运行环境（Node.js版本）
4. 选择函数执行内存（建议256M或更高）
5. 输入描述信息
6. 确认创建后，点击已创建的函数名称进入详情页
7. 在"发布管理"页签，点击"上传js包"或"更新js包"
8. 上传zip格式的代码包（包含index.js和node_modules文件夹）
9. 上传完成后，点击"代码部署"

> **注意**：上传的代码包必须是zip格式，且包含index.js文件，如果引用了第三方包（如moment），代码包里必须包含node_modules目录。

### 3. 准备代码包

1. 将`index.js`保留原名
2. 安装必要的依赖：
   ```bash
   npm install moment
   ```
3. 将index.js和node_modules目录打包成zip文件

### 4. 创建数据库集合

1. 在EMAS控制台中，选择"EMAS Serverless" > "云数据库"
2. 创建一个名为`findme_user_feedback`的集合，用于存储用户反馈数据

### 5. 测试云函数

1. 部署完成后，在云函数详情页点击"代码执行"
2. 在"执行参数"区域输入以下JSON格式测试数据：

```json
{
  "email": "test@example.com",
  "content": "这是一条测试反馈信息",
  "userId": "device_test_123",
  "appVersion": "1.0.0",
  "osType": "darwin",
  "osVersion": "23.6.0",
  "timestamp": 1688888888888
}
```

3. 点击执行，查看执行结果和数据库中的记录

## 客户端集成

在Electron客户端应用中已经集成了反馈功能，具体实现如下：

1. 主进程（main.js）中添加了处理反馈提交的函数
2. 渲染进程（React应用）中添加了反馈表单组件
3. 通过IPC通信实现了渲染进程到主进程的调用

## 数据管理

用户反馈存储在EMAS Serverless云数据库的`findme_user_feedback`集合中，可以通过以下方式管理：

1. 在EMAS控制台中查询和管理反馈数据
2. 后期可以开发一个简单的反馈管理面板
3. 导出数据进行离线分析

反馈数据中包含以下关键字段：
- email: 用户联系邮箱
- content: 反馈内容
- userId: 用户/设备ID
- date: 提交日期（YYYY-MM-DD格式）
- status: 反馈状态（'new', 'processing', 'resolved', 'closed'等）
- appVersion: 应用版本
- createdAt: 创建时间

## 参考文档

详细的云函数使用说明可以参考阿里云官方文档：
[使用云函数](https://help.aliyun.com/document_detail/435813.html) 