const express = require('express');
const router = express.Router();
const controller = require('../controllers/supplierController');
const { authMiddleware } = require('../middlewares/authMiddleware');

// 获取供应商列表（分页+筛选）
router.get('/list', authMiddleware, controller.getSupplierList);
// 获取供应商详情
router.get('/:supplier_id', authMiddleware, controller.getSupplierDetail);
// 新增供应商
router.post('/add', authMiddleware, controller.addSupplier);
// 修改供应商
router.post('/update', authMiddleware, controller.updateSupplier);
// 删除供应商（新增）
router.post('/delete', authMiddleware, controller.deleteSupplier);

module.exports = router;