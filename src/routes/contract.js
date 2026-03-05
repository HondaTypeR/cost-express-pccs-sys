const express = require('express');
const router = express.Router();
const controller = require('../controllers/contractController');
const { authMiddleware } = require('../middlewares/authMiddleware');
const attachmentController = require('../controllers/contractAttachmentController');
const { upload } = require('../uploadConfig');

// 文件上传接口：支持多文件上传（name=files）
router.post('/upload', upload.array('files', 5), attachmentController.uploadContractAttachment);

// 获取合同列表
router.get('/list', authMiddleware, controller.getContractList);
// 获取合同详情
router.get('/:contract_id', authMiddleware, controller.getContractDetail);
// 获取合同关联的所有数据（材料、机械、人工）
router.get('/:contract_id/related', authMiddleware, controller.getContractRelatedData);
// 新增合同
router.post('/add', authMiddleware, controller.addContract);
// 修改合同
router.post('/update', authMiddleware, controller.updateContract);
// 删除合同
router.post('/delete', authMiddleware, controller.deleteContract);

module.exports = router;