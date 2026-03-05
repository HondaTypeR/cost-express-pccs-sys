const { query } = require('../../db');

// 1. 获取供应商列表（无分页，仅关键词筛选）
const getSupplierList = async (req, res) => {
    try {
        const { keyword = '' } = req.query;

        let whereSql = '1=1';
        const params = [];
        if (keyword) {
            whereSql += ' AND supplier_name LIKE ?';
            params.push(`%${keyword}%`);
        }

        const listResult = await query(
            `SELECT supplier_id, supplier_name, supplier_bank, supplier_account, 
              pending_payment, paid_amount, arrears_amount, contract_id, create_time, update_time 
       FROM sys_supplier 
       WHERE ${whereSql} 
       ORDER BY create_time DESC`,
            params
        );
        const list = Array.isArray(listResult) ? listResult : listResult?.results || [];

        res.json({
            code: 200,
            msg: '查询成功',
            data: list
        });
    } catch (err) {
        res.json({
            code: 500,
            msg: '服务器错误：' + err.message,
            data: null
        });
    }
};

// 2. 获取供应商详情
const getSupplierDetail = async (req, res) => {
    try {
        const { supplier_id } = req.params;

        if (!supplier_id) {
            return res.json({
                code: 400,
                msg: '供应商ID不能为空',
                data: null
            });
        }

        const detailResult = await query(
            `SELECT supplier_id, supplier_name, supplier_bank, supplier_account, 
              pending_payment, paid_amount, arrears_amount, contract_id, create_time, update_time 
       FROM sys_supplier WHERE supplier_id = ?`,
            [supplier_id]
        );
        const detail = Array.isArray(detailResult) ? detailResult : detailResult?.results || [];

        if (detail.length === 0) {
            return res.json({
                code: 404,
                msg: '供应商不存在',
                data: null
            });
        }

        res.json({
            code: 200,
            msg: '查询成功',
            data: detail[0]
        });
    } catch (err) {
        res.json({
            code: 500,
            msg: '服务器错误：' + err.message,
            data: null
        });
    }
};

