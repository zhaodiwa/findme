/**
 * 阿里云EMAS云函数 - 用户数据分析（简化版）
 * 
 * 此函数用于从数据库中获取指定日期的用户数据
 * 并将IP转换为地域信息，其他统计工作由前端完成
 */

const moment = require('moment');
const geoip = require('geoip-lite'); // 用于IP转地域

/**
 * 用户数据分析处理函数
 * @param ctx 云函数上下文，包含请求参数和MPServerless实例
 */
module.exports = async (ctx) => {
  try {
    // 不要序列化整个ctx对象，它包含循环引用
    console.log('接收到请求');
    
    // 安全地记录args部分，避免序列化整个ctx
    if (ctx.args) {
      // 只记录简单参数，避免循环引用
      const { body, httpMethod, path } = ctx.args;
      console.log('请求方法:', httpMethod);
      console.log('请求路径:', path);
      console.log('请求体:', body);
    }
    
    // 从HTTP请求的body中解析JSON参数
    let params = {};
    if (ctx.args && ctx.args.body) {
      try {
        // body可能是JSON字符串，需要解析
        params = typeof ctx.args.body === 'string' 
          ? JSON.parse(ctx.args.body) 
          : ctx.args.body;
      } catch (e) {
        console.error('解析请求体失败:', e.message);
        return {
          success: false,
          message: '解析请求参数失败',
          error: '请求格式不正确'
        };
      }
    } else if (ctx.args) {
      // 兼容直接传参方式，但不复制整个ctx.args，只提取所需参数
      const { startDate, dateType, endDate } = ctx.args;
      if (startDate) params.startDate = startDate;
      if (dateType) params.dateType = dateType;
      if (endDate) params.endDate = endDate;
    }
    
    console.log('解析后的参数:', JSON.stringify(params));
    
    // 获取参数
    const { 
      startDate,        // 日期参数：YYYY-MM-DD或YYYY-MM
      dateType = 'day', // 日期类型：day或month，默认day
      limit = 1000      // 最大返回记录数，默认1000条
    } = params;
    
    // 参数检查
    if (!startDate) {
      console.log('缺少日期参数');
    return {
      success: false,
        message: '缺少日期参数',
        error: '请提供日期参数'
      };
    }
    
    console.log(`查询参数: startDate=${startDate}, dateType=${dateType}, limit=${limit}`);
    
    // 构建查询条件 (优化版本)
    let query = {};
    
    // 根据日期类型构建精确的查询条件
    if (dateType === 'day') {
      query = { day: { $eq: startDate } };
      console.log(`按日查询: ${startDate}`);
    } else if (dateType === 'month') {
      query = { month: { $eq: startDate } };
      console.log(`按月查询: ${startDate}`);
    } else {
  return {
        success: false,
        message: '日期类型无效',
        error: '请使用 day 或 month'
      };
    }
    
    console.log('查询条件:', JSON.stringify(query));
    
    // 获取数据库集合并执行查询
    const result = await ctx.mpserverless.db.collection('findme_user_statistics').find(
      query,
      {
        sort: { timestamp: -1 }, // 按时间戳降序排序
        limit: parseInt(limit)   // 限制返回记录数量
      }
    );
    
    // 从查询结果中获取记录数组
    const records = result.result || [];
    console.log(`查询到 ${records.length} 条记录`);
    
    // 处理地理位置信息
    const processedRecords = [];
  for (const record of records) {
      try {
        // 如果记录中有IP地址，尝试解析地域信息
        if (record && record.ip) {
          const geo = geoip.lookup(record.ip);
      if (geo) {
            record.geoInfo = {
          country: geo.country || 'unknown',
          region: geo.region || 'unknown',
          city: geo.city || 'unknown',
          ll: geo.ll || [0, 0],
              timezone: geo.timezone
            };
          }
        }
        processedRecords.push(record);
      } catch (e) {
        console.error('处理记录错误:', e.message);
        // 出错的记录仍然添加到结果中，只是没有geoInfo
        processedRecords.push(record);
      }
    }
    
    // 返回结果
    const response = {
      success: true,
      data: processedRecords,
      totalCount: records.length,
      hasMore: records.length >= limit
    };
    
    console.log('请求响应状态:', response.success ? 'success' : 'failed');
    return response;
    
  } catch (error) {
    console.error('云函数执行错误:', error.message, error.stack);
  return {
      success: false,
      message: '数据查询失败',
      error: error.message || '未知错误'
    };
  }
}; 