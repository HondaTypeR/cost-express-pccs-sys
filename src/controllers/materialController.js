const { query } = require('../../db');

// 状态枚举映射（便于前端展示）
const AUDIT_STATUS_MAP = {
    0: '待审核',
    1: '审核通过',
    2: '审核驳回'
};
const DOCUMENT_STATUS_MAP = {
    0: '草稿',
    1: '已提交',
    2: '已验收',
    3: '已归档'
};

// 1. 获取材料管理列表（多条件筛选）
const getMaterialList = async (req, res) => {
    try {
        const {
            project_id = '', keyword = '', audit_status = '',
            document_status = '', supplier_unit = ''
        } = req.query;

        // 构建查询条件
        let whereSql = '1=1';
        const params = [];
        if (project_id) {
            whereSql += ' AND project_id = ?';
            params.push(project_id);
        }
        if (audit_status !== '') {
            whereSql += ' AND audit_status = ?';
            params.push(audit_status);
        }
        if (document_status !== '') {
            whereSql += ' AND document_status = ?';
            params.push(document_status);
        }
        if (supplier_unit) {
            whereSql += ' AND supplier_unit LIKE ?';
            params.push(`%${supplier_unit}%`);
        }
        if (keyword) {
            whereSql += ' AND (project_name LIKE ? OR material_name LIKE ? OR phase_num LIKE ?)';
            params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
        }

        // 查询列表并拼接状态文本
        const listResult = await query(
            `SELECT material_code, project_id, project_name, supplier_unit,
              phase_num, material_name, unit, quantity, unit_price, total_price,
              acceptance_note, handler, reviewer, auditor, related_contract,
              account_paid, wait_account_paid,
              audit_status, document_status, create_time, update_time
       FROM sys_material_management 
       WHERE ${whereSql} 
       ORDER BY create_time DESC`,
            params
        );
        const list = Array.isArray(listResult) ? listResult : listResult?.results || [];

        const formattedList = list.map(item => ({
            ...item,
            audit_status_text: AUDIT_STATUS_MAP[item.audit_status] || '未知',
            document_status_text: DOCUMENT_STATUS_MAP[item.document_status] || '未知'
        }));

        res.json({
            code: 200,
            msg: '查询成功',
            data: formattedList
        });
    } catch (err) {
        res.json({
            code: 500,
            msg: '服务器错误：' + err.message,
            data: null
        });
    }
};

// 2. 获取材料管理详情（按material_code查询）
const getMaterialDetail = async (req, res) => {
    try {
        const { material_code } = req.params;

        // 参数校验
        if (!material_code || isNaN(material_code)) {
            return res.json({
                code: 400,
                msg: '材料编号不能为空且必须为数字',
                data: null
            });
        }

        // 查询详情
        const detailResult = await query(
            `SELECT material_code, project_id, project_name, supplier_unit,
              phase_num, material_name, unit, quantity, unit_price, total_price,
              acceptance_note, handler, reviewer, auditor, related_contract,
              audit_status, document_status, create_time, update_time
       FROM sys_material_management WHERE material_code = ?`,
            [material_code]
        );
        const detail = Array.isArray(detailResult) ? detailResult : detailResult?.results || [];

        if (detail.length === 0) {
            return res.json({
                code: 404,
                msg: '材料记录不存在',
                data: null
            });
        }

        // 补充状态文本
        const formattedDetail = {
            ...detail[0],
            audit_status_text: AUDIT_STATUS_MAP[detail[0].audit_status] || '未知',
            document_status_text: DOCUMENT_STATUS_MAP[detail[0].document_status] || '未知'
        };

        res.json({
            code: 200,
            msg: '查询成功',
            data: formattedDetail
        });
    } catch (err) {
        res.json({
            code: 500,
            msg: '服务器错误：' + err.message,
            data: null
        });
    }
};

