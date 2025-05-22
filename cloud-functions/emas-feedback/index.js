/**
 * 阿里云EMAS云函数 - 用户意见反馈
 * 
 * 此函数用于接收用户的意见反馈并存储到数据库中
 */

const moment = require('moment');

/**
 * 处理用户意见反馈
 * @param ctx 云函数上下文，包含请求参数和MPServerless实例
 */
module.exports = async (ctx) => {
  try {
    // 从ctx.args获取客户端传递的参数
    const { 
      email,            // 用户联系邮箱
      content,          // 反馈内容
      userId,           // 用户ID或设备ID（可选）
      appVersion,       // 应用版本号
      osType,           // 操作系统类型
      osVersion,        // 操作系统版本
      timestamp = Date.now() // 时间戳
    } = ctx.args;
    
    // 验证必填参数
    if (!content) {
      return {
        success: false,
        message: '反馈内容不能为空'
      };
    }
    
    // 生成日期相关键值
    const date = moment(timestamp);
    const dayKey = date.format('YYYY-MM-DD');
    
    // 构建记录数据
    const feedbackData = {
      email: email || '',
      content: content,
      userId: userId || 'anonymous',
      appVersion: appVersion || 'unknown',
      osType: osType || 'unknown',
      osVersion: osVersion || 'unknown',
      timestamp: timestamp,
      date: dayKey,
      status: 'new', // 状态：新提交的反馈
      createdAt: new Date()
    };
    
    // 使用ctx.mpserverless访问数据库
    await ctx.mpserverless.db.collection('findme_user_feedback').insertOne(feedbackData);
    
    return {
      success: true,
      message: '反馈提交成功，感谢您的宝贵意见！'
    };
  } catch (error) {
    console.error('处理反馈错误:', error);
    return {
      success: false,
      message: '反馈提交失败，请稍后再试',
      error: error.message
    };
  }
}; 