// 3. 新增供应商
const addSupplier = async (req, res) => {
    try {
        const {
            supplier_name, supplier_bank, supplier_account, contract_id,
            pending_payment = 0.00, paid_amount = 0.00, arrears_amount = 0.00
        } = req.body;

        if (!supplier_name) {
            return res.json({
                code: 400,
                msg: '供应商名称不能为空',
                data: null
            });
        }

        const existResult = await query(
            'SELECT supplier_id FROM sys_supplier WHERE supplier_name = ?',
            [supplier_name]
        );
        const exist = Array.isArray(existResult) ? existResult : existResult?.results || [];

        if (exist.length > 0) {
            return res.json({
                code: 400,
                msg: '供应商名称已存在',
                data: null
            });
        }

        const insertResult = await query(
            `INSERT INTO sys_supplier 
       (supplier_name, supplier_bank, supplier_account, contract_id, pending_payment, paid_amount, arrears_amount) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [supplier_name, supplier_bank || '', supplier_account || '', contract_id || '', pending_payment, paid_amount, arrears_amount]
        );

        const insertId = insertResult.insertId || (Array.isArray(insertResult) ? insertResult[0]?.insertId : null);

        res.json({
            code: 200,
            msg: '新增供应商成功',
            data: { supplier_id: insertId }
        });
    } catch (err) {
        res.json({
            code: 500,
            msg: '服务器错误：' + err.message,
            data: null
        });
    }
};

// 4. 修改供应商
const updateSupplier = async (req, res) => {
    try {
        const { supplier_id } = req.body;
        const {
            supplier_name, supplier_bank, supplier_account, contract_id,
            pending_payment, paid_amount, arrears_amount
        } = req.body;

        if (!supplier_id) {
            return res.json({
                code: 400,
                msg: '供应商ID不能为空',
                data: null
            });
        }
        if (!supplier_name) {
            return res.json({
                code: 400,
                msg: '供应商名称不能为空',
                data: null
            });
        }

        const existResult = await query(
            'SELECT supplier_id FROM sys_supplier WHERE supplier_id = ?',
            [supplier_id]
        );
        const exist = Array.isArray(existResult) ? existResult : existResult?.results || [];

        if (exist.length === 0) {
            return res.json({
                code: 404,
                msg: '供应商不存在',
                data: null
            });
        }

        const nameExistResult = await query(
            'SELECT supplier_id FROM sys_supplier WHERE supplier_name = ? AND supplier_id != ?',
            [supplier_name, supplier_id]
        );
        const nameExist = Array.isArray(nameExistResult) ? nameExistResult : nameExistResult?.results || [];

        if (nameExist.length > 0) {
            return res.json({
                code: 400,
                msg: '供应商名称已存在',
                data: null
            });
        }

        const updateResult = await query(
            `UPDATE sys_supplier 
       SET supplier_name = ?, supplier_bank = ?, supplier_account = ?, contract_id = ?,
           pending_payment = ?, paid_amount = ?, arrears_amount = ? 
       WHERE supplier_id = ?`,
            [
                supplier_name, supplier_bank || '', supplier_account || '', contract_id || '',
                pending_payment || 0.00, paid_amount || 0.00, arrears_amount || 0.00,
                supplier_id
            ]
        );

        const affectedRows = updateResult.affectedRows || (Array.isArray(updateResult) ? updateResult[0]?.affectedRows : 0);
        if (affectedRows > 0) {
            res.json({
                code: 200,
                msg: '修改供应商成功',
                data: { supplier_id }
            });
        } else {
            res.json({
                code: 400,
                msg: '修改供应商失败，未更新任何数据',
                data: null
            });
        }
    } catch (err) {
        res.json({
            code: 500,
            msg: '服务器错误：' + err.message,
            data: null
        });
    }
};

// 5. 删除供应商（带业务规则校验）
const deleteSupplier = async (req, res) => {
    try {
        // 从请求体获取供应商ID（POST方式）
        const { supplier_id } = req.body;

        // 1. 基础参数校验
        if (!supplier_id) {
            return res.json({
                code: 400,
                msg: '供应商ID不能为空',
                data: null
            });
        }

        // 2. 查询供应商是否存在，并获取欠款金额和合同ID
        const supplierResult = await query(
            `SELECT arrears_amount, contract_id 
       FROM sys_supplier 
       WHERE supplier_id = ?`,
            [supplier_id]
        );
        const supplier = Array.isArray(supplierResult) ? supplierResult : supplierResult?.results || [];

        if (supplier.length === 0) {
            return res.json({
                code: 404,
                msg: '供应商不存在，无法删除',
                data: null
            });
        }

        const { arrears_amount, contract_id } = supplier[0];

        // 3. 业务规则校验：欠款金额不为0则删除失败
        if (arrears_amount && parseFloat(arrears_amount) !== 0) {
            return res.json({
                code: 400,
                msg: `删除失败！该供应商存在欠款金额（${arrears_amount}元），请先结清欠款后再删除`,
                data: null
            });
        }

        // 4. 业务规则校验：合同ID不为空则删除失败
        if (contract_id && contract_id !== '' && contract_id !== null) {
            return res.json({
                code: 400,
                msg: `删除失败！该供应商关联了合同（合同ID：${contract_id}），请先解除合同关联后再删除`,
                data: null
            });
        }

        // 5. 所有校验通过，执行删除操作
        const deleteResult = await query(
            'DELETE FROM sys_supplier WHERE supplier_id = ?',
            [supplier_id]
        );

        const affectedRows = deleteResult.affectedRows || (Array.isArray(deleteResult) ? deleteResult[0]?.affectedRows : 0);
        if (affectedRows > 0) {
            res.json({
                code: 200,
                msg: '供应商删除成功',
                data: null
            });
        } else {
            res.json({
                code: 400,
                msg: '供应商删除失败，未执行删除操作',
                data: null
            });
        }

    } catch (err) {
        res.json({
            code: 500,
            msg: '服务器错误：' + err.message,
            data: null
        });
    }
};

// 导出所有接口方法（新增deleteSupplier）
module.exports = {
    getSupplierList,
    getSupplierDetail,
    addSupplier,
    updateSupplier,
    deleteSupplier
};