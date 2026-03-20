const express = require('express');
const router = express.Router();
const controller = require('../controllers/subContractController');
const { authMiddleware } = require('../middlewares/authMiddleware');

router.post('/add', authMiddleware, controller.addSubContract);
router.post('/list', authMiddleware, controller.getSubContractList);
router.post('/update', authMiddleware, controller.updateSubContract);
router.post('/delete', authMiddleware, controller.deleteSubContract);

module.exports = router;
