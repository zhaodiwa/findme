/**
 * 阿里云EMAS云函数 - 用户数据统计
 * 
 * 此函数用于接收用户的使用数据并存储到数据库中
 * 只存储原始数据，不做额外统计处理
 */

const moment = require('moment');

/**
 * 处理用户统计数据
 * @param ctx 云函数上下文，包含请求参数和MPServerless实例
 */
module.exports = async (ctx) => {
  try {
    // 从ctx.args获取客户端传递的参数
    const { 
      userId,           // 用户ID或设备ID 
      appVersion,       // 应用版本号
      osType,           // 操作系统类型
      osVersion,        // 操作系统版本
      ip,               // 用户IP地址
      timestamp = Date.now(), // 时间戳
      eventType = 'app_launch' // 事件类型：应用启动
    } = ctx.args;
    
    // 生成日期相关键值
    const date = moment(timestamp);
    const dayKey = date.format('YYYY-MM-DD');
    const monthKey = date.format('YYYY-MM');
    const yearKey = date.format('YYYY');
    
    // 构建记录数据
    const recordData = {
      userId: userId || 'anonymous',
      appVersion: appVersion,
      osType: osType,
      osVersion: osVersion,
      ip: ip,
      timestamp: timestamp,
      day: dayKey,
      month: monthKey,
      year: yearKey,
      eventType: eventType,
      createdAt: new Date()
    };
    
    // 使用ctx.mpserverless访问数据库
    await ctx.mpserverless.db.collection('findme_user_statistics').insertOne(recordData);
    
    return {
      success: true,
      message: '数据记录成功'
    };
  } catch (error) {
    console.error('数据处理错误:', error);
    return {
      success: false,
      message: '数据记录失败',
      error: error.message
    };
  }
}; 