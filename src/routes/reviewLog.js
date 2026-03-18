const express = require('express');
const router = express.Router();
const controller = require('../controllers/reviewLogController');
const { authMiddleware } = require('../middlewares/authMiddleware');

// 新增审批日志
router.post('/add', authMiddleware, controller.addReviewLog);

// 更新审批日志
router.post('/update', authMiddleware, controller.updateReviewLog);

// 获取审批日志列表
router.post('/list', authMiddleware, controller.getReviewLogList);

module.exports = router;
