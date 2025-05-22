# 找我呀应用 - 数据统计云函数

这个目录包含用于阿里云EMAS Serverless云函数的代码，用于收集"找我呀"应用的用户使用数据。

## 功能说明

该云函数实现以下功能：

1. 接收客户端上传的使用数据（应用启动信息）
2. 将数据存储到阿里云EMAS Serverless云数据库
3. 保存完整的原始数据，包含日期、地区、操作系统等信息
4. 不进行额外的统计处理，原始数据可用于后续自定义分析

## 部署步骤

### 1. 准备阿里云环境

1. 登录阿里云EMAS管理控制台
2. 创建或选择已有项目
3. 在顶部导航栏选择"平台服务"
4. 在左侧导航栏选择"EMAS Serverless" > "云函数"

### 2. 创建并部署云函数

1. 点击"新建云函数"
2. 输入函数名称：`emas-statistics`（必须与代码文件名一致）
3. 选择运行环境（Node.js版本）
4. 选择函数执行内存（建议256M或更高）
5. 输入描述信息
6. 确认创建后，点击已创建的函数名称进入详情页
7. 在"发布管理"页签，点击"上传js包"或"更新js包"
8. 上传zip格式的代码包（包含index.js和node_modules文件夹）
9. 上传完成后，点击"代码部署"

> **注意**：上传的代码包必须是zip格式，且包含index.js文件，如果引用了第三方包（如moment），代码包里必须包含node_modules目录。

### 3. 准备代码包

1. 将`emas-statistics.js`重命名为`index.js`
2. 安装必要的依赖：
   ```bash
   npm install moment
   ```
3. 将index.js和node_modules目录打包成zip文件

### 4. 创建数据库集合

1. 在EMAS控制台中，选择"EMAS Serverless" > "云数据库"
2. 创建一个名为`findme_user_statistics`的集合，用于存储用户统计数据

### 5. 测试云函数

1. 部署完成后，在云函数详情页点击"代码执行"
2. 在"执行参数"区域输入以下JSON格式测试数据：

```json
{
  "userId": "test_user_123",
  "appVersion": "1.0.0",
  "osType": "darwin",
  "osVersion": "23.6.0",
  "region": "china-east",
  "ip": "192.168.1.1",
  "timestamp": 1688888888888,
  "eventType": "app_launch"
}
```

3. 点击执行，查看执行结果和数据库中的记录

## 客户端集成

在Electron客户端应用中调用云函数的示例代码（已集成在应用中）：

```javascript
// 引入MPServerless模块
const MPServerless = require('@alicloud/mpserverless-sdk');

// 初始化MPServerless对象
const mpServerless = new MPServerless({
  request: axios,  // Electron环境中使用axios进行HTTP请求
}, {
  appId: '你的应用ID',        // 应用标识
  spaceId: '你的服务空间ID',  // 服务空间标识
  clientSecret: '你的密钥',   // 服务空间secret key
  endpoint: '服务空间地址',   // 从EMAS Serverless控制台获取
});

// 调用云函数
mpServerless.function.invoke('emas-statistics', {
  userId: 'device_123456',
  appVersion: '1.0.0',
  osType: 'darwin',
  osVersion: '23.6.0',
  timestamp: Date.now(),
  eventType: 'app_launch'
}).then(res => {
  console.log('统计数据上传成功', res);
}).catch(err => {
  console.error('统计数据上传失败', err);
});
```

应用会在以下情况下上传统计数据：
1. 每天首次启动应用时
2. 跨天使用时

## 数据分析

原始数据存储在EMAS Serverless云数据库的`findme_user_statistics`集合中，可以使用以下方式进行分析：

1. 在EMAS控制台中查询和管理数据
2. 编写其他云函数进行批量数据分析
3. 导出数据到其他分析工具

建议关注的指标：
- 日活/月活用户数（通过day字段聚合）
- 用户地域分布（通过region字段聚合）
- 操作系统类型分布（通过osType字段聚合）
- 应用版本分布（通过appVersion字段聚合）

## 注意事项

- 确保在Electron应用的`main.js`中正确配置EMAS相关参数
- 应用首次启动时会生成并保存设备ID，用于后续识别用户
- 云函数调用需要正确的授权和认证
- 定期查看云函数日志，确保运行正常
- 在EMAS控制台的"云函数">"日志"页面可以查看云函数的执行日志

## 参考文档

详细的云函数使用说明可以参考阿里云官方文档：
[使用云函数](https://help.aliyun.com/document_detail/435813.html) 