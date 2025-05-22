# 用户数据分析云函数

## 功能说明

此云函数用于从数据库中查询和分析用户使用数据，采用简化设计：
- 只从数据库中获取指定日期范围内的原始数据
- 对IP地址进行地域识别，生成地域信息
- 将原始数据返回给前端，由前端进行统计分析

此设计可以减轻云函数压力，将数据处理工作分散到用户浏览器端。

## 接口参数

| 参数名 | 类型 | 必填 | 默认值 | 说明 |
| ----- | ---- | ---- | ----- | ---- |
| startDate | String | 是 | 无 | 查询日期，格式为"YYYY-MM-DD"（日维度）或"YYYY-MM"（月维度） |
| dateType | String | 否 | day | 日期类型，可选值：day（日维度）, month（月维度） |
| limit | Number | 否 | 1000 | 最大返回记录数，默认1000条 |

## 请求示例

```json
{
  "startDate": "2023-10-15",
  "dateType": "day",
  "limit": 500
}
```

## 数据库查询说明

云函数使用MongoDB风格的查询语法，根据dateType参数构建不同的查询条件：

- 当`dateType`为"day"时，使用以下查询：
  ```javascript
  { day: { $eq: "2023-10-15" } }
  ```

- 当`dateType`为"month"时，使用以下查询：
  ```javascript
  { month: { $eq: "2023-10" } }
  ```

这确保了查询能够精确匹配数据库中的记录。查询结果会按时间戳降序排序并限制返回数量。

## 响应结构

成功响应：

```json
{
  "success": true,
  "data": [
    {
      "userId": "user123",
      "timestamp": 1697328000000,
      "day": "2023-10-15",
      "month": "2023-10",
      "year": "2023",
      "osType": "Windows",
      "appVersion": "1.0.0",
      "ip": "203.0.113.1",
      "geoInfo": {
        "country": "CN",
        "region": "BJ",
        "city": "Beijing",
        "ll": [116.3883, 39.9289],
        "timezone": "Asia/Shanghai"
      }
    },
    // ... 更多数据记录
  ],
  "totalCount": 500,
  "hasMore": false
}
```

失败响应：

```json
{
  "success": false,
  "message": "数据查询失败",
  "error": "错误详情"
}
```

## 性能说明

为了保证云函数的性能和响应速度，系统设置了以下限制：

1. 单次请求最多返回1000条记录（可通过limit参数调整）
2. 超过限制的记录会被截断，并通过hasMore字段提示
3. 建议按日查询而非按月查询，以减少数据量

## 数据处理说明

此云函数仅负责数据获取和IP转地域处理，数据的统计工作（如用户数量、趋势、分布等）均在前端JavaScript中完成。
这种设计可以减轻服务器负担，但要求确保前端有足够的处理能力。

## 部署说明

1. 确保已安装依赖：
   ```
   npm install
   ```

2. 测试云函数（本地调试）：
   ```
   npm test
   ```

3. 上传到阿里云函数计算：
   - 登录阿里云控制台
   - 进入函数计算服务
   - 创建或更新函数
   - 上传代码或配置代码托管

## 数据库依赖

此云函数需要访问 `findme_user_statistics` 集合，该集合应包含如下字段：

- userId: 用户标识
- timestamp: 时间戳
- day: 日期字符串（YYYY-MM-DD格式）
- month: 月份字符串（YYYY-MM格式）
- year: 年份字符串（YYYY格式）
- osType: 操作系统类型
- osVersion: 操作系统版本
- appVersion: 应用版本
- ip: 用户IP地址
- eventType: 事件类型 