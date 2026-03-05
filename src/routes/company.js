const express = require('express');
const router = express.Router();
const companyController = require('../controllers/companyController');
const { authMiddleware } = require('../middlewares/authMiddleware');

// 公司管理接口路由
// 1. 获取公司列表
router.get('/list', authMiddleware, companyController.getCompanyList);
// // 2. 获取公司详情
// router.get('/:id', companyController.getCompanyDetail);
// 3. 新增公司
router.post('/add', authMiddleware, companyController.addCompany);
// 4. 更新公司
router.post('/update', authMiddleware, companyController.updateCompany);
// // 5. 删除公司
// router.delete('/:id', companyController.deleteCompany);
// // 6. 修改公司状态
// router.put('/:id/status', companyController.updateCompanyStatus);

module.exports = router;