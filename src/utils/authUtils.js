const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// 加密密码（同步版，简单易理解）
const encryptPassword = (password) => {
    // 生成盐值（rounds=10，越高越安全但越慢）
    const salt = bcrypt.genSaltSync(10);
    // 加密密码
    return bcrypt.hashSync(password, salt);
};

// 验证密码
const verifyPassword = (plainPassword, hashedPassword) => {
    return bcrypt.compareSync(plainPassword, hashedPassword);
};

// 生成 JWT 令牌
const generateToken = (user) => {
    // 密钥（生产环境需放到环境变量，如 process.env.JWT_SECRET）
    const secretKey = 'your-secret-key-123456';
    // 生成令牌（有效期 2 小时）
    return jwt.sign(
        { id: user.id, username: user.username }, // 载荷：存储用户关键信息（不要存密码）
        secretKey,
        { expiresIn: '2h' }
    );
};

module.exports = {
    encryptPassword,
    verifyPassword,
    generateToken
};