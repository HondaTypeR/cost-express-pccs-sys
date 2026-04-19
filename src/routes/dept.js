const express = require('express');
const router = express.Router();
const controller = require('../controllers/deptController');
const { authMiddleware } = require('../middlewares/authMiddleware');

// 部门管理接口路由
router.get('/list', authMiddleware, controller.getDeptList);
router.post('/add', authMiddleware, controller.addDept);
router.post('/update', authMiddleware, controller.updateDept);
router.post('/delete', authMiddleware, controller.deleteDept);

module.exports = router;
