// src/routes/index.js
const express = require('express');
const router = express.Router();

// 定义路由
router.get('/all/menus', (req, res) => {
    const menuList = [
        { label: '人员管理', value: '/personnel' },
        { label: '权限管理', value: '/power' },
        { label: "供应商管理", value: "/supplier" },
        { label: "权限管理", value: "/power" },
    ];
    // 统一响应格式：code（状态码）、msg（提示）、data（数据数组）
    res.json({
        code: 200,
        msg: '获取菜单成功',
        data: menuList
    });
});

module.exports = router;