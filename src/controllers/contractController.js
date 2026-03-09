const { query } = require('../../db');

// 1. 获取合同列表（无分页，支持多字段筛选）
const getContractList = async (req, res) => {
    try {
        const {
            contract_id = '',
            project_name = '',
            party_b = '',
            term = '',
            type = ''
        } = req.body;

        // 构建查询条件
        let whereSql = '1=1';
        const params = [];

        if (contract_id) {
            whereSql += ' AND contract_id = ?';
            params.push(contract_id);
        }
        if (project_name) {
            whereSql += ' AND project_name LIKE ?';
            params.push(`%${project_name}%`);
        }
        if (party_b) {
            whereSql += ' AND (party_b LIKE ? OR party_b_id = ?)';
            params.push(`%${party_b}%`, party_b);
        }
        if (term) {
            whereSql += ' AND term = ?';
            params.push(term);
        }
        if (type) {
            whereSql += ' AND type = ?';
            params.push(type);
        }

        // 查询合同列表（包含所有字段）
        const listResult = await query(
            `SELECT contract_id, party_a, party_b, party_b_id, project_id,project_name, contract_amount, 
              account_paid, wait_account_paid, term,
              project_content, type, material_name, machinery_name,
              contract_attachment, create_time, update_time
       FROM sys_contract 
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

// 2. 获取合同详情
const getContractDetail = async (req, res) => {
    try {
        const { contract_id } = req.params;

        // 参数校验
        if (!contract_id) {
            return res.json({
                code: 400,
                msg: '合同ID不能为空',
                data: null
            });
        }

        // 查询合同详情
        const detailResult = await query(
            `SELECT contract_id, party_a, party_b, contract_amount, 
              account_paid, wait_account_paid, term,
              project_content, type, material_name, machinery_name,
              contract_attachment, create_time, update_time
       FROM sys_contract WHERE contract_id = ?`,
            [contract_id]
        );
        const detail = Array.isArray(detailResult) ? detailResult : detailResult?.results || [];

        if (detail.length === 0) {
            return res.json({
                code: 404,
                msg: '合同不存在',
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

// 3. 新增合同
const addContract = async (req, res) => {
    try {
        const {
            party_a, party_b, party_b_id, project_id, project_name, contract_amount = 0.00, term = '',
            project_content = '', type = '', material_name = '',
            machinery_name = '', contract_attachment = ''
        } = req.body;

        // 必传参数校验
        if (!party_a) {
            return res.json({
                code: 400,
                msg: '甲方不能为空',
                data: null
            });
        }
        if (!party_b) {
            return res.json({
                code: 400,
                msg: '乙方不能为空',
                data: null
            });
        }

        // 插入合同数据（适配TEXT字段无默认值）
        // account_paid 默认为 0，wait_account_paid 默认等于 contract_amount
        const insertResult = await query(
            `INSERT INTO sys_contract (
        party_a, party_b, party_b_id, project_id,project_name, contract_amount, account_paid, wait_account_paid, term, project_content,
        type, material_name, machinery_name, contract_attachment
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                party_a, party_b, party_b_id, project_id, project_name, contract_amount, 0, contract_amount, term, project_content,
                type, material_name, machinery_name, contract_attachment
            ]
        );

        // 获取新增合同ID
        const insertId = insertResult.insertId || (Array.isArray(insertResult) ? insertResult[0]?.insertId : null);

        // 获取供应商当前的contract_id
        const currentContractResult = await query(
            `SELECT contract_id FROM sys_supplier WHERE supplier_id = ?`,
            [party_b_id]
        );
        const supplierData = Array.isArray(currentContractResult) ? currentContractResult : currentContractResult?.results || [];
        const existingContractId = supplierData.length > 0 ? supplierData[0].contract_id : '';

        // 构建新的contract_id（逗号分隔追加）
        let newContractId;
        if (!existingContractId || existingContractId === '') {
            newContractId = String(insertId);
        } else {
            newContractId = existingContractId + ',' + insertId;
        }

        // 更新供应商的contract_id
        const updateResult = await query(
            `UPDATE sys_supplier SET contract_id = ? WHERE supplier_id = ?`,
            [newContractId, party_b_id]
        );
        console.log('updateResult', updateResult);


        res.json({
            code: 200,
            msg: '新增合同成功',
            data: { contract_id: insertId }
        });
    } catch (err) {
        res.json({
            code: 500,
            msg: '服务器错误：' + err.message,
            data: null
        });
    }
};

