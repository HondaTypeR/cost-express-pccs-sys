const jwt = require('jsonwebtoken');

// JWT 验证中间件
const authMiddleware = (req, res, next) => {
    // 1. 获取请求头中的 Token（格式：Bearer xxxxxxx）
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.json({
            code: 401,
            msg: '未登录，请先登录',
            data: null
        });
    }

    // 2. 提取 Token 部分（去掉 Bearer 前缀）
    const token = authHeader.split(' ')[1];
    const secretKey = 'your-secret-key-123456'; // 必须和生成 Token 时的密钥一致

    try {
        // 3. 验证并解析 Token
        const decoded = jwt.verify(token, secretKey);
        // 4. 将解析后的用户信息挂载到 req 对象，供后续接口使用
        req.user = decoded;
        // 5. 验证通过，执行下一步
        next();
    } catch (error) {
        // Token 过期或无效
        return res.json({
            code: 401,
            msg: '登录已过期，请重新登录',
            data: null
        });
    }
};

module.exports = {
    authMiddleware
};