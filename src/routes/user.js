const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authMiddleware } = require('../middlewares/authMiddleware');

// 用户管理接口路由
// 1. 获取用户列表
router.get('/list', authMiddleware, userController.getUserList);
// // 2. 获取用户详情
// router.get('/:id', userController.getUserDetail);
// 3. 新增用户
router.post('/add', authMiddleware, userController.addUser);
// 4. 更新用户
router.post('/update', authMiddleware, userController.updateUser);
// // 5. 删除用户
// router.delete('/:id', userController.deleteUser);
// // 6. 修改用户状态
// router.put('/:id/status', companyController.updateCompanyStatus);
router.post('/change-password', authMiddleware, userController.changePassword)

module.exports = router;