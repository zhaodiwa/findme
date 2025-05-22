const http = require('http');
const https = require('https');
const { URL } = require('url');

/**
 * 转发统计分析请求到阿里云函数
 * @param {Object} req 请求对象
 * @param {Object} res 响应对象
 */
exports.handler = async (req, res) => {
  try {
    // 设置CORS头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // 处理预检请求
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }
    
    // 检查请求方法
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end(JSON.stringify({ success: false, message: '仅支持POST请求' }));
      return;
    }
    
    // 读取请求体数据
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    await new Promise((resolve, reject) => {
      req.on('end', resolve);
      req.on('error', reject);
    });
    
    // 解析请求体
    let requestData;
    try {
      requestData = JSON.parse(body);
    } catch (e) {
      res.statusCode = 400;
      res.end(JSON.stringify({ success: false, message: '无效的请求数据格式' }));
      return;
    }
    
    // 构造请求阿里云函数的选项
    const functionUrl = new URL('https://function-service.mp-dynamic-c28e40.koyeb.app/api/v1/emas-analysis');
    
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    };
    
    // 发送请求到阿里云函数
    const cloudFunctionResponse = await new Promise((resolve, reject) => {
      const protocol = functionUrl.protocol === 'https:' ? https : http;
      const proxyReq = protocol.request(functionUrl, options, proxyRes => {
        let responseBody = '';
        proxyRes.on('data', chunk => {
          responseBody += chunk;
        });
        proxyRes.on('end', () => {
          resolve({
            statusCode: proxyRes.statusCode,
            headers: proxyRes.headers,
            body: responseBody
          });
        });
      });
      
      proxyReq.on('error', reject);
      proxyReq.write(JSON.stringify({ args: requestData }));
      proxyReq.end();
    });
    
    // 转发响应头
    Object.entries(cloudFunctionResponse.headers).forEach(([key, value]) => {
      if (key !== 'content-length' && key !== 'connection') {
        res.setHeader(key, value);
      }
    });
    
    // 设置响应状态码
    res.statusCode = cloudFunctionResponse.statusCode;
    
    // 发送响应体
    res.end(cloudFunctionResponse.body);
  } catch (error) {
    console.error('处理分析请求时出错:', error);
    res.statusCode = 500;
    res.end(JSON.stringify({ 
      success: false, 
      message: '处理请求时发生错误', 
      error: error.message 
    }));
  }
}; 