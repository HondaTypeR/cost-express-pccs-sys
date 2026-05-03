const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const { authMiddleware } = require('../middlewares/authMiddleware');
const comprehensiveController = require('../controllers/comprehensiveController');
const materialController = require('../controllers/materialController');
const mechanicalController = require('../controllers/mechanicalController');
const artificialController = require('../controllers/artificialController');
const applyController = require('../controllers/applyController');
const processRecordController = require('../controllers/processRecordController');
const contractImportController = require('../controllers/contractImportController');
const analyticsController = require('../controllers/analyticsController');

// 流程记录相关路由（必须放在动态路由之前）
router.get('/process_record/list', authMiddleware, processRecordController.getProcessRecordList);
router.post('/process_record/add', authMiddleware, processRecordController.addProcessRecord);
router.post('/process_record/invalid', authMiddleware, processRecordController.invalidProcessRecord);
router.post('/process_record/submit', authMiddleware, processRecordController.submitProcessRecord);
router.post('/process_record/approve', authMiddleware, processRecordController.approveProcessRecord);
router.post('/process_record/reject', authMiddleware, processRecordController.rejectProcessRecord);

// 综合查询接口：查询所有材料、机械、人工数据（必须放在动态路由之前）
router.get('/all-materials', authMiddleware, materialController.getAllMaterialData);
router.get('/analytics/project-cost-pie', authMiddleware, analyticsController.getProjectCostPie);

// 预算导入接口（异步任务）
router.post('/budget/import', authMiddleware, contractImportController.submitBudgetImportTask);
// 查询导入任务状态
router.get('/budget/import/status/:task_id', authMiddleware, contractImportController.getBudgetImportTaskStatus);
// 查询导入任务错误日志
router.get('/budget/import/result/:task_id', authMiddleware, contractImportController.getBudgetImportTaskResult);
// 查询导入任务列表（sys_import_task）
router.get('/budget/import/find/tasks', authMiddleware, contractImportController.getBudgetImportTaskList);

// 预算表查询（sys_budget，分页 + 模糊搜索）
router.get('/budget/list', authMiddleware, contractImportController.getBudgetList);

// 预算表新增（sys_budget）
router.post('/budget/add', authMiddleware, contractImportController.addBudget);

// 预算表编辑/删除（sys_budget）
router.post('/budget/update', authMiddleware, contractImportController.updateBudget);
router.post('/budget/delete', authMiddleware, contractImportController.deleteBudgetBatch);

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
router.get('/mechanical/:mechanical_code', authMiddleware, mechanicalController.getMaterialDetail);
router.post('/mechanical/add', authMiddleware, mechanicalController.addMaterial);
router.post('/mechanical/update', authMiddleware, mechanicalController.updateMaterial);
router.post('/mechanical/delete', authMiddleware, mechanicalController.deleteMaterial);
router.post('/mechanical/submit_approval', authMiddleware, mechanicalController.submitApproval);
router.post('/mechanical/approve', authMiddleware, mechanicalController.approveMaterial);
router.post('/mechanical/reject', authMiddleware, mechanicalController.rejectMaterial);

// 人工管理相关路由
router.get('/artificial/list', authMiddleware, artificialController.getMaterialList);
router.get('/artificial/:artficial_code', authMiddleware, artificialController.getMaterialDetail);
router.post('/artificial/add', authMiddleware, artificialController.addMaterial);
router.post('/artificial/update', authMiddleware, artificialController.updateMaterial);
router.post('/artificial/delete', authMiddleware, artificialController.deleteMaterial);
router.post('/artificial/submit_approval', authMiddleware, artificialController.submitApproval);
router.post('/artificial/approve', authMiddleware, artificialController.approveMaterial);
router.post('/artificial/reject', authMiddleware, artificialController.rejectMaterial);

// 报销申请相关路由
router.post('/apply/list', authMiddleware, applyController.getApplyList);
router.get('/apply/:id', authMiddleware, applyController.getApplyDetail);
router.post('/apply/add', authMiddleware, applyController.addApply);
router.post('/apply/update', authMiddleware, applyController.updateApply);
router.post('/apply/delete', authMiddleware, applyController.deleteApply);
router.post('/apply/submit_approval', authMiddleware, applyController.submitApproval);
router.post('/apply/approve', authMiddleware, applyController.approveApply);
router.post('/apply/reject', authMiddleware, applyController.rejectApply);

// 报销申请（5级审批人模式）- 新审批页面使用
router.post('/apply/list/by_level', authMiddleware, applyController.getApplyListByLevel);
router.post('/apply/submit_with_levels', authMiddleware, applyController.submitApplyWithLevels);
router.post('/apply/approve_with_levels', authMiddleware, applyController.approveApplyWithLevels);
router.post('/apply/reject_with_levels', authMiddleware, applyController.rejectApplyWithLevels);

module.exports = router;