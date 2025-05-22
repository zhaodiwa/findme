# 系统公告云函数

此云函数用于获取系统公告信息，支持按照平台类型、应用版本等条件进行筛选。

## 功能说明

- 获取当前有效的系统公告信息
- 支持按平台类型筛选（iOS、Android、Web 等）
- 支持按应用版本筛选
- 支持公告优先级排序
- 支持公告有效期设置

## 数据库集合设计

此云函数从 `findme_announcements` 集合中读取数据，集合字段设计如下：

| 字段名 | 类型 | 描述 |
|--------|------|------|
| title | String | 公告标题 |
| content | String | 公告内容 |
| type | String | 公告类型，如 "info", "warning", "error" |
| targetPlatform | String | 目标平台，如 "ios", "android", "web", "all" |
| targetVersion | String | 目标应用版本，不填则对所有版本有效 |
| startDate | String | 开始日期，格式 "YYYY-MM-DD" |
| endDate | String | 结束日期，格式 "YYYY-MM-DD" |
| isActive | Boolean | 是否激活，用于手动控制公告是否显示 |
| priority | Number | 优先级，数字越大优先级越高 |
| createdAt | Date | 创建时间 |
| updatedAt | Date | 更新时间 |

## 接口参数

### 请求参数

| 参数名 | 类型 | 是否必需 | 描述 |
|--------|------|----------|------|
| appVersion | String | 否 | 应用版本号 |
| osType | String | 否 | 操作系统类型，如 "ios", "android", "web" |
| timestamp | Number | 否 | 时间戳，默认为当前时间 |

### 响应参数

| 参数名 | 类型 | 描述 |
|--------|------|------|
| success | Boolean | 请求是否成功 |
| data | Array | 公告信息数组 |
| message | String | 响应消息 |
| error | String | 错误信息（仅在请求失败时返回） |

## 使用示例

### 客户端调用示例

```javascript
// 引入EMAS云函数SDK
const mpserverless = new MPServerless({
  endpoint: '<阿里云EMAS服务端地址>',
  appId: '<应用ID>'
});

// 登录后调用云函数
await mpserverless.function.invoke('emas-announcement', {
  appVersion: '1.0.0',
  osType: 'ios',
  timestamp: Date.now()
})
.then(res => {
  if (res.success) {
    // 处理返回的公告数据
    const announcements = res.data;
    // 在界面上展示公告
    showAnnouncements(announcements);
  } else {
    console.error('获取公告失败:', res.message);
  }
})
.catch(err => {
  console.error('调用云函数出错:', err);
});
```

### 数据库公告添加示例

```javascript
// 在管理后台添加一条公告
db.collection('findme_announcements').insertOne({
  title: '系统升级通知',
  content: '系统将于2023年10月1日进行升级维护，届时服务将暂停使用约30分钟。',
  type: 'info',
  targetPlatform: 'all',
  startDate: '2023-09-28',
  endDate: '2023-10-01',
  isActive: true,
  priority: 10,
  createdAt: new Date(),
  updatedAt: new Date()
});
```

## 部署方法

1. 打包该目录下的所有文件
2. 登录阿里云EMAS控制台
3. 选择"云函数"模块
4. 创建新函数，命名为"emas-announcement"
5. 上传打包后的文件
6. 配置相关环境变量
7. 完成部署

## 常见问题

1. **公告不显示？**
   - 检查公告的 startDate 和 endDate 是否正确设置
   - 检查 isActive 是否为 true
   - 检查 targetPlatform 和 targetVersion 是否匹配客户端

2. **想要设置常驻公告？**
   - 将 endDate 设置为一个较远的未来日期

3. **如何下线公告？**
   - 将公告的 isActive 设置为 false 