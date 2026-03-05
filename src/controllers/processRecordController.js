const { query } = require('../../db');

// 状态枚举映射（与表结构一致）
const AUDIT_STATUS_MAP = {
    0: '待审核',
    1: '审核通过',
    2: '审核驳回'
};
const DOCUMENT_STATUS_MAP = {
    0: '草稿',
    1: '经办部门审批',
    2: '财务部审批',
    3: '复核审核中',
    4: '终审审核中',
    10: '已归档'
};

// 1. 流程记录查询接口（多条件筛选）
const getProcessRecordList = async (req, res) => {
    try {
        const {
            relation_id = '', // 关联ID（材料编号）
            handler = '', // 处理人
            audit_status = '', // 审核状态
            document_status = '', // 单据状态
            start_date = '', // 开始日期（格式：YYYY-MM-DD）
            end_date = '' // 结束日期（格式：YYYY-MM-DD）
        } = req.query;

        // 构建查询条件
        let whereSql = '1=1';
        const params = [];
        // 关联ID筛选（精准匹配）
        if (relation_id) {
            whereSql += ' AND p.relation_id = ?';
            params.push(relation_id);
        }
        // 处理人筛选（精确匹配用户ID）
        if (handler) {
            whereSql += ' AND p.handler = ?';
            params.push(handler);
        }
        // 审核状态筛选
        if (audit_status !== '') {
            whereSql += ' AND p.audit_status = ?';
            params.push(audit_status);
        }
        // 单据状态筛选
        if (document_status !== '') {
            whereSql += ' AND p.document_status = ?';
            params.push(document_status);
        }
        // 日期范围筛选
        if (start_date) {
            whereSql += ' AND DATE(p.handle_date) >= ?';
            params.push(start_date);
        }
        if (end_date) {
            whereSql += ' AND DATE(p.handle_date) <= ?';
            params.push(end_date);
        }

        // 执行查询（按处理日期倒序，关联用户表获取用户名）
        const listResult = await query(
            `SELECT p.id, p.relation_id, p.handler, u1.name AS handler_name, p.handle_opinion,
              p.audit_status, p.document_status, p.handle_date,
              p.collection_detail, p.total_amount, p.remark,
              p.other_info, p.create_time, p.update_time,
              p.handlerDept, u4.name AS handlerDept_name, p.handlerDept_opinion,
              p.finceDept, u5.name AS finceDept_name, p.finceDept_opinion,
              p.rechecker, u2.name AS rechecker_name, p.rechecker_opinion,
              p.finalChecker, u3.name AS finalChecker_name, p.finalChecker_opinion
       FROM sys_process_record p
       LEFT JOIN sys_user u1 ON p.handler = u1.id
       LEFT JOIN sys_user u2 ON p.rechecker = u2.id
       LEFT JOIN sys_user u3 ON p.finalChecker = u3.id
       LEFT JOIN sys_user u4 ON p.handlerDept = u4.id
       LEFT JOIN sys_user u5 ON p.finceDept = u5.id
       WHERE ${whereSql} 
       ORDER BY p.handle_date DESC`,
            params
        );
        const list = Array.isArray(listResult) ? listResult : listResult?.results || [];

        // 补充状态文本，便于前端展示
        const formattedList = list.map(item => ({
            ...item,
            audit_status_text: AUDIT_STATUS_MAP[item.audit_status] || '未知',
            document_status_text: DOCUMENT_STATUS_MAP[item.document_status] || '未知',
            // 格式化日期（可选，适配前端展示）
            handle_date_format: item.handle_date ? new Date(item.handle_date).toLocaleString() : ''
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

// 2. 新增流程记录接口
const addProcessRecord = async (req, res) => {
    try {
        const {
            relation_id, // 关联ID（必填，关联材料管理表的material_code）
            handler, // 处理人（必填）
            handle_opinion = '', // 处理意见（可选）
            audit_status = 0, // 审核状态（默认0-待审核）
            document_status = 0, // 单据状态（默认0-草稿）
            handle_date = null, // 处理日期（可选，不传则用系统当前时间）
            collection_detail = '', // 收款明细（可选）
            total_amount = '0.00', // 合计金额（字符串类型，默认0.00）
            remark = '', // 备注（可选，限制100字符）
            other_info = '', // 其他信息（可选）
            handlerDept = '', // 经办人部门审核人
            handlerDept_opinion = '', // 经办人部门意见
            finceDept = '', // 财务部门审核人
            finceDept_opinion = '', // 财务部门意见
            rechecker = '', // 复核人
            rechecker_opinion = '', // 复核人意见
            finalChecker = '', // 终审人
            finalChecker_opinion = '' // 终审人意见
        } = req.body;

        // 1. 必传参数校验
        if (!relation_id || isNaN(relation_id)) {
            return res.json({
                code: 400,
                msg: '关联ID不能为空且必须为数字（关联材料编号）',
                data: null
            });
        }
        if (!handler) {
            return res.json({
                code: 400,
                msg: '处理人不能为空',
                data: null
            });
        }

        // 2. 状态值合法性校验
        if (![0, 1, 2].includes(Number(audit_status))) {
            return res.json({
                code: 400,
                msg: '审核状态只能是0（待审核）、1（审核通过）、2（审核驳回）',
                data: null
            });
        }
        if (![0, 1, 2, 3, 4, 10].includes(Number(document_status))) {
            return res.json({
                code: 400,
                msg: '单据状态只能是0（草稿）、1（经办部门审批）、2（财务部审批）、3（复核审核中）、4（终审审核中）、10（已归档）',
                data: null
            });
        }

        // 3. 检查审批中的总金额是否超过待付款金额
        // 3.1 查询材料的待付款金额
        const relationIdStr = String(relation_id);
        const materialResult = await query(
            `SELECT wait_account_paid FROM sys_mechanical_management WHERE material_code = '${relationIdStr}'`,
            []
        );
        const materials = Array.isArray(materialResult) ? materialResult : materialResult?.results || [];

        if (materials.length === 0) {
            return res.json({
                code: 400,
                msg: `关联的材料记录（material_code=${relation_id}）不存在`,
                data: null
            });
        }

        const unpaidAmount = parseFloat(materials[0].wait_account_paid || 0);

        // 3.2 查询该材料所有草稿和审批中状态的流程记录总金额
        // 排除已归档（document_status=10）和已驳回（audit_status=2）的记录
        const approvalResult = await query(
            'SELECT COALESCE(SUM(total_amount), 0) as total FROM sys_process_record WHERE CAST(relation_id AS CHAR) = CAST(? AS CHAR) AND document_status != 10 AND audit_status != 2',
            [relation_id]
        );
        const approvalRecords = Array.isArray(approvalResult) ? approvalResult : approvalResult?.results || [];
        const approvalTotal = parseFloat(approvalRecords[0]?.total || 0);

        // 3.3 当前要创建的金额
        const currentAmount = parseFloat(total_amount || 0);

        // 3.4 校验：审批中总金额 + 当前金额 不能超过待付款金额
        if (approvalTotal + currentAmount > unpaidAmount) {
            return res.json({
                code: 400,
                msg: `审批中的总金额（¥${approvalTotal.toFixed(2)}）+ 当前金额（¥${currentAmount.toFixed(2)}）= ¥${(approvalTotal + currentAmount).toFixed(2)}，超过待付款金额（¥${unpaidAmount.toFixed(2)}）`,
                data: null
            });
        }

        // 4. 字段格式处理
        const finalTotalAmount = total_amount || '0.00'; // 合计金额默认值
        const finalRemark = remark.length > 100 ? remark.substring(0, 100) : remark; // 备注截断100字符
        const finalHandleDate = handle_date || new Date().toISOString().slice(0, 19).replace('T', ' '); // 处理日期

        // 5. 将用户名转换为用户ID（如果传入的是用户名）
        const getUserId = async (nameOrId) => {
            if (!nameOrId) return '';
            // 如果已经是数字ID，直接返回
            if (!isNaN(nameOrId)) return nameOrId;
            // 否则通过用户名查询用户ID
            const userResult = await query('SELECT id FROM sys_user WHERE name = ?', [nameOrId]);
            const users = Array.isArray(userResult) ? userResult : userResult?.results || [];
            return users.length > 0 ? users[0].id : nameOrId;
        };

        const finalHandler = await getUserId(handler);
        const finalHandlerDept = await getUserId(handlerDept);
        const finalFinceDept = await getUserId(finceDept);
        const finalRechecker = await getUserId(rechecker);
        const finalFinalChecker = await getUserId(finalChecker);

        // 6. 插入流程记录
        const insertResult = await query(
            `INSERT INTO sys_process_record (
        relation_id, handler, handle_opinion, audit_status,
        document_status, handle_date, collection_detail,
        total_amount, remark, other_info,
        handlerDept, handlerDept_opinion, finceDept, finceDept_opinion,
        rechecker, rechecker_opinion, finalChecker, finalChecker_opinion
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                relation_id, finalHandler, handle_opinion, audit_status,
                document_status, finalHandleDate, collection_detail,
                finalTotalAmount, finalRemark, other_info,
                finalHandlerDept, handlerDept_opinion, finalFinceDept, finceDept_opinion,
                finalRechecker, rechecker_opinion, finalFinalChecker, finalChecker_opinion
            ]
        );

        const recordId = insertResult.insertId || (Array.isArray(insertResult) ? insertResult[0]?.insertId : null);

        res.json({
            code: 200,
            msg: '流程记录创建成功',
            data: {
                id: recordId, // 新增记录的主键ID
                relation_id,
                handler,
                total_amount: finalTotalAmount,
                handle_date: finalHandleDate
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

// 3. 流程记录作废接口（逻辑作废，非物理删除）
const invalidProcessRecord = async (req, res) => {
    try {
        const {
            id, // 流程记录主键ID
            invalid_reason = '', // 作废理由（必填）
            operator = '' // 操作人（必填）
        } = req.body;

        // 1. 必传参数校验
        if (!id || isNaN(id)) {
            return res.json({
                code: 400,
                msg: '流程记录ID不能为空且必须为数字',
                data: null
            });
        }
        if (!invalid_reason) {
            return res.json({
                code: 400,
                msg: '作废理由不能为空，请说明作废原因',
                data: null
            });
        }
        if (!operator) {
            return res.json({
                code: 400,
                msg: '操作人不能为空',
                data: null
            });
        }

        // 2. 校验记录是否存在
        const existResult = await query(
            'SELECT id, other_info FROM sys_process_record WHERE id = ?',
            [id]
        );
        const exist = Array.isArray(existResult) ? existResult : existResult?.results || [];
        if (exist.length === 0) {
            return res.json({
                code: 404,
                msg: '流程记录不存在，无法作废',
                data: null
            });
        }

        // 3. 校验记录是否已作废（避免重复作废）
        const currentOtherInfo = exist[0].other_info || '';
        if (currentOtherInfo.includes('[已作废]')) {
            return res.json({
                code: 400,
                msg: '该流程记录已作废，禁止重复操作',
                data: null
            });
        }

        // 4. 执行作废操作（逻辑作废：在other_info中标记作废信息）
        const invalidInfo = `[已作废] 操作人：${operator}，作废理由：${invalid_reason}，作废时间：${new Date().toLocaleString()}`;
        const finalOtherInfo = currentOtherInfo ? `${currentOtherInfo} | ${invalidInfo}` : invalidInfo;

        const updateResult = await query(
            `UPDATE sys_process_record SET
        other_info = ?,
        update_time = NOW()
      WHERE id = ?`,
            [finalOtherInfo, id]
        );

        const affectedRows = updateResult.affectedRows || (Array.isArray(updateResult) ? updateResult[0]?.affectedRows : 0);
        if (affectedRows > 0) {
            res.json({
                code: 200,
                msg: '流程记录作废成功',
                data: {
                    id,
                    invalid_info: invalidInfo
                }
            });
        } else {
            res.json({
                code: 400,
                msg: '流程记录作废失败，未更新任何数据',
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

// 4. 提交审批接口（将草稿提交为待审批状态）
const submitProcessRecord = async (req, res) => {
    try {
        const { id, next_checker } = req.body;

        // 1. 必传参数校验
        if (!id || isNaN(id)) {
            return res.json({
                code: 400,
                msg: '流程记录ID不能为空且必须为数字',
                data: null
            });
        }

        // 2. 校验记录存在性及当前状态
        const existResult = await query(
            'SELECT id, document_status FROM sys_process_record WHERE id = ?',
            [id]
        );
        const exist = Array.isArray(existResult) ? existResult : existResult?.results || [];
        if (exist.length === 0) {
            return res.json({
                code: 404,
                msg: '流程记录不存在',
                data: null
            });
        }

        const current = exist[0];

        // 3. 校验当前状态必须是草稿
        if (current.document_status !== 0) {
            return res.json({
                code: 400,
                msg: '只有草稿状态的记录才能提交审批',
                data: null
            });
        }

        // 4. 更新状态为经办部门审批，并设置经办部门审批人，重置审批状态为待审批
        const updateResult = await query(
            `UPDATE sys_process_record SET
                document_status = 1,
                audit_status = 0,
                handlerDept = ?,
                update_time = NOW()
            WHERE id = ?`,
            [next_checker || null, id]
        );

        const affectedRows = updateResult.affectedRows || (Array.isArray(updateResult) ? updateResult[0]?.affectedRows : 0);
        if (affectedRows > 0) {
            res.json({
                code: 200,
                msg: '提交审批成功',
                data: {
                    id,
                    document_status: 1,
                    next_checker
                }
            });
        } else {
            res.json({
                code: 400,
                msg: '提交审批失败，未更新任何数据',
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

// 5. 审批通过接口
const approveProcessRecord = async (req, res) => {
    try {
        const {
            id, // 流程记录ID
            approval_note = '', // 审批通过理由
            next_checker, // 下一级审批人ID
            remark = '', // 备注
            current_document_status // 前端当前看到的单据状态（用于乐观锁校验）
        } = req.body;

        // 1. 必传参数校验
        if (!id || isNaN(id)) {
            return res.json({
                code: 400,
                msg: '流程记录ID不能为空且必须为数字',
                data: null
            });
        }

        // 2. 校验记录存在性及当前状态
        const existResult = await query(
            'SELECT id, audit_status, document_status FROM sys_process_record WHERE id = ?',
            [id]
        );
        const exist = Array.isArray(existResult) ? existResult : existResult?.results || [];
        if (exist.length === 0) {
            return res.json({
                code: 404,
                msg: '流程记录不存在',
                data: null
            });
        }

        const current = exist[0];

        // 2.1 乐观锁校验：如果前端传递了 current_document_status，校验状态是否一致
        if (current_document_status !== undefined && current_document_status !== null) {
            if (current.document_status !== Number(current_document_status)) {
                return res.json({
                    code: 400,
                    msg: '当前审批状态不是最新，请刷新后重试',
                    data: null
                });
            }
        }

        // 3. 计算审批通过后的单据状态（自动升级）和下一级审批人字段
        let newDocumentStatus = current.document_status;
        let newAuditStatus = 0; // 默认为待审批
        let notePrefix = '';
        let nextCheckerField = null; // 下一级审批人字段名

        if (current.document_status === 1) {
            // 经办部门审批通过 → 进入财务部审批
            newDocumentStatus = 2;
            newAuditStatus = 0; // 待审批
            notePrefix = '[经办部门审批通过]';
            nextCheckerField = 'finceDept'; // 设置财务部门审批人
        } else if (current.document_status === 2) {
            // 财务部审批通过 → 进入复核审核
            newDocumentStatus = 3;
            newAuditStatus = 0; // 待审批
            notePrefix = '[财务部审批通过]';
            nextCheckerField = 'rechecker'; // 设置复核人
        } else if (current.document_status === 3) {
            // 复核审核通过 → 进入终审审核
            newDocumentStatus = 4;
            newAuditStatus = 0; // 待审批
            notePrefix = '[复核通过]';
            nextCheckerField = 'finalChecker'; // 设置终审人
        } else if (current.document_status === 4) {
            // 终审审核通过 → 归档
            newDocumentStatus = 10;
            newAuditStatus = 1; // 已通过（归档）
            notePrefix = '[终审通过]';
            nextCheckerField = null; // 已归档，无需下一级审批人
        } else {
            return res.json({
                code: 400,
                msg: '当前单据状态不允许审批操作',
                data: null
            });
        }

        // 4. 拼接审批理由和备注
        const finalMark = approval_note ? `${notePrefix} ${approval_note}` : notePrefix;
        const finalRemark = remark || '';

        // 5. 执行更新（包括设置下一级审批人）
        let updateSql = `UPDATE sys_process_record SET
            audit_status = ?,
            document_status = ?,
            remark = ?,
            update_time = NOW()`;

        const updateParams = [newAuditStatus, newDocumentStatus, finalRemark];

        // 如果有下一级审批人，添加到更新语句中
        if (nextCheckerField && next_checker) {
            updateSql += `, ${nextCheckerField} = ?`;
            updateParams.push(next_checker);
        }

        // 终审时添加乐观锁：确保状态未被其他操作修改
        if (current.document_status === 4) {
            updateSql += ` WHERE id = ? AND document_status = ? AND audit_status = ?`;
            updateParams.push(id, current.document_status, current.audit_status);
        } else {
            updateSql += ` WHERE id = ?`;
            updateParams.push(id);
        }

        const updateResult = await query(updateSql, updateParams);

        const affectedRows = updateResult.affectedRows || (Array.isArray(updateResult) ? updateResult[0]?.affectedRows : 0);

        // 终审时如果更新失败，可能是状态已变化
        if (affectedRows === 0 && current.document_status === 4) {
            return res.json({
                code: 400,
                msg: '当前审批状态不是最新，请刷新后重试',
                data: null
            });
        }

        if (affectedRows > 0) {
            res.json({
                code: 200,
                msg: '审批通过成功',
                data: {
                    id,
                    audit_status: newAuditStatus,
                    document_status: newDocumentStatus,
                    remark: finalMark
                }
            });
        } else {
            res.json({
                code: 400,
                msg: '审批通过失败，未更新任何数据',
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

// 5. 审批驳回接口
const rejectProcessRecord = async (req, res) => {
    try {
        const {
            id, // 流程记录ID
            reject_note = '', // 审批驳回理由（必填）
            remark = '' // 备注
        } = req.body;

        // 1. 必传参数校验
        if (!id || isNaN(id)) {
            return res.json({
                code: 400,
                msg: '流程记录ID不能为空且必须为数字',
                data: null
            });
        }
        if (!reject_note) {
            return res.json({
                code: 400,
                msg: '驳回理由不能为空，请说明驳回原因',
                data: null
            });
        }

        // 2. 校验记录存在性及当前状态
        const existResult = await query(
            'SELECT id, audit_status, document_status FROM sys_process_record WHERE id = ?',
            [id]
        );
        const exist = Array.isArray(existResult) ? existResult : existResult?.results || [];
        if (exist.length === 0) {
            return res.json({
                code: 404,
                msg: '流程记录不存在',
                data: null
            });
        }

        const current = exist[0];

        // 3. 拼接驳回理由（根据当前状态）
        let notePrefix = '';
        if (current.document_status === 1) {
            notePrefix = '[经办部门驳回]';
        } else if (current.document_status === 2) {
            notePrefix = '[财务部驳回]';
        } else if (current.document_status === 3) {
            notePrefix = '[复核驳回]';
        } else if (current.document_status === 4) {
            notePrefix = '[终审驳回]';
        } else {
            notePrefix = '[驳回]';
        }
        const finalMark = `${notePrefix} ${reject_note}`;

        // 4. 执行更新（驳回后保持单据状态不变，只修改审批状态）
        const finalRemark = remark || finalMark;
        const updateResult = await query(
            `UPDATE sys_process_record SET
                audit_status = 2,
                remark = ?,
                update_time = NOW()
            WHERE id = ?`,
            [finalRemark, id]
        );

        const affectedRows = updateResult.affectedRows || (Array.isArray(updateResult) ? updateResult[0]?.affectedRows : 0);
        if (affectedRows > 0) {
            res.json({
                code: 200,
                msg: '审批驳回成功',
                data: {
                    id,
                    audit_status: 2,
                    document_status: current.document_status,
                    remark: finalMark
                }
            });
        } else {
            res.json({
                code: 400,
                msg: '审批驳回失败，未更新任何数据',
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
    getProcessRecordList,
    addProcessRecord,
    invalidProcessRecord,
    submitProcessRecord,
    approveProcessRecord,
    rejectProcessRecord
};