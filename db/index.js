// db/index.js
const mysql = require('mysql2/promise'); // 使用 promise 版本，支持 async/await

// 数据库配置（替换成你的密码）
const dbConfig = {
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'Chejunlin@0426t!', // 比如 123456
    database: 'admin_system',
    allowPublicKeyRetrieval: true, // 解决之前的公钥获取报错
    charset: 'utf8mb4' // 支持中文和emoji
};

// 创建连接池（推荐，比单次连接更高效）
const pool = mysql.createPool(dbConfig);

// 测试连接
async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('✅ 数据库连接成功！');
        connection.release(); // 释放连接
    } catch (err) {
        console.error('❌ 数据库连接失败：', err.message);
    }
}

// 通用查询方法（封装后接口直接调用）
async function query(sql, params = []) {
    try {
        const [rows] = await pool.execute(sql, params);
        return rows;
    } catch (err) {
        console.error('查询失败：', err.message, 'SQL：', sql);
        throw err; // 抛出错误，让接口层处理
    }
}

// 初始化测试连接
testConnection();

// 导出查询方法
module.exports = { query };