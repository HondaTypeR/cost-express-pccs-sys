const { query } = require('../../db');

// 1. 新增审批日志
const addReviewLog = async (req, res) => {
    try {
        const {
            link_info = '',
            log_type = '',
            level_one_reviewer = '',
            level_one_review_status = '',
            level_one_review_remark = '',
            level_two_reviewer = '',
            level_two_review_status = '',
            level_two_review_remark = '',
            level_three_reviewer = '',
            level_three_review_status = '',
            level_three_review_remark = '',
            level_four_reviewer = '',
            level_four_review_status = '',
            level_four_review_remark = '',
            level_five_reviewer = '',
            level_five_review_status = '',
            level_five_review_remark = ''
        } = req.body || {};

        if (!link_info) {
            return res.json({
                code: 400,
                msg: '关联信息不能为空',
                data: null
            });
        }

        if (!log_type) {
            return res.json({
                code: 400,
                msg: '类型不能为空',
                data: null
            });
        }

        const insertResult = await query(
            `INSERT INTO sys_review_log (
                link_info, log_type,
                level_one_reviewer, level_one_review_status, level_one_review_remark,
                level_two_reviewer, level_two_review_status, level_two_review_remark,
                level_three_reviewer, level_three_review_status, level_three_review_remark,
                level_four_reviewer, level_four_review_status, level_four_review_remark,
                level_five_reviewer, level_five_review_status, level_five_review_remark
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                link_info, log_type,
                level_one_reviewer, level_one_review_status, level_one_review_remark,
                level_two_reviewer, level_two_review_status, level_two_review_remark,
                level_three_reviewer, level_three_review_status, level_three_review_remark,
                level_four_reviewer, level_four_review_status, level_four_review_remark,
                level_five_reviewer, level_five_review_status, level_five_review_remark
            ]
        );

        const insertId = insertResult.insertId || (Array.isArray(insertResult) ? insertResult[0]?.insertId : null);

        res.json({
            code: 200,
            msg: '新增成功',
            data: { id: insertId }
        });
    } catch (err) {
        res.json({
            code: 500,
            msg: '服务器错误：' + err.message,
            data: null
        });
    }
};

// 3. 更新审批日志（部分更新）
const updateReviewLog = async (req, res) => {
    try {
        const { id } = req.body || {};

        if (!id) {
            return res.json({
                code: 400,
                msg: 'id不能为空',
                data: null
            });
        }

        const updatableFields = [
            'link_info',
            'log_type',
            'level_one_reviewer',
            'level_one_review_status',
            'level_one_review_remark',
            'level_two_reviewer',
            'level_two_review_status',
            'level_two_review_remark',
            'level_three_reviewer',
            'level_three_review_status',
            'level_three_review_remark',
            'level_four_reviewer',
            'level_four_review_status',
            'level_four_review_remark',
            'level_five_reviewer',
            'level_five_review_status',
            'level_five_review_remark'
        ];

        const setClauses = [];
        const params = [];

        for (const field of updatableFields) {
            if (Object.prototype.hasOwnProperty.call(req.body, field)) {
                setClauses.push(`${field} = ?`);
                params.push(req.body[field]);
            }
        }

        if (setClauses.length === 0) {
            return res.json({
                code: 400,
                msg: '未提供可更新字段',
                data: null
            });
        }

        const existResult = await query(
            'SELECT id FROM sys_review_log WHERE id = ?',
            [id]
        );
        const exist = Array.isArray(existResult) ? existResult : existResult?.results || [];
        if (exist.length === 0) {
            return res.json({
                code: 404,
                msg: '记录不存在，无法修改',
                data: null
            });
        }

        const updateResult = await query(
            `UPDATE sys_review_log SET ${setClauses.join(', ')} WHERE id = ?`,
            [...params, id]
        );

        const affectedRows = updateResult.affectedRows || (Array.isArray(updateResult) ? updateResult[0]?.affectedRows : 0);
        if (affectedRows > 0) {
            res.json({
                code: 200,
                msg: '修改成功',
                data: { id }
            });
        } else {
            res.json({
                code: 400,
                msg: '修改失败，未更新任何数据',
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

// 2. 获取审批日志列表（无分页，多字段筛选）
const getReviewLogList = async (req, res) => {
    try {
        const {
            id = '',
            link_info = '',
            log_type = '',
            level_one_review_status = '',
            level_two_review_status = '',
            level_three_review_status = '',
            level_four_review_status = '',
            level_five_review_status = ''
        } = req.body || {};

        let whereSql = '1=1';
        const params = [];

        if (id) {
            whereSql += ' AND id = ?';
            params.push(id);
        }
        if (link_info) {
            whereSql += ' AND link_info LIKE ?';
            params.push(`%${link_info}%`);
        }
        if (log_type) {
            whereSql += ' AND log_type = ?';
            params.push(log_type);
        }
        if (level_one_review_status) {
            whereSql += ' AND level_one_review_status = ?';
            params.push(level_one_review_status);
        }
        if (level_two_review_status) {
            whereSql += ' AND level_two_review_status = ?';
            params.push(level_two_review_status);
        }
        if (level_three_review_status) {
            whereSql += ' AND level_three_review_status = ?';
            params.push(level_three_review_status);
        }
        if (level_four_review_status) {
            whereSql += ' AND level_four_review_status = ?';
            params.push(level_four_review_status);
        }
        if (level_five_review_status) {
            whereSql += ' AND level_five_review_status = ?';
            params.push(level_five_review_status);
        }

        const listResult = await query(
            `SELECT 
                id, link_info, log_type,
                level_one_reviewer, level_one_review_status, level_one_review_remark,
                level_two_reviewer, level_two_review_status, level_two_review_remark,
                level_three_reviewer, level_three_review_status, level_three_review_remark,
                level_four_reviewer, level_four_review_status, level_four_review_remark,
                level_five_reviewer, level_five_review_status, level_five_review_remark,
                create_time, update_time
            FROM sys_review_log
            WHERE ${whereSql}
            ORDER BY update_time DESC`,
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

module.exports = {
    addReviewLog,
    getReviewLogList,
    updateReviewLog
};
