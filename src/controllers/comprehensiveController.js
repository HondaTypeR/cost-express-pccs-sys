const { query } = require('../../db');

// 1. 获取综合管理列表（无分页，支持按项目ID/名称筛选）
const getComprehensiveList = async (req, res) => {
    try {
        const { project_id = '', keyword = '' } = req.query;

        // 构建查询条件
        let whereSql = '1=1';
        const params = [];
        if (project_id) {
            whereSql += ' AND project_id = ?';
            params.push(project_id);
        }
        if (keyword) {
            whereSql += ' AND (project_name LIKE ? OR phase_num LIKE ? OR specific_part LIKE ?)';
            params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
        }

        // 查询综合管理列表
        const listResult = await query(
            `SELECT management_id, project_id, project_name, project_content,
              phase_num, specific_part, create_time, update_time
       FROM sys_comprehensive_management 
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

// 2. 获取综合管理详情
const getComprehensiveDetail = async (req, res) => {
    try {
        const { management_id } = req.params;

        // 参数校验
        if (!management_id) {
            return res.json({
                code: 400,
                msg: '综合管理ID不能为空',
                data: null
            });
        }

        // 查询详情
        const detailResult = await query(
            `SELECT management_id, project_id, project_name, project_content,
              phase_num, specific_part, create_time, update_time
       FROM sys_comprehensive_management WHERE management_id = ?`,
            [management_id]
        );
        const detail = Array.isArray(detailResult) ? detailResult : detailResult?.results || [];

        if (detail.length === 0) {
            return res.json({
                code: 404,
                msg: '综合管理记录不存在',
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

// 3. 新增综合管理记录（校验关联的项目是否存在）
const addComprehensive = async (req, res) => {
    try {
        const {
            project_id, project_name, project_content = '',
            phase_num = '', specific_part = ''
        } = req.body;

        // 必传参数校验
        if (!project_id) {
            return res.json({
                code: 400,
                msg: '项目ID不能为空',
                data: null
            });
        }
        if (!project_name) {
            return res.json({
                code: 400,
                msg: '项目名称不能为空',
                data: null
            });
        }

        // 校验关联的项目是否存在（外键关联校验）
        const projectExistResult = await query(
            'SELECT project_id FROM sys_project WHERE project_id = ?',
            [project_id]
        );
        const projectExist = Array.isArray(projectExistResult) ? projectExistResult : projectExistResult?.results || [];
        if (projectExist.length === 0) {
            return res.json({
                code: 400,
                msg: '关联的项目不存在，请确认项目ID',
                data: null
            });
        }

        // 插入数据（适配TEXT字段无默认值）
        const insertResult = await query(
            `INSERT INTO sys_comprehensive_management (
        project_id, project_name, project_content, phase_num, specific_part
      ) VALUES (?, ?, ?, ?, ?)`,
            [
                project_id, project_name, project_content,
                phase_num, specific_part
            ]
        );

        const insertId = insertResult.insertId || (Array.isArray(insertResult) ? insertResult[0]?.insertId : null);

        res.json({
            code: 200,
            msg: '新增综合管理记录成功',
            data: { management_id: insertId }
        });
    } catch (err) {
        res.json({
            code: 500,
            msg: '服务器错误：' + err.message,
            data: null
        });
    }
};

// 4. 修改综合管理记录
const updateComprehensive = async (req, res) => {
    try {
        const { management_id } = req.body;
        const {
            project_id, project_name, project_content,
            phase_num, specific_part
        } = req.body;

        // 基础参数校验
        if (!management_id) {
            return res.json({
                code: 400,
                msg: '综合管理ID不能为空',
                data: null
            });
        }
        if (!project_id) {
            return res.json({
                code: 400,
                msg: '项目ID不能为空',
                data: null
            });
        }
        if (!project_name) {
            return res.json({
                code: 400,
                msg: '项目名称不能为空',
                data: null
            });
        }

        // 校验综合管理记录是否存在
        const existResult = await query(
            'SELECT management_id FROM sys_comprehensive_management WHERE management_id = ?',
            [management_id]
        );
        const exist = Array.isArray(existResult) ? existResult : existResult?.results || [];
        if (exist.length === 0) {
            return res.json({
                code: 404,
                msg: '综合管理记录不存在，无法修改',
                data: null
            });
        }

        // 校验关联的项目是否存在
        const projectExistResult = await query(
            'SELECT project_id FROM sys_project WHERE project_id = ?',
            [project_id]
        );
        const projectExist = Array.isArray(projectExistResult) ? projectExistResult : projectExistResult?.results || [];
        if (projectExist.length === 0) {
            return res.json({
                code: 400,
                msg: '关联的项目不存在，请确认项目ID',
                data: null
            });
        }

        // 执行更新
        const updateResult = await query(
            `UPDATE sys_comprehensive_management SET
        project_id = ?, project_name = ?, project_content = ?,
        phase_num = ?, specific_part = ?
      WHERE management_id = ?`,
            [
                project_id, project_name, project_content || '',
                phase_num || '', specific_part || '',
                management_id
            ]
        );

        const affectedRows = updateResult.affectedRows || (Array.isArray(updateResult) ? updateResult[0]?.affectedRows : 0);
        if (affectedRows > 0) {
            res.json({
                code: 200,
                msg: '修改综合管理记录成功',
                data: { management_id }
            });
        } else {
            res.json({
                code: 400,
                msg: '修改综合管理记录失败，未更新任何数据',
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

// 5. 删除综合管理记录
const deleteComprehensive = async (req, res) => {
    try {
        const { management_id } = req.body;

        // 1. 基础参数校验
        if (!management_id) {
            return res.json({
                code: 400,
                msg: '综合管理ID不能为空',
                data: null
            });
        }

        // 2. 查询记录是否存在
        const existResult = await query(
            'SELECT management_id FROM sys_comprehensive_management WHERE management_id = ?',
            [management_id]
        );
        const exist = Array.isArray(existResult) ? existResult : existResult?.results || [];

        if (exist.length === 0) {
            return res.json({
                code: 404,
                msg: '综合管理记录不存在，无法删除',
                data: null
            });
        }

        // 3. 执行删除操作
        const deleteResult = await query(
            'DELETE FROM sys_comprehensive_management WHERE management_id = ?',
            [management_id]
        );

        const affectedRows = deleteResult.affectedRows || (Array.isArray(deleteResult) ? deleteResult[0]?.affectedRows : 0);
        if (affectedRows > 0) {
            res.json({
                code: 200,
                msg: '综合管理记录删除成功',
                data: null
            });
        } else {
            res.json({
                code: 400,
                msg: '综合管理记录删除失败，未执行删除操作',
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

// 导出所有接口方法
module.exports = {
    getComprehensiveList,
    getComprehensiveDetail,
    addComprehensive,
    updateComprehensive,
    deleteComprehensive
};