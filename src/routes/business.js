const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const { authMiddleware } = require('../middlewares/authMiddleware');
const comprehensiveController = require('../controllers/comprehensiveController');
const materialController = require('../controllers/materialController');
const mechanicalController = require('../controllers/mechanicalController');
const artificialController = require('../controllers/artificialController');
const processRecordController = require('../controllers/processRecordController');

// 流程记录相关路由（必须放在动态路由之前）
router.get('/process_record/list', authMiddleware, processRecordController.getProcessRecordList);
router.post('/process_record/add', authMiddleware, processRecordController.addProcessRecord);
router.post('/process_record/invalid', authMiddleware, processRecordController.invalidProcessRecord);
router.post('/process_record/submit', authMiddleware, processRecordController.submitProcessRecord);
router.post('/process_record/approve', authMiddleware, processRecordController.approveProcessRecord);
router.post('/process_record/reject', authMiddleware, processRecordController.rejectProcessRecord);

// 综合查询接口：查询所有材料、机械、人工数据（必须放在动态路由之前）
router.get('/all-materials', authMiddleware, materialController.getAllMaterialData);


// 获取项目列表
router.get('/list', authMiddleware, projectController.getProjectList);
// 获取项目详情
router.get('/:project_id', authMiddleware, projectController.getProjectDetail);
// 新增项目
router.post('/add', authMiddleware, projectController.addProject);
// 修改项目
router.post('/update', authMiddleware, projectController.updateProject);

// 综合管理相关路由
router.get('/comprehensive/list', authMiddleware, comprehensiveController.getComprehensiveList);
router.get('/comprehensive/:management_id', authMiddleware, comprehensiveController.getComprehensiveDetail);
router.post('/comprehensive/add', authMiddleware, comprehensiveController.addComprehensive);
router.post('/comprehensive/update', authMiddleware, comprehensiveController.updateComprehensive);
router.post('/comprehensive/delete', authMiddleware, comprehensiveController.deleteComprehensive);

// 材料管理相关路由
router.get('/material/list', authMiddleware, materialController.getMaterialList);
router.get('/material/:material_code', authMiddleware, materialController.getMaterialDetail);
router.post('/material/add', authMiddleware, materialController.addMaterial);
router.post('/material/update', authMiddleware, materialController.updateMaterial);
router.post('/material/delete', authMiddleware, materialController.deleteMaterial);
router.post('/material/submit_approval', authMiddleware, materialController.submitApproval);
router.post('/material/approve', authMiddleware, materialController.approveMaterial);
router.post('/material/reject', authMiddleware, materialController.rejectMaterial);

// 机械管理相关路由
router.get('/mechanical/list', authMiddleware, mechanicalController.getMaterialList);
router.get('/mechanical/:material_code', authMiddleware, mechanicalController.getMaterialDetail);
router.post('/mechanical/add', authMiddleware, mechanicalController.addMaterial);
router.post('/mechanical/update', authMiddleware, mechanicalController.updateMaterial);
router.post('/mechanical/delete', authMiddleware, mechanicalController.deleteMaterial);
router.post('/mechanical/submit_approval', authMiddleware, mechanicalController.submitApproval);
router.post('/mechanical/approve', authMiddleware, mechanicalController.approveMaterial);
router.post('/mechanical/reject', authMiddleware, mechanicalController.rejectMaterial);

// 人工管理相关路由
router.get('/artificial/list', authMiddleware, artificialController.getMaterialList);
router.get('/artificial/:material_code', authMiddleware, artificialController.getMaterialDetail);
router.post('/artificial/add', authMiddleware, artificialController.addMaterial);
router.post('/artificial/update', authMiddleware, artificialController.updateMaterial);
router.post('/artificial/delete', authMiddleware, artificialController.deleteMaterial);
router.post('/artificial/submit_approval', authMiddleware, artificialController.submitApproval);
router.post('/artificial/approve', authMiddleware, artificialController.approveMaterial);
router.post('/artificial/reject', authMiddleware, artificialController.rejectMaterial);

module.exports = router;