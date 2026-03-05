const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { validateLogin } = require('../middlewares/validate');
const { authMiddleware } = require('../middlewares/authMiddleware');

// 登录接口：POST /api/auth/login
router.post('/login', authController.login);

// 获取当前登录用户接口：GET /api/auth/current-user
router.get('/current-user', authMiddleware, authController.getCurrentUser);

// 新增：获取用户菜单接口 GET /api/auth/menu
router.get('/menu', authMiddleware, authController.getUserMenu);
router.get('/logout', authMiddleware, authController.logout);

module.exports = router;