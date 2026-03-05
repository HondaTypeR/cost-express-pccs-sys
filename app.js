// 1. 引入 express
const express = require('express');
const path = require('path');
require('./db'); // 引入数据库配置，自动测试连接
// 2. 创建 app 实例
const app = express();
const { authMiddleware } = require('./src/middlewares/authMiddleware');
// 业务路由
const businessRouter = require('./src/routes/business'); // 引入接口路由

// 配置静态资源访问：让前端能直接访问uploads文件夹下的文件
app.use('/uploads', express.static(path.join(__dirname, 'src/uploads')));

// 3. 引入路由
const baseRouter = require('./src/routes/index');
const authRouter = require('./src/routes/auth');
const userRouter = require('./src/routes/user');
const companyRouter = require('./src/routes/company');
const supplierRouter = require('./src/routes/supplier');
const contractRouter = require('./src/routes/contract');


// 必备中间件：解析 JSON 和 URL 编码请求体
app.use(express.json());

app.use(express.urlencoded({ extended: true }));

// 4. 现在就可以使用 app 了
app.use('/api', baseRouter);
app.use('/api/auth', authRouter);
app.use('/api/user', userRouter);
app.use('/api/company', companyRouter);
app.use('/api/supplier', supplierRouter);
app.use('/api/business', businessRouter);
app.use('/api/contract', contractRouter);

// 5. 其他中间件和路由
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.send('Hello Express!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
});