// 4. 修改合同
const updateContract = async (req, res) => {
    try {
        const { contract_id } = req.body;
        const {
            party_a, party_b, party_b_id, project_name, project_id, contract_amount, account_paid, term,
            project_content, type, material_name,
            machinery_name, contract_attachment
        } = req.body;

        // 基础参数校验
        if (!contract_id) {
            return res.json({
                code: 400,
                msg: '合同ID不能为空',
                data: null
            });
        }
        if (!party_a) {
            return res.json({
                code: 400,
                msg: '甲方不能为空',
                data: null
            });
        }
        if (!party_b) {
            return res.json({
                code: 400,
                msg: '乙方不能为空',
                data: null
            });
        }

        // 检查合同是否存在
        const existResult = await query(
            'SELECT contract_id FROM sys_contract WHERE contract_id = ?',
            [contract_id]
        );
        const exist = Array.isArray(existResult) ? existResult : existResult?.results || [];

        if (exist.length === 0) {
            return res.json({
                code: 404,
                msg: '合同不存在，无法修改',
                data: null
            });
        }

        // 执行更新操作
        // 计算待付款金额：合同金额 - 已付款金额
        const finalAccountPaid = account_paid !== undefined ? account_paid : 0;
        const finalContractAmount = contract_amount || 0.00;
        const waitAccountPaid = finalContractAmount - finalAccountPaid;

        const updateResult = await query(
            `UPDATE sys_contract SET
        party_a = ?, party_b = ?, party_b_id = ?, project_id = ?, project_name = ?, contract_amount = ?, 
        account_paid = ?, wait_account_paid = ?, term = ?,
        project_content = ?, type = ?, material_name = ?,
        machinery_name = ?, contract_attachment = ?
      WHERE contract_id = ?`,
            [
                party_a, party_b, party_b_id, project_id, project_name, finalContractAmount,
                finalAccountPaid, waitAccountPaid, term || '',
                project_content || '', type || '', material_name || '',
                machinery_name || '', contract_attachment || '',
                contract_id
            ]
        );

        // 判断更新是否成功
        const affectedRows = updateResult.affectedRows || (Array.isArray(updateResult) ? updateResult[0]?.affectedRows : 0);
        if (affectedRows > 0) {
            res.json({
                code: 200,
                msg: '修改合同成功',
                data: { contract_id }
            });
        } else {
            res.json({
                code: 400,
                msg: '修改合同失败，未更新任何数据',
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

// 5. 获取合同关联的所有数据（材料、机械、人工）
const getContractRelatedData = async (req, res) => {
    try {
        const { contract_id } = req.params;

        // 参数校验
        if (!contract_id) {
            return res.json({
                code: 400,
                msg: '合同ID不能为空',
                data: null
            });
        }

        // 1. 查询该合同下的所有材料管理数据
        const materialResult = await query(
            `SELECT material_code, project_id, project_name, supplier_unit, phase_num, 
              material_name, unit, quantity, unit_price, total_price, acceptance_note, 
              handler, reviewer, auditor, related_contract,
              audit_status, document_status, create_time, update_time
       FROM sys_material_management 
       WHERE related_contract = ?
       ORDER BY create_time DESC`,
            [contract_id]
        );
        const materialList = Array.isArray(materialResult) ? materialResult : materialResult?.results || [];

        // 2. 查询该合同下的所有机械管理数据
        const mechanicalResult = await query(
            `SELECT material_code, project_id, project_name, supplier_unit, phase_num, 
              material_name, unit, quantity, unit_price, total_price, acceptance_note, 
              handler, reviewer, auditor, related_contract,
              audit_status, document_status, create_time, update_time
       FROM sys_mechanical_management 
       WHERE related_contract = ?
       ORDER BY create_time DESC`,
            [contract_id]
        );
        const mechanicalList = Array.isArray(mechanicalResult) ? mechanicalResult : mechanicalResult?.results || [];

        // 3. 查询该合同下的所有人工管理数据
        const artificialResult = await query(
            `SELECT material_code, project_id, project_name, supplier_unit, phase_num, 
              material_name, unit, quantity, unit_price, total_price, acceptance_note, 
              handler, reviewer, auditor, related_contract, dept,
              audit_status, document_status, create_time, update_time
       FROM sys_artificial_management 
       WHERE related_contract = ?
       ORDER BY create_time DESC`,
            [contract_id]
        );
        const artificialList = Array.isArray(artificialResult) ? artificialResult : artificialResult?.results || [];

        // 4. 统计总价
        const materialTotal = materialList.reduce((sum, item) => sum + Number(item.total_price || 0), 0);
        const mechanicalTotal = mechanicalList.reduce((sum, item) => sum + Number(item.total_price || 0), 0);
        const artificialTotal = artificialList.reduce((sum, item) => sum + Number(item.total_price || 0), 0);
        const grandTotal = materialTotal + mechanicalTotal + artificialTotal;

        res.json({
            code: 200,
            msg: '查询成功',
            data: {
                contract_id,
                material: {
                    list: materialList,
                    count: materialList.length,
                    total: materialTotal.toFixed(2)
                },
                mechanical: {
                    list: mechanicalList,
                    count: mechanicalList.length,
                    total: mechanicalTotal.toFixed(2)
                },
                artificial: {
                    list: artificialList,
                    count: artificialList.length,
                    total: artificialTotal.toFixed(2)
                },
                summary: {
                    totalCount: materialList.length + mechanicalList.length + artificialList.length,
                    grandTotal: grandTotal.toFixed(2)
                }
            }
        });
    } catch (err) {
        res.json({
            code: 500,
            msg: '服务器错误：' + err.message,
            data: null
        });
    }
};

// 6. 删除合同
const deleteContract = async (req, res) => {
    try {
        const { contract_id } = req.body;

        // 1. 基础参数校验
        if (!contract_id) {
            return res.json({
                code: 400,
                msg: '合同ID不能为空',
                data: null
            });
        }

        // 2. 查询合同是否存在，并获取供应商ID
        const contractResult = await query(
            'SELECT contract_id, party_b_id FROM sys_contract WHERE contract_id = ?',
            [contract_id]
        );
        const contract = Array.isArray(contractResult) ? contractResult : contractResult?.results || [];

        if (contract.length === 0) {
            return res.json({
                code: 404,
                msg: '合同不存在，无法删除',
                data: null
            });
        }

        const supplierId = contract[0].party_b_id;

        // 3. 检查是否有关联的材料管理记录
        const materialResult = await query(
            'SELECT COUNT(*) as count FROM sys_material_management WHERE related_contract = ?',
            [contract_id]
        );
        const materialCount = Number((Array.isArray(materialResult) ? materialResult[0] : materialResult?.results?.[0])?.count || 0);

        if (materialCount > 0) {
            return res.json({
                code: 400,
                msg: `该合同关联了 ${materialCount} 条材料管理记录，请先删除材料管理记录后再删除合同`,
                data: null
            });
        }

        // 4. 检查是否有关联的机械管理记录
        const mechanicalResult = await query(
            'SELECT COUNT(*) as count FROM sys_mechanical_management WHERE related_contract = ?',
            [contract_id]
        );
        const mechanicalCount = Number((Array.isArray(mechanicalResult) ? mechanicalResult[0] : mechanicalResult?.results?.[0])?.count || 0);

        if (mechanicalCount > 0) {
            return res.json({
                code: 400,
                msg: `该合同关联了 ${mechanicalCount} 条机械管理记录，请先删除机械管理记录后再删除合同`,
                data: null
            });
        }

        // 5. 检查是否有关联的人工管理记录
        const artificialResult = await query(
            'SELECT COUNT(*) as count FROM sys_artificial_management WHERE related_contract = ?',
            [contract_id]
        );
        const artificialCount = Number((Array.isArray(artificialResult) ? artificialResult[0] : artificialResult?.results?.[0])?.count || 0);

        if (artificialCount > 0) {
            return res.json({
                code: 400,
                msg: `该合同关联了 ${artificialCount} 条人工管理记录，请先删除人工管理记录后再删除合同`,
                data: null
            });
        }

        // 6. 执行删除操作
        const deleteResult = await query(
            'DELETE FROM sys_contract WHERE contract_id = ?',
            [contract_id]
        );

        const affectedRows = deleteResult.affectedRows || (Array.isArray(deleteResult) ? deleteResult[0]?.affectedRows : 0);
        if (affectedRows > 0) {
            // 7. 同步更新sys_supplier表，从contract_id中移除被删除的合同ID
            if (supplierId) {
                const supplierResult = await query(
                    'SELECT contract_id FROM sys_supplier WHERE supplier_id = ?',
                    [supplierId]
                );
                const supplierData = Array.isArray(supplierResult) ? supplierResult : supplierResult?.results || [];

                if (supplierData.length > 0 && supplierData[0].contract_id) {
                    const existingContractIds = supplierData[0].contract_id;
                    // 从逗号分隔的字符串中移除当前合同ID
                    const contractIdArray = existingContractIds.split(',').filter(id => id !== String(contract_id));
                    const newContractId = contractIdArray.join(',');

                    // 更新供应商的contract_id
                    await query(
                        'UPDATE sys_supplier SET contract_id = ? WHERE supplier_id = ?',
                        [newContractId, supplierId]
                    );
                }
            }

            res.json({
                code: 200,
                msg: '合同删除成功',
                data: null
            });
        } else {
            res.json({
                code: 400,
                msg: '合同删除失败，未执行删除操作',
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
    getContractList,
    getContractDetail,
    addContract,
    updateContract,
    getContractRelatedData,
    deleteContract
};