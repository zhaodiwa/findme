/**
 * 阿里云EMAS云函数 - 系统公告
 * 
 * 此函数用于获取系统公告信息并返回给客户端
 */

const moment = require('moment');

/**
 * 获取系统公告信息
 * @param ctx 云函数上下文，包含请求参数和MPServerless实例
 */
module.exports = async (ctx) => {
  try {
    // 从ctx.args获取客户端传递的参数
    const { 
      appVersion,       // 应用版本号
      osType,           // 操作系统类型
      timestamp = Date.now() // 时间戳
    } = ctx.args;
    
    // 生成当前日期
    const currentDate = moment(timestamp).format('YYYY-MM-DD');
    
    // 查询条件：查找有效期内、对应平台的公告
    const query = {
      isActive: true, // 只查询激活状态的公告
      startDate: { $lte: currentDate }, // 开始日期小于等于当前日期
      endDate: { $gte: currentDate },   // 结束日期大于等于当前日期
      $or: [
        { targetPlatform: 'all' },     // 适用于所有平台的公告
        { targetPlatform: osType }     // 或特定平台的公告
      ]
    };
    
    // 如果提供了应用版本号，还可以增加版本筛选条件
    if (appVersion) {
      query.$or.push(
        { targetVersion: { $exists: false } }, // 没有指定版本限制的公告
        { targetVersion: appVersion }          // 针对特定版本的公告
      );
    }
    
    // 使用ctx.mpserverless访问数据库，根据阿里云EMAS的正确用法
    // 在同一个对象中传入查询条件、排序和限制条件
    const result = await ctx.mpserverless.db.collection('findme_announcements').find(
      query,
      {
        sort: { priority: -1, createdAt: -1 }, // 按优先级和创建时间倒序排列
        limit: 5 // 限制返回条数
      }
    );
    
    // 根据返回的数据结构获取公告数组
    const announcements = result.result || [];
    
    return {
      success: true,
      data: announcements,
      message: '公告获取成功'
    };
  } catch (error) {
    console.error('获取公告错误:', error);
    return {
      success: false,
      data: [],
      message: '获取公告失败',
      error: error.message
    };
  }
}; 