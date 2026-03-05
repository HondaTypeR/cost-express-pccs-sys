const { query } = require('../../db');

// 获取公司列表
const getCompanyList = async (req, res) => {
    try {
        const result = await query('SELECT * FROM sys_company');
        res.json({
            code: 200,
            data: result
        });
    } catch (err) {
        res.json({
            code: 500,
            msg: '服务器错误：' + err.message,
            data: null
        });
    }
};

// 新增公司
const addCompany = async (req, res) => {
    try {
        const { company_name, department, status = 1 } = req.body;

        // 必传参数校验
        if (!company_name) {
            return res.json({
                code: 400,
                msg: '公司名称不能为空',
                data: null
            });
        }

        // 检查公司名称是否重复
        const existResult = await query(
            'SELECT id FROM sys_company WHERE company_name = ?',
            [company_name]
        );
        // 适配 query 返回的结果结构
        const exist = Array.isArray(existResult) ? existResult : existResult?.results || [];

        if (exist.length > 0) {
            return res.json({
                code: 400,
                msg: '公司名称已存在',
                data: null
            });
        }

        // 插入新公司
        const insertResult = await query(
            'INSERT INTO sys_company (company_name, department, status) VALUES (?, ?, ?)',
            [company_name, department || '', status]
        );

        res.json({
            code: 200,
            msg: '新增公司成功',
            data: { id: insertResult.insertId || (Array.isArray(insertResult) ? insertResult[0]?.insertId : insertResult?.insertId) }
        });
    } catch (err) {
        res.json({
            code: 500,
            msg: '服务器错误：' + err.message,
            data: null
        });
    }
};

// 编辑（更新）公司 - 改为POST方式
const updateCompany = async (req, res) => {
    try {
        // POST方式：ID从请求体获取（不再从URL参数取）
        const { id, company_name, department, status } = req.body;

        // 1. 基础参数校验
        if (!id) {
            return res.json({
                code: 400,
                msg: '公司ID不能为空',
                data: null
            });
        }
        if (!company_name) {
            return res.json({
                code: 400,
                msg: '公司名称不能为空',
                data: null
            });
        }

        // 2. 检查公司是否存在
        const existCompanyResult = await query(
            'SELECT id FROM sys_company WHERE id = ?',
            [id]
        );
        const existCompany = Array.isArray(existCompanyResult) ? existCompanyResult : existCompanyResult?.results || [];
        if (existCompany.length === 0) {
            return res.json({
                code: 404,
                msg: '该公司不存在，无法编辑',
                data: null
            });
        }

        // 3. 检查公司名称是否重复（排除自身）
        const existNameResult = await query(
            'SELECT id FROM sys_company WHERE company_name = ? AND id != ?',
            [company_name, id]
        );
        const existName = Array.isArray(existNameResult) ? existNameResult : existNameResult?.results || [];
        if (existName.length > 0) {
            return res.json({
                code: 400,
                msg: '公司名称已存在，无法修改',
                data: null
            });
        }

        // 4. 执行更新操作
        const updateResult = await query(
            'UPDATE sys_company SET company_name = ?, department = ?, status = ? WHERE id = ?',
            [company_name, department || '', status ?? 1, id]
        );

        // 5. 判断更新是否成功
        const affectedRows = updateResult.affectedRows || (Array.isArray(updateResult) ? updateResult[0]?.affectedRows : 0);
        if (affectedRows > 0) {
            res.json({
                code: 200,
                msg: '公司信息编辑成功',
                data: { id: id }
            });
        } else {
            res.json({
                code: 400,
                msg: '公司信息编辑失败，未修改任何数据',
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

module.exports = {
    getCompanyList,
    addCompany,
    updateCompany // 导出编辑公司方法
};