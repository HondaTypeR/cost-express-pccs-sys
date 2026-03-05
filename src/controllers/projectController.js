const { query } = require('../../db');

// 1. 获取项目列表（含所有新增字段）
const getProjectList = async (req, res) => {
    try {
        const { keyword = '' } = req.query;

        let whereSql = '1=1';
        const params = [];
        if (keyword) {
            whereSql += ' AND project_name LIKE ?';
            params.push(`%${keyword}%`);
        }

        // 查询列表时包含3个新供应商字段
        const listResult = await query(
            `SELECT project_id, project_name, project_address, land_area, 
              total_building_area, residential_area, shop_area, basement_area,
              public_area, project_content, phase_num, building_total_area,
              structure_type, budget_total_cost, additional_info1, additional_info2,
              additional_info3, material, machinery, labor, expense, material_supplier,
              machinery_supplier, labor_supplier, cost_supplier,
              create_time, update_time
       FROM sys_project 
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

// 2. 获取项目详情（含所有新增字段）
const getProjectDetail = async (req, res) => {
    try {
        const { project_id } = req.params;

        if (!project_id) {
            return res.json({
                code: 400,
                msg: '项目ID不能为空',
                data: null
            });
        }

        // 查询详情时包含3个新供应商字段
        const detailResult = await query(
            `SELECT project_id, project_name, project_address, land_area, 
              total_building_area, residential_area, shop_area, basement_area,
              public_area, project_content, phase_num, building_total_area,
              structure_type, budget_total_cost, additional_info1, additional_info2,
              additional_info3, material, machinery, labor, expense, material_supplier,
              machinery_supplier, labor_supplier, cost_supplier,
              create_time, update_time
       FROM sys_project WHERE project_id = ?`,
            [project_id]
        );
        const detail = Array.isArray(detailResult) ? detailResult : detailResult?.results || [];

        if (detail.length === 0) {
            return res.json({
                code: 404,
                msg: '项目不存在',
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

// 3. 新增项目（适配3个新TEXT字段）
const addProject = async (req, res) => {
    try {
        const {
            project_name, project_address, land_area = 0.00,
            total_building_area = 0.00, residential_area = 0.00, shop_area = 0.00,
            basement_area = 0.00, public_area = 0.00, project_content = '',
            phase_num = '', building_total_area = 0.00, structure_type = '',
            budget_total_cost = 0.00, additional_info1 = '',
            additional_info2 = '', additional_info3 = '',
            material = '', machinery = '', labor = '', expense = '',
            material_supplier = '',
            machinery_supplier = '', labor_supplier = '', cost_supplier = '' // 新增3个字段，默认空字符串
        } = req.body;

        if (!project_name) {
            return res.json({
                code: 400,
                msg: '项目名称不能为空',
                data: null
            });
        }

        // 检查项目名称是否重复
        const existResult = await query(
            'SELECT project_id FROM sys_project WHERE project_name = ?',
            [project_name]
        );
        const exist = Array.isArray(existResult) ? existResult : existResult?.results || [];

        if (exist.length > 0) {
            return res.json({
                code: 400,
                msg: '项目名称已存在',
                data: null
            });
        }

        // 插入数据时包含3个新字段
        const insertResult = await query(
            `INSERT INTO sys_project (
        project_name, project_address, land_area, total_building_area,
        residential_area, shop_area, basement_area, public_area,
        project_content, phase_num, building_total_area, structure_type,
        budget_total_cost, additional_info1, additional_info2, additional_info3,
        material, machinery, labor, expense, material_supplier,
        machinery_supplier, labor_supplier, cost_supplier
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                project_name, project_address || '', land_area, total_building_area,
                residential_area, shop_area, basement_area, public_area,
                project_content, phase_num, building_total_area, structure_type,
                budget_total_cost, additional_info1, additional_info2, additional_info3,
                material, machinery, labor, expense, material_supplier,
                machinery_supplier, labor_supplier, cost_supplier // 新增字段参数
            ]
        );

        const insertId = insertResult.insertId || (Array.isArray(insertResult) ? insertResult[0]?.insertId : null);

        res.json({
            code: 200,
            msg: '新增项目成功',
            data: { project_id: insertId }
        });
    } catch (err) {
        res.json({
            code: 500,
            msg: '服务器错误：' + err.message,
            data: null
        });
    }
};

// 4. 修改项目（适配3个新TEXT字段）
const updateProject = async (req, res) => {
    try {
        const { project_id } = req.body;
        const {
            project_name, project_address, land_area,
            total_building_area, residential_area, shop_area,
            basement_area, public_area, project_content,
            phase_num, building_total_area, structure_type,
            budget_total_cost, additional_info1,
            additional_info2, additional_info3,
            material, machinery, labor, expense, material_supplier,
            machinery_supplier, labor_supplier, cost_supplier // 新增3个字段
        } = req.body;

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

        // 检查项目是否存在
        const existResult = await query(
            'SELECT project_id FROM sys_project WHERE project_id = ?',
            [project_id]
        );
        const exist = Array.isArray(existResult) ? existResult : existResult?.results || [];

        if (exist.length === 0) {
            return res.json({
                code: 404,
                msg: '项目不存在，无法修改',
                data: null
            });
        }

        // 检查项目名称是否重复（排除自身）
        const nameExistResult = await query(
            'SELECT project_id FROM sys_project WHERE project_name = ? AND project_id != ?',
            [project_name, project_id]
        );
        const nameExist = Array.isArray(nameExistResult) ? nameExistResult : nameExistResult?.results || [];

        if (nameExist.length > 0) {
            return res.json({
                code: 400,
                msg: '项目名称已存在，无法修改',
                data: null
            });
        }

        // 更新数据时包含3个新字段
        const updateResult = await query(
            `UPDATE sys_project SET
        project_name = ?, project_address = ?, land_area = ?, total_building_area = ?,
        residential_area = ?, shop_area = ?, basement_area = ?, public_area = ?,
        project_content = ?, phase_num = ?, building_total_area = ?, structure_type = ?,
        budget_total_cost = ?, additional_info1 = ?, additional_info2 = ?, additional_info3 = ?,
        material = ?, machinery = ?, labor = ?, expense = ?, material_supplier = ?,
        machinery_supplier = ?, labor_supplier = ?, cost_supplier = ?
      WHERE project_id = ?`,
            [
                project_name, project_address || '', land_area || 0.00, total_building_area || 0.00,
                residential_area || 0.00, shop_area || 0.00, basement_area || 0.00, public_area || 0.00,
                project_content || '', phase_num || '', building_total_area || 0.00, structure_type || '',
                budget_total_cost || 0.00, additional_info1 || '', additional_info2 || '', additional_info3 || '',
                material || '', machinery || '', labor || '', expense || '', material_supplier || '',
                machinery_supplier || '', labor_supplier || '', cost_supplier || '', // 新增字段参数，默认空字符串
                project_id
            ]
        );

        const affectedRows = updateResult.affectedRows || (Array.isArray(updateResult) ? updateResult[0]?.affectedRows : 0);
        if (affectedRows > 0) {
            res.json({
                code: 200,
                msg: '修改项目成功',
                data: { project_id }
            });
        } else {
            res.json({
                code: 400,
                msg: '修改项目失败，未更新任何数据',
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
    getProjectList,
    getProjectDetail,
    addProject,
    updateProject
};