// 3. 新增材料管理记录（自动计算合价）
const addMaterial = async (req, res) => {
    try {
        const {
            project_id, project_name, supplier_unit = '', phase_num = '',
            material_name = '', unit = '', quantity = 0.00, unit_price = 0.00,
            total_price, acceptance_note = '', handler = '', reviewer = '',
            auditor = '', related_contract = '', audit_status = 0,
            document_status = 0
        } = req.body;

        // 必传参数校验
        if (!project_id || isNaN(project_id)) {
            return res.json({
                code: 400,
                msg: '项目ID不能为空且必须为数字',
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

        // 校验关联项目是否存在
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

        // 校验状态值合法性
        if (![0, 1, 2].includes(Number(audit_status))) {
            return res.json({
                code: 400,
                msg: '审核状态只能是0（待审核）、1（审核通过）、2（审核驳回）',
                data: null
            });
        }
        if (![0, 1, 2, 3].includes(Number(document_status))) {
            return res.json({
                code: 400,
                msg: '单据状态只能是0（草稿）、1（已提交）、2（已验收）、3（已归档）',
                data: null
            });
        }

        // 自动计算合价（前端未传则计算，传了则用前端值）
        const finalTotalPrice = total_price || (Number(quantity) * Number(unit_price)).toFixed(2);

        // 校验合同总价限制（如果有关联合同）
        if (related_contract && String(related_contract).trim() !== '') {
            // 1. 查询合同总金额
            const contractResult = await query(
                'SELECT contract_amount FROM sys_contract WHERE contract_id = ?',
                [related_contract]
            );
            const contract = Array.isArray(contractResult) ? contractResult : contractResult?.results || [];

            if (contract.length > 0) {
                const contractAmount = Number(contract[0].contract_amount) || 0;

                // 2. 查询该合同下所有材料管理的总价
                const materialSumResult = await query(
                    'SELECT COALESCE(SUM(total_price), 0) as total FROM sys_material_management WHERE related_contract = ?',
                    [related_contract]
                );
                const materialSum = Number((Array.isArray(materialSumResult) ? materialSumResult[0] : materialSumResult?.results?.[0])?.total || 0);

                // 3. 查询该合同下所有机械管理的总价
                const mechanicalSumResult = await query(
                    'SELECT COALESCE(SUM(total_price), 0) as total FROM sys_mechanical_management WHERE related_contract = ?',
                    [related_contract]
                );
                const mechanicalSum = Number((Array.isArray(mechanicalSumResult) ? mechanicalSumResult[0] : mechanicalSumResult?.results?.[0])?.total || 0);

                // 4. 查询该合同下所有人工管理的总价
                const artificialSumResult = await query(
                    'SELECT COALESCE(SUM(total_price), 0) as total FROM sys_artificial_management WHERE related_contract = ?',
                    [related_contract]
                );
                const artificialSum = Number((Array.isArray(artificialSumResult) ? artificialSumResult[0] : artificialSumResult?.results?.[0])?.total || 0);

                // 5. 计算总和并校验
                const currentTotal = materialSum + mechanicalSum + artificialSum + Number(finalTotalPrice);

                if (currentTotal > contractAmount) {
                    return res.json({
                        code: 400,
                        msg: `当前创建单据已经超过合同总价，不能创建（合同总价：${contractAmount}，已使用：${(materialSum + mechanicalSum + artificialSum).toFixed(2)}，本次：${finalTotalPrice}，总计：${currentTotal.toFixed(2)}）`,
                        data: null
                    });
                }
            }
        }

        // 插入数据（material_code自增，无需传）
        // account_paid 默认为 0，wait_account_paid 默认等于 total_price
        const insertResult = await query(
            `INSERT INTO sys_material_management (
        project_id, project_name, supplier_unit, phase_num, material_name,
        unit, quantity, unit_price, total_price, acceptance_note,
        handler, reviewer, auditor, related_contract, account_paid, wait_account_paid,
        audit_status, document_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                project_id, project_name, supplier_unit, phase_num, material_name,
                unit, quantity, unit_price, finalTotalPrice, acceptance_note,
                handler, reviewer, auditor, related_contract, 0, finalTotalPrice,
                audit_status, document_status
            ]
        );

        const materialCode = insertResult.insertId || (Array.isArray(insertResult) ? insertResult[0]?.insertId : null);

        res.json({
            code: 200,
            msg: '新增材料记录成功',
            data: { material_code: materialCode }
        });
    } catch (err) {
        res.json({
            code: 500,
            msg: '服务器错误：' + err.message,
            data: null
        });
    }
};
const updateMaterial = async (req, res) => {
    try {
        const {
            material_code, project_id, project_name, supplier_unit, phase_num,
            material_name, unit, quantity, unit_price, total_price,
            acceptance_note, handler, reviewer, auditor, related_contract,
            account_paid, audit_status, document_status
        } = req.body;

        // 基础参数校验
        if (!material_code || isNaN(material_code)) {
            return res.json({
                code: 400,
                msg: '材料编号不能为空且必须为数字',
                data: null
            });
        }
        if (!project_id || isNaN(project_id)) {
            return res.json({
                code: 400,
                msg: '项目ID不能为空且必须为数字',
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

        // 校验材料记录是否存在
        const existResult = await query(
            'SELECT material_code FROM sys_material_management WHERE material_code = ?',
            [material_code]
        );
        const exist = Array.isArray(existResult) ? existResult : existResult?.results || [];
        if (exist.length === 0) {
            return res.json({
                code: 404,
                msg: '材料记录不存在，无法修改',
                data: null
            });
        }

        // 校验关联项目是否存在
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

        // 校验状态值
        if (audit_status !== undefined && ![0, 1, 2].includes(Number(audit_status))) {
            return res.json({
                code: 400,
                msg: '审核状态只能是0（待审核）、1（审核通过）、2（审核驳回）',
                data: null
            });
        }
        if (document_status !== undefined && ![0, 1, 2, 3].includes(Number(document_status))) {
            return res.json({
                code: 400,
                msg: '单据状态只能是0（草稿）、1（已提交）、2（已验收）、3（已归档）',
                data: null
            });
        }

        // 自动计算合价
        const finalQuantity = quantity || 0.00;
        const finalUnitPrice = unit_price || 0.00;
        const finalTotalPrice = total_price || (Number(finalQuantity) * Number(finalUnitPrice)).toFixed(2);

        // 校验合同总价限制（如果有关联合同）
        if (related_contract && String(related_contract).trim() !== '') {
            // 1. 查询合同总金额
            const contractResult = await query(
                'SELECT contract_amount FROM sys_contract WHERE contract_id = ?',
                [related_contract]
            );
            const contract = Array.isArray(contractResult) ? contractResult : contractResult?.results || [];

            if (contract.length > 0) {
                const contractAmount = Number(contract[0].contract_amount) || 0;

                // 2. 查询该合同下所有材料管理的总价（排除当前记录）
                const materialSumResult = await query(
                    'SELECT COALESCE(SUM(total_price), 0) as total FROM sys_material_management WHERE related_contract = ? AND material_code != ?',
                    [related_contract, material_code]
                );
                const materialSum = Number((Array.isArray(materialSumResult) ? materialSumResult[0] : materialSumResult?.results?.[0])?.total || 0);

                // 3. 查询该合同下所有机械管理的总价
                const mechanicalSumResult = await query(
                    'SELECT COALESCE(SUM(total_price), 0) as total FROM sys_mechanical_management WHERE related_contract = ?',
                    [related_contract]
                );
                const mechanicalSum = Number((Array.isArray(mechanicalSumResult) ? mechanicalSumResult[0] : mechanicalSumResult?.results?.[0])?.total || 0);

                // 4. 查询该合同下所有人工管理的总价
                const artificialSumResult = await query(
                    'SELECT COALESCE(SUM(total_price), 0) as total FROM sys_artificial_management WHERE related_contract = ?',
                    [related_contract]
                );
                const artificialSum = Number((Array.isArray(artificialSumResult) ? artificialSumResult[0] : artificialSumResult?.results?.[0])?.total || 0);

                // 5. 计算总和并校验
                const currentTotal = materialSum + mechanicalSum + artificialSum + Number(finalTotalPrice);

                if (currentTotal > contractAmount) {
                    return res.json({
                        code: 400,
                        msg: `当前修改单据已经超过合同总价，不能修改（合同总价：${contractAmount}，已使用：${(materialSum + mechanicalSum + artificialSum).toFixed(2)}，本次：${finalTotalPrice}，总计：${currentTotal.toFixed(2)}）`,
                        data: null
                    });
                }
            }
        }

        // 执行更新
        // 计算待付款金额：合价 - 已付款金额
        const finalAccountPaid = account_paid !== undefined ? account_paid : 0;
        const waitAccountPaid = Number(finalTotalPrice) - Number(finalAccountPaid);

        const updateResult = await query(
            `UPDATE sys_material_management SET
        project_id = ?, project_name = ?, supplier_unit = ?, phase_num = ?,
        material_name = ?, unit = ?, quantity = ?, unit_price = ?,
        total_price = ?, acceptance_note = ?, handler = ?, reviewer = ?,
        auditor = ?, related_contract = ?, account_paid = ?, wait_account_paid = ?,
        audit_status = ?, document_status = ?
      WHERE material_code = ?`,
            [
                project_id, project_name, supplier_unit || '', phase_num || '',
                material_name || '', unit || '', finalQuantity, finalUnitPrice,
                finalTotalPrice, acceptance_note || '', handler || '', reviewer || '',
                auditor || '', related_contract || '', finalAccountPaid, waitAccountPaid,
                audit_status || 0, document_status || 0, material_code
            ]
        );

        const affectedRows = updateResult.affectedRows || (Array.isArray(updateResult) ? updateResult[0]?.affectedRows : 0);
        if (affectedRows > 0) {
            res.json({
                code: 200,
                msg: '修改材料记录成功',
                data: { material_code }
            });
        } else {
            res.json({
                code: 400,
                msg: '修改材料记录失败，未更新任何数据',
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

// 5. 删除材料管理记录（改用POST方法）
const deleteMaterial = async (req, res) => {
    try {
        const { material_code } = req.body;

        // 参数校验
        if (!material_code || isNaN(material_code)) {
            return res.json({
                code: 400,
                msg: '材料编号不能为空且必须为数字',
                data: null
            });
        }

        // 校验记录是否存在
        const existResult = await query(
            'SELECT material_code, document_status FROM sys_material_management WHERE material_code = ?',
            [material_code]
        );
        const exist = Array.isArray(existResult) ? existResult : existResult?.results || [];
        if (exist.length === 0) {
            return res.json({
                code: 404,
                msg: '材料记录不存在，无法删除',
                data: null
            });
        }

        // 业务规则：已归档的记录禁止删除
        const documentStatus = exist[0].document_status;
        if (documentStatus === 3) {
            return res.json({
                code: 400,
                msg: '已归档的材料记录禁止删除',
                data: null
            });
        }

        // 执行删除
        const deleteResult = await query(
            'DELETE FROM sys_material_management WHERE material_code = ?',
            [material_code]
        );

        const affectedRows = deleteResult.affectedRows || (Array.isArray(deleteResult) ? deleteResult[0]?.affectedRows : 0);
        if (affectedRows > 0) {
            res.json({
                code: 200,
                msg: '删除材料记录成功',
                data: { material_code }
            });
        } else {
            res.json({
                code: 400,
                msg: '删除材料记录失败',
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
// 6. 发起审批接口
const submitApproval = async (req, res) => {
    try {
        const {
            material_code, // 材料编号（必填）
            user_id, // 审批人ID（userId）
            document_status, // 当前单据状态
            approval_time // 当前时间（不传则用系统时间）
        } = req.body;

        // 1. 必传参数校验
        if (!material_code || isNaN(material_code)) {
            return res.json({
                code: 400,
                msg: '材料编号不能为空且必须为数字',
                data: null
            });
        }
        if (!user_id || isNaN(user_id)) {
            return res.json({
                code: 400,
                msg: '审批人ID（userId）不能为空且必须为数字',
                data: null
            });
        }
        if (document_status === undefined || ![0, 1, 2, 3].includes(Number(document_status))) {
            return res.json({
                code: 400,
                msg: '单据状态只能是0（草稿）、1（发起审核）、2（复审通过）、3（已归档）',
                data: null
            });
        }

        // 2. 校验材料记录是否存在
        const existResult = await query(
            'SELECT material_code, document_status, auditor FROM sys_material_management WHERE material_code = ?',
            [material_code]
        );
        const exist = Array.isArray(existResult) ? existResult : existResult?.results || [];
        if (exist.length === 0) {
            return res.json({
                code: 404,
                msg: '材料记录不存在，无法发起审批',
                data: null
            });
        }

        // 3. 业务规则校验：只有「草稿/已提交」状态可发起审批，已验收/已归档禁止
        const currentDocStatus = exist[0].document_status;
        if ([2, 3].includes(currentDocStatus)) {
            return res.json({
                code: 400,
                msg: `当前单据状态为${currentDocStatus === 2 ? '已验收' : '已归档'}，禁止发起审批`,
                data: null
            });
        }

        // 4. 处理审批时间（前端传则用前端值，否则用系统当前时间）
        const finalApprovalTime = approval_time || new Date().toISOString().slice(0, 19).replace('T', ' ');

        // 5. 根据 document_status 决定更新 reviewer 还是 auditor
        let updateSql, updateParams;
        if (document_status == 1) {
            // document_status = 1 时，更新 reviewer
            updateSql = `UPDATE sys_material_management SET
                reviewer = ?, 
                document_status = 1, 
                update_time = ? 
                WHERE material_code = ?`;
            updateParams = [user_id, finalApprovalTime, material_code];
        } else if (document_status == 2) {
            // document_status = 2 时，更新 auditor
            updateSql = `UPDATE sys_material_management SET
                auditor = ?, 
                document_status = 2, 
                update_time = ? 
                WHERE material_code = ?`;
            updateParams = [user_id, finalApprovalTime, material_code];
        }

        const updateResult = await query(updateSql, updateParams);


        const affectedRows = updateResult.affectedRows || (Array.isArray(updateResult) ? updateResult[0]?.affectedRows : 0);
        if (affectedRows > 0) {
            let params;
            if (document_status == 1) {
                params = {
                    material_code,
                    reviewer: user_id, // 审核人ID
                    document_status: 1, // 审批后状态改为已提交
                    approval_time: finalApprovalTime // 审批时间
                };
            }
            if (document_status === 2) {
                params = {
                    material_code,
                    auditor: user_id, // 审核人ID
                    document_status: 2, // 审批后状态改为已提交
                    approval_time: finalApprovalTime // 审批时间
                };
            }

            res.json({
                code: 200,
                msg: '发起审批成功',
                data: params
            });
        } else {
            res.json({
                code: 400,
                msg: '发起审批失败，未更新任何数据',
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
// 7. 审批通过接口（新增mark字段存储理由）
const approveMaterial = async (req, res) => {
    try {
        const {
            material_code,
            user_id,
            approval_note = '', // 审批通过理由
        } = req.body;

        // 1. 必传参数校验
        if (!material_code || isNaN(material_code)) {
            return res.json({ code: 400, msg: '材料编号不能为空且必须为数字', data: null });
        }

        // 2. 校验记录存在性及当前状态
        const existResult = await query(
            'SELECT material_code, audit_status, document_status FROM sys_material_management WHERE material_code = ?',
            [material_code]
        );
        const exist = Array.isArray(existResult) ? existResult : existResult?.results || [];
        if (exist.length === 0) {
            return res.json({ code: 404, msg: '材料记录不存在', data: null });
        }

        const current = exist[0];
        // 校验：仅待审核状态可操作
        // if (current.audit_status !== 0) {
        //     const statusText = current.audit_status === 1 ? '审核通过' : '审核驳回';
        //     return res.json({ code: 400, msg: `当前单据已${statusText}，禁止重复审批`, data: null });
        // }
        // // 校验：仅复核/终审中可审批
        // if (![1, 2].includes(current.document_status)) {
        //     return res.json({ code: 400, msg: '仅复核审核中、终审审核中的单据可执行审批操作', data: null });
        // }

        // 3. 计算审批通过后的单据状态（自动升级）
        let newDocumentStatus = current.document_status;
        if (current.document_status === 1) {
            newDocumentStatus = 2; // 复核通过 → 终审审核中
        } else if (current.document_status === 2) {
            newDocumentStatus = 3; // 终审通过 → 已归档
        }

        // 4. 拼接审批理由（区分复核/终审）
        const notePrefix = current.document_status === 1 ? '[复核通过]' : '[终审通过]';
        const finalMark = approval_note ? `${notePrefix} ${approval_note}` : notePrefix;

        // 5. 执行更新（核心：将理由写入mark字段）
        const updateResult = await query(
            `UPDATE sys_material_management SET
        audit_status = 1, -- 审核通过
        document_status = ?, -- 流转后的单据状态
        auditor = ?, -- 审核人ID
        mark = ?, -- 审批通过理由（存入mark字段）
        update_time = NOW()
      WHERE material_code = ?`,
            [newDocumentStatus, user_id, finalMark, material_code]
        );

        const affectedRows = updateResult.affectedRows || (Array.isArray(updateResult) ? updateResult[0]?.affectedRows : 0);
        if (affectedRows > 0) {
            res.json({
                code: 200,
                msg: '审批通过成功',
                data: {
                    material_code,
                    audit_status: 1,
                    document_status: newDocumentStatus,
                    auditor: user_id,
                    mark: finalMark // 返回审批理由
                }
            });
        } else {
            res.json({ code: 400, msg: '审批通过失败，未更新任何数据', data: null });
        }
    } catch (err) {
        res.json({ code: 500, msg: '服务器错误：' + err.message, data: null });
    }
};

// 8. 审批驳回接口（新增mark字段存储理由）
const rejectMaterial = async (req, res) => {
    try {
        const {
            material_code,
            user_id,
            reject_note = '' // 审批驳回理由（必填）
        } = req.body;

        // 1. 必传参数校验
        if (!material_code || isNaN(material_code)) {
            return res.json({ code: 400, msg: '材料编号不能为空且必须为数字', data: null });
        }
        if (!reject_note) {
            return res.json({ code: 400, msg: '驳回备注不能为空，请说明驳回原因', data: null });
        }

        // 2. 校验记录存在性及当前状态
        const existResult = await query(
            'SELECT material_code, audit_status, document_status FROM sys_material_management WHERE material_code = ?',
            [material_code]
        );
        const exist = Array.isArray(existResult) ? existResult : existResult?.results || [];
        if (exist.length === 0) {
            return res.json({ code: 404, msg: '材料记录不存在', data: null });
        }

        const current = exist[0];

        // 3. 拼接驳回理由（区分复核/终审）
        const notePrefix = current.document_status === 1 ? '[复核驳回]' : '[终审驳回]';
        const finalMark = `${notePrefix} ${reject_note}`;

        // 4. 执行更新（核心：将理由写入mark字段）
        const updateResult = await query(
            `UPDATE sys_material_management SET
        audit_status = 2, -- 审核驳回
        document_status = 0, -- 重置为草稿
        auditor = ?, -- 审核人ID
        mark = ?, -- 审批驳回理由（存入mark字段）
        update_time = NOW()
      WHERE material_code = ?`,
            [user_id, finalMark, material_code]
        );

        const affectedRows = updateResult.affectedRows || (Array.isArray(updateResult) ? updateResult[0]?.affectedRows : 0);
        if (affectedRows > 0) {
            res.json({
                code: 200,
                msg: '审批驳回成功，单据已退回草稿',
                data: {
                    material_code,
                    audit_status: 2,
                    document_status: 0,
                    auditor: user_id,
                    mark: finalMark // 返回驳回理由
                }
            });
        } else {
            res.json({ code: 400, msg: '审批驳回失败，未更新任何数据', data: null });
        }
    } catch (err) {
        res.json({ code: 500, msg: '服务器错误：' + err.message, data: null });
    }
};

// 9. 查询所有材料、机械、人工数据（综合查询）
const getAllMaterialData = async (req, res) => {
    try {
        // 支持 supplier 或 supplier_unit 参数名，以及 data_type 类型过滤和 project_id 项目过滤
        const { supplier = '', supplier_unit = '', data_type = '', project_id = '' } = req.query;
        const supplierId = supplier || supplier_unit;

        // 构建查询条件（supplier_unit 是供应商ID，project_id 是项目ID，精确匹配）
        let whereSql = '1=1';
        const params = [];
        if (supplierId) {
            whereSql += ' AND m.supplier_unit = ?';
            params.push(supplierId);
        }
        if (project_id) {
            whereSql += ' AND m.project_id = ?';
            params.push(project_id);
        }

        // 根据 data_type 决定查询哪些表
        // data_type 可选值: material(材料), mechanical(机械), artificial(人工)
        const shouldQueryMaterial = !data_type || data_type === 'material';
        const shouldQueryMechanical = !data_type || data_type === 'mechanical';
        const shouldQueryArtificial = !data_type || data_type === 'artificial';

        // 1. 查询材料管理数据
        let materialList = [];
        if (shouldQueryMaterial) {
            const materialResult = await query(
                `SELECT 
                m.supplier_unit AS supplier,
                m.material_name,
                '' AS machinery_name,
                m.unit,
                m.quantity,
                m.unit_price AS contract_unit_price,
                m.total_price AS contract_total_price,
                m.total_price AS total_amount,
                m.account_paid,
                m.wait_account_paid,
                'material' AS data_type,
                m.material_code AS code,
                m.project_name,
                m.audit_status,
                m.document_status,
                m.create_time,
                s.supplier_bank,
                s.supplier_account
            FROM sys_material_management m
            LEFT JOIN sys_supplier s ON m.supplier_unit = s.supplier_id
            WHERE ${whereSql}
            ORDER BY m.create_time DESC`,
                params
            );
            materialList = Array.isArray(materialResult) ? materialResult : materialResult?.results || [];
        }

        // 2. 查询机械管理数据
        let mechanicalList = [];
        if (shouldQueryMechanical) {
            const mechanicalResult = await query(
                `SELECT 
                m.supplier_unit AS supplier,
                '' AS material_name,
                m.material_name AS machinery_name,
                m.unit,
                m.quantity,
                m.unit_price AS contract_unit_price,
                m.total_price AS contract_total_price,
                m.total_price AS total_amount,
                m.account_paid,
                m.wait_account_paid,
                'mechanical' AS data_type,
                m.material_code AS code,
                m.project_name,
                m.audit_status,
                m.document_status,
                m.create_time,
                s.supplier_bank,
                s.supplier_account
            FROM sys_mechanical_management m
            LEFT JOIN sys_supplier s ON m.supplier_unit = s.supplier_id
            WHERE ${whereSql}
            ORDER BY m.create_time DESC`,
                params
            );
            mechanicalList = Array.isArray(mechanicalResult) ? mechanicalResult : mechanicalResult?.results || [];
        }

        // 3. 查询人工管理数据
        let artificialList = [];
        if (shouldQueryArtificial) {
            const artificialResult = await query(
                `SELECT 
                m.supplier_unit AS supplier,
                m.material_name,
                '' AS machinery_name,
                m.unit,
                m.quantity,
                m.unit_price AS contract_unit_price,
                m.total_price AS contract_total_price,
                m.total_price AS total_amount,
                m.account_paid,
                m.wait_account_paid,
                'artificial' AS data_type,
                m.material_code AS code,
                m.project_name,
                m.audit_status,
                m.document_status,
                m.create_time,
                s.supplier_bank,
                s.supplier_account
            FROM sys_artificial_management m
            LEFT JOIN sys_supplier s ON m.supplier_unit = s.supplier_id
            WHERE ${whereSql}
            ORDER BY m.create_time DESC`,
                params
            );
            artificialList = Array.isArray(artificialResult) ? artificialResult : artificialResult?.results || [];
        }

        // 4. 合并所有数据并添加状态文本和类型文本
        const DATA_TYPE_MAP = {
            'material': '材料',
            'mechanical': '机械',
            'artificial': '人工'
        };

        const allData = [...materialList, ...mechanicalList, ...artificialList].map(item => ({
            ...item,
            audit_status_text: AUDIT_STATUS_MAP[item.audit_status] || '未知',
            document_status_text: DOCUMENT_STATUS_MAP[item.document_status] || '未知',
            data_type_text: DATA_TYPE_MAP[item.data_type] || '未知'
        }));

        // 5. 按创建时间降序排序
        allData.sort((a, b) => new Date(b.create_time) - new Date(a.create_time));

        // 6. 统计汇总数据
        const summary = {
            totalCount: allData.length,
            materialCount: materialList.length,
            mechanicalCount: mechanicalList.length,
            artificialCount: artificialList.length,
            totalAmount: allData.reduce((sum, item) => sum + Number(item.total_amount || 0), 0).toFixed(2),
            totalAccountPaid: allData.reduce((sum, item) => sum + Number(item.account_paid || 0), 0).toFixed(2),
            totalWaitAccountPaid: allData.reduce((sum, item) => sum + Number(item.wait_account_paid || 0), 0).toFixed(2)
        };

        res.json({
            code: 200,
            msg: '查询成功',
            data: {
                list: allData,
                summary
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

// 导出所有接口方法
module.exports = {
    getMaterialList,
    getMaterialDetail,
    addMaterial,
    updateMaterial,
    deleteMaterial,
    submitApproval, // 新增发起审批接口
    approveMaterial,
    getAllMaterialData,
    rejectMaterial
};