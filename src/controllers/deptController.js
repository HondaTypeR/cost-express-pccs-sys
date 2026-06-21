const { query } = require('../../db');

const ALLOW_FIELDS = [
    'dept_name',
    'power',
    'level_one_checker',
    'level_two_checker',
    'level_three_checker',
    'level_four_checker',
    'level_five_checker',
    'router'
];

const normalizeRows = (result) => Array.isArray(result) ? result : result?.results || [];

// 校验同一部门下权限点是否已存在
const hasDuplicateDeptPower = async (dept_name, power, excludeDeptId = null) => {
    const params = [dept_name, power];
    let sql = 'SELECT dept_id FROM sys_dept WHERE dept_name = ? AND power = ?';
    if (excludeDeptId != null) {
        sql += ' AND dept_id <> ?';
        params.push(excludeDeptId);
    }
    const result = await query(sql, params);
    return normalizeRows(result).length > 0;
};

// 获取部门列表（不分页）
const getDeptList = async (req, res) => {
    try {
        const result = await query('SELECT * FROM sys_dept ORDER BY dept_id ASC');
        const list = Array.isArray(result) ? result : result?.results || [];
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

// 新增部门
const addDept = async (req, res) => {
    try {
        const body = req.body || {};
        const dept_name = String(body.dept_name || '').trim();

        const power = String(body.power || '').trim();

        if (!dept_name) {
            return res.json({
                code: 400,
                msg: '部门名称不能为空',
                data: null
            });
        }

        if (!power) {
            return res.json({
                code: 400,
                msg: '权限点不能为空',
                data: null
            });
        }

        if (await hasDuplicateDeptPower(dept_name, power)) {
            return res.json({
                code: 400,
                msg: '该部门已存在相同权限点，不可重复创建',
                data: null
            });
        }

        const values = ALLOW_FIELDS.map(f => String(body[f] ?? '').trim());

        const insertResult = await query(
            `INSERT INTO sys_dept (${ALLOW_FIELDS.join(', ')}) VALUES (${ALLOW_FIELDS.map(() => '?').join(', ')})`,
            values
        );

        const insertId = insertResult.insertId || (Array.isArray(insertResult) ? insertResult[0]?.insertId : insertResult?.insertId);

        res.json({
            code: 200,
            msg: '新增部门成功',
            data: { dept_id: insertId }
        });
    } catch (err) {
        res.json({
            code: 500,
            msg: '服务器错误：' + err.message,
            data: null
        });
    }
};

// 更新部门（支持根据 dept_id 或任一 level_*_checker 字段定位）
const LOCATOR_FIELDS = [
    'dept_id',
    'level_one_checker',
    'level_two_checker',
    'level_three_checker',
    'level_four_checker',
    'level_five_checker'
];

const updateDept = async (req, res) => {
    try {
        const body = req.body || {};

        // 1. 收集本次请求里提供的"定位字段"
        const whereParts = [];
        const whereParams = [];
        for (const f of LOCATOR_FIELDS) {
            if (Object.prototype.hasOwnProperty.call(body, f)) {
                const val = String(body[f] ?? '').trim();
                if (val !== '') {
                    whereParts.push(`${f} = ?`);
                    whereParams.push(val);
                }
            }
        }

        if (whereParts.length === 0) {
            return res.json({
                code: 400,
                msg: '请至少提供 dept_id 或任一级审核人字段作为定位条件',
                data: null
            });
        }

        const whereSql = whereParts.join(' OR ');

        // 2. 校验目标记录是否存在
        const existResult = await query(
            `SELECT dept_id FROM sys_dept WHERE ${whereSql}`,
            whereParams
        );
        const existList = Array.isArray(existResult) ? existResult : existResult?.results || [];
        if (existList.length === 0) {
            return res.json({
                code: 404,
                msg: '未匹配到对应部门，无法编辑',
                data: null
            });
        }

        // 3. 收集要更新的字段
        const setSqlParts = [];
        const params = [];
        for (const f of ALLOW_FIELDS) {
            if (Object.prototype.hasOwnProperty.call(body, f)) {
                setSqlParts.push(`${f} = ?`);
                params.push(String(body[f] ?? '').trim());
            }
        }

        if (setSqlParts.length === 0) {
            return res.json({
                code: 400,
                msg: '没有可更新的字段',
                data: null
            });
        }

        if (Object.prototype.hasOwnProperty.call(body, 'dept_name') || Object.prototype.hasOwnProperty.call(body, 'power')) {
            for (const item of existList) {
                const currentResult = await query(
                    'SELECT dept_name, power FROM sys_dept WHERE dept_id = ?',
                    [item.dept_id]
                );
                const current = normalizeRows(currentResult)[0];
                if (!current) continue;

                const newDeptName = Object.prototype.hasOwnProperty.call(body, 'dept_name')
                    ? String(body.dept_name ?? '').trim()
                    : current.dept_name;
                const newPower = Object.prototype.hasOwnProperty.call(body, 'power')
                    ? String(body.power ?? '').trim()
                    : current.power;

                if (!newDeptName) {
                    return res.json({
                        code: 400,
                        msg: '部门名称不能为空',
                        data: null
                    });
                }

                if (!newPower) {
                    return res.json({
                        code: 400,
                        msg: '权限点不能为空',
                        data: null
                    });
                }

                if (await hasDuplicateDeptPower(newDeptName, newPower, item.dept_id)) {
                    return res.json({
                        code: 400,
                        msg: '该部门已存在相同权限点，不可重复创建',
                        data: null
                    });
                }
            }
        }

        const updateResult = await query(
            `UPDATE sys_dept SET ${setSqlParts.join(', ')} WHERE ${whereSql}`,
            [...params, ...whereParams]
        );

        const affectedRows = updateResult.affectedRows || (Array.isArray(updateResult) ? updateResult[0]?.affectedRows : 0);
        if (affectedRows > 0) {
            res.json({
                code: 200,
                msg: '部门信息编辑成功',
                data: {
                    matchedDeptIds: existList.map(item => item.dept_id),
                    affectedRows
                }
            });
        } else {
            res.json({
                code: 400,
                msg: '部门信息编辑失败，未修改任何数据',
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

// 删除部门
const deleteDept = async (req, res) => {
    try {
        const { dept_id } = req.body || {};
        if (!dept_id) {
            return res.json({
                code: 400,
                msg: '部门ID不能为空',
                data: null
            });
        }

        const deleteResult = await query(
            'DELETE FROM sys_dept WHERE dept_id = ?',
            [dept_id]
        );
        const affectedRows = deleteResult.affectedRows || (Array.isArray(deleteResult) ? deleteResult[0]?.affectedRows : 0);

        if (affectedRows > 0) {
            res.json({
                code: 200,
                msg: '删除成功',
                data: { dept_id }
            });
        } else {
            res.json({
                code: 404,
                msg: '该部门不存在或已被删除',
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
    getDeptList,
    addDept,
    updateDept,
    deleteDept
};
