const { query } = require('../../db');

// 1. 获取报销申请列表（不分页）
const getApplyList = async (req, res) => {
    try {
        const { dept, payee, document_status, audit_status } = req.body || {};
        const userId = req.user?.id;
        const isAdmin = userId === 1 || userId === 2;

        let whereSql = '1=1';
        const params = [];

        // 非管理员：只返回自己创建的或自己是审批人的数据
        if (!isAdmin) {
            whereSql += ' AND (hander = ? OR reviewer = ? OR auditor = ?)';
            params.push(userId, userId, userId);
        }

        if (dept) {
            whereSql += ' AND dept = ?';
            params.push(dept);
        }
        if (payee) {
            whereSql += ' AND payee LIKE ?';
            params.push(`%${payee}%`);
        }
        if (document_status !== undefined && document_status !== '') {
            whereSql += ' AND document_status = ?';
            params.push(document_status);
        }
        if (audit_status !== undefined && audit_status !== '') {
            whereSql += ' AND audit_status = ?';
            params.push(audit_status);
        }

        const result = await query(
            `SELECT * FROM sys_apply WHERE ${whereSql} ORDER BY id DESC`,
            params
        );
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

// 2. 获取报销申请详情
const getApplyDetail = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return res.json({
                code: 400,
                msg: 'ID不能为空',
                data: null
            });
        }

        const result = await query(
            'SELECT * FROM sys_apply WHERE id = ?',
            [id]
        );
        const list = Array.isArray(result) ? result : result?.results || [];

        if (list.length === 0) {
            return res.json({
                code: 404,
                msg: '报销申请不存在',
                data: null
            });
        }

        res.json({
            code: 200,
            msg: '查询成功',
            data: list[0]
        });
    } catch (err) {
        res.json({
            code: 500,
            msg: '服务器错误：' + err.message,
            data: null
        });
    }
};

// 3. 新增报销申请
const addApply = async (req, res) => {
    try {
        const { dept, files, info, total, payee, payee_card_no, payee_bank, mark } = req.body;
        const user_id = req.user?.id;

        // 必填校验
        if (!dept || !info || !total || !payee) {
            return res.json({
                code: 400,
                msg: '部门、报销内容、总计金额、收款人为必填项',
                data: null
            });
        }

        const insertResult = await query(
            `INSERT INTO sys_apply (
                dept, files, info, total, payee, payee_card_no, payee_bank,
                hander, reviewer, auditor, document_status, audit_status, mark,
                current_apply_level
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                dept, files || '', info, total, payee, payee_card_no || '', payee_bank || '',
                user_id || '', '', '', 0, 0, mark || '',
                'one'
            ]
        );

        const insertId = insertResult.insertId || (Array.isArray(insertResult) ? insertResult[0]?.insertId : insertResult?.insertId);

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

// 4. 更新报销申请（仅草稿可修改）
const updateApply = async (req, res) => {
    try {
        const { id, dept, files, info, total, payee, payee_card_no, payee_bank, mark } = req.body;

        if (!id) {
            return res.json({
                code: 400,
                msg: 'ID不能为空',
                data: null
            });
        }

        // 检查是否存在且为草稿状态
        const existResult = await query(
            'SELECT document_status FROM sys_apply WHERE id = ?',
            [id]
        );
        const existList = Array.isArray(existResult) ? existResult : existResult?.results || [];

        if (existList.length === 0) {
            return res.json({
                code: 404,
                msg: '报销申请不存在',
                data: null
            });
        }

        if (existList[0].document_status !== 0) {
            return res.json({
                code: 400,
                msg: '仅草稿状态的报销申请可修改',
                data: null
            });
        }

        const updateResult = await query(
            `UPDATE sys_apply SET
                dept = ?, files = ?, info = ?, total = ?, payee = ?, payee_card_no = ?, payee_bank = ?, mark = ?
            WHERE id = ?`,
            [
                dept || '', files || '', info || '', total || '', payee || '',
                payee_card_no || '', payee_bank || '', mark || '', id
            ]
        );

        const affectedRows = updateResult.affectedRows || (Array.isArray(updateResult) ? updateResult[0]?.affectedRows : 0);

        if (affectedRows > 0) {
            res.json({
                code: 200,
                msg: '更新成功',
                data: { id }
            });
        } else {
            res.json({
                code: 400,
                msg: '更新失败，未修改任何数据',
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

// 5. 删除报销申请（仅草稿可删除）
const deleteApply = async (req, res) => {
    try {
        const { id } = req.body;

        if (!id) {
            return res.json({
                code: 400,
                msg: 'ID不能为空',
                data: null
            });
        }

        // 检查是否为草稿状态
        const existResult = await query(
            'SELECT document_status FROM sys_apply WHERE id = ?',
            [id]
        );
        const existList = Array.isArray(existResult) ? existResult : existResult?.results || [];

        if (existList.length === 0) {
            return res.json({
                code: 404,
                msg: '报销申请不存在',
                data: null
            });
        }

        if (existList[0].document_status !== 0) {
            return res.json({
                code: 400,
                msg: '仅草稿状态的报销申请可删除',
                data: null
            });
        }

        const deleteResult = await query(
            'DELETE FROM sys_apply WHERE id = ?',
            [id]
        );

        const affectedRows = deleteResult.affectedRows || (Array.isArray(deleteResult) ? deleteResult[0]?.affectedRows : 0);

        if (affectedRows > 0) {
            res.json({
                code: 200,
                msg: '删除成功',
                data: { id }
            });
        } else {
            res.json({
                code: 400,
                msg: '删除失败',
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

// 6. 发起审批接口（与材料管理一致）
const submitApproval = async (req, res) => {
    try {
        const {
            id, // 申请ID（必填）
            user_id, // 审批人ID
            document_status, // 当前单据状态（1=发起审核，2=复审）
            approval_time // 当前时间（不传则用系统时间）
        } = req.body;

        // 1. 必传参数校验
        if (!id) {
            return res.json({
                code: 400,
                msg: 'ID不能为空',
                data: null
            });
        }
        if (!user_id) {
            return res.json({
                code: 400,
                msg: '审批人ID（user_id）不能为空',
                data: null
            });
        }
        if (document_status === undefined || ![1, 2].includes(Number(document_status))) {
            return res.json({
                code: 400,
                msg: '单据状态只能是1（发起审核）、2（复审）',
                data: null
            });
        }

        // 2. 校验记录是否存在
        const existResult = await query(
            'SELECT id, document_status FROM sys_apply WHERE id = ?',
            [id]
        );
        const exist = Array.isArray(existResult) ? existResult : existResult?.results || [];
        if (exist.length === 0) {
            return res.json({
                code: 404,
                msg: '报销申请不存在，无法发起审批',
                data: null
            });
        }

        // 3. 业务规则校验：只有「草稿/已提交」状态可发起审批
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
            updateSql = `UPDATE sys_apply SET
                reviewer = ?, 
                document_status = 1, 
                update_time = ? 
                WHERE id = ?`;
            updateParams = [user_id, finalApprovalTime, id];
        } else if (document_status == 2) {
            // document_status = 2 时，更新 auditor
            updateSql = `UPDATE sys_apply SET
                auditor = ?, 
                document_status = 2, 
                update_time = ? 
                WHERE id = ?`;
            updateParams = [user_id, finalApprovalTime, id];
        }

        const updateResult = await query(updateSql, updateParams);

        const affectedRows = updateResult.affectedRows || (Array.isArray(updateResult) ? updateResult[0]?.affectedRows : 0);
        if (affectedRows > 0) {
            let params;
            if (document_status == 1) {
                params = {
                    id,
                    reviewer: user_id,
                    document_status: 1,
                    approval_time: finalApprovalTime
                };
            }
            if (document_status == 2) {
                params = {
                    id,
                    auditor: user_id,
                    document_status: 2,
                    approval_time: finalApprovalTime
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

// 7. 审批通过接口（与材料管理一致）
const approveApply = async (req, res) => {
    try {
        const {
            id,
            user_id
        } = req.body;

        // 1. 必传参数校验
        if (!id) {
            return res.json({ code: 400, msg: 'ID不能为空', data: null });
        }
        if (!user_id) {
            return res.json({ code: 400, msg: '审批人ID（user_id）不能为空', data: null });
        }

        // 2. 校验记录存在性及当前状态
        const existResult = await query(
            'SELECT id, audit_status, document_status, mark FROM sys_apply WHERE id = ?',
            [id]
        );
        const exist = Array.isArray(existResult) ? existResult : existResult?.results || [];
        if (exist.length === 0) {
            return res.json({ code: 404, msg: '报销申请不存在', data: null });
        }

        const current = exist[0];

        // 3. 计算审批通过后的单据状态（自动升级）
        let newDocumentStatus = current.document_status;
        if (current.document_status === 1) {
            newDocumentStatus = 2; // 复核通过 → 终审审核中
        } else if (current.document_status === 2) {
            newDocumentStatus = 3; // 终审通过 → 已归档
        }

        // 4. 执行更新（不修改mark字段，保留原有值）
        const updateResult = await query(
            `UPDATE sys_apply SET
                audit_status = 1,
                document_status = ?,
                auditor = ?,
                update_time = NOW()
            WHERE id = ?`,
            [newDocumentStatus, user_id, id]
        );

        const affectedRows = updateResult.affectedRows || (Array.isArray(updateResult) ? updateResult[0]?.affectedRows : 0);
        if (affectedRows > 0) {
            res.json({
                code: 200,
                msg: '审批通过成功',
                data: {
                    id,
                    audit_status: 1,
                    document_status: newDocumentStatus,
                    auditor: user_id,
                    mark: current.mark // 返回原有mark值
                }
            });
        } else {
            res.json({ code: 400, msg: '审批通过失败，未更新任何数据', data: null });
        }
    } catch (err) {
        res.json({ code: 500, msg: '服务器错误：' + err.message, data: null });
    }
};

// 8. 审批驳回接口（与材料管理一致）
const rejectApply = async (req, res) => {
    try {
        const {
            id,
            user_id,
            reject_note = '' // 审批驳回理由
        } = req.body;

        // 1. 必传参数校验
        if (!id) {
            return res.json({ code: 400, msg: 'ID不能为空', data: null });
        }
        if (!user_id) {
            return res.json({ code: 400, msg: '审批人ID（user_id）不能为空', data: null });
        }
        if (!reject_note) {
            return res.json({ code: 400, msg: '驳回备注不能为空，请说明驳回原因', data: null });
        }

        // 2. 校验记录存在性及当前状态
        const existResult = await query(
            'SELECT id, audit_status, document_status, mark FROM sys_apply WHERE id = ?',
            [id]
        );
        const exist = Array.isArray(existResult) ? existResult : existResult?.results || [];
        if (exist.length === 0) {
            return res.json({ code: 404, msg: '报销申请不存在', data: null });
        }

        const current = exist[0];

        // 3. 执行更新（不修改mark字段，保留原有值）
        const updateResult = await query(
            `UPDATE sys_apply SET
                audit_status = 2,
                document_status = 0,
                auditor = ?,
                update_time = NOW()
            WHERE id = ?`,
            [user_id, id]
        );

        const affectedRows = updateResult.affectedRows || (Array.isArray(updateResult) ? updateResult[0]?.affectedRows : 0);
        if (affectedRows > 0) {
            res.json({
                code: 200,
                msg: '审批驳回成功，单据已退回草稿',
                data: {
                    id,
                    audit_status: 2,
                    document_status: 0,
                    auditor: user_id,
                    mark: current.mark // 返回原有mark值
                }
            });
        } else {
            res.json({ code: 400, msg: '审批驳回失败，未更新任何数据', data: null });
        }
    } catch (err) {
        res.json({ code: 500, msg: '服务器错误：' + err.message, data: null });
    }
};

// ==================== 新接口：基于5级审批人的审批系统 ====================

// 9. 获取报销申请列表（按5级审批人筛选）
const getApplyListByLevel = async (req, res) => {
    try {
        const { dept, payee, document_status_apply, audit_status_apply } = req.body || {};
        const userId = req.user?.id;
        const isAdmin = userId === 1 || userId === 2;

        // 只返回原审批流程（/api/business/apply/list）中终审通过的数据
        // 终审通过 = document_status = 3（已归档）且 audit_status = 1（审核通过）
        let whereSql = 'document_status = 3 AND audit_status = 1';
        const params = [];

        // 非管理员：只返回自己是某一级审批人的数据
        if (!isAdmin) {
            whereSql += ` AND (
                level_one_checker = ? OR 
                level_two_checker = ? OR 
                level_three_checker = ? OR 
                level_four_checker = ? OR 
                level_five_checker = ?
            )`;
            params.push(userId, userId, userId, userId, userId);
        }

        if (dept) {
            whereSql += ' AND dept = ?';
            params.push(dept);
        }
        if (payee) {
            whereSql += ' AND payee LIKE ?';
            params.push(`%${payee}%`);
        }
        if (document_status_apply !== undefined && document_status_apply !== '') {
            whereSql += ' AND document_status_apply = ?';
            params.push(document_status_apply);
        }
        if (audit_status_apply !== undefined && audit_status_apply !== '') {
            whereSql += ' AND audit_status_apply = ?';
            params.push(audit_status_apply);
        }

        const result = await query(
            `SELECT * FROM sys_apply WHERE ${whereSql} ORDER BY id DESC`,
            params
        );
        let list = Array.isArray(result) ? result : result?.results || [];

        // 查询部门表中结算付款审批单的5级审批人配置
        const deptResult = await query(
            `SELECT level_one_checker, level_two_checker, level_three_checker,
                level_four_checker, level_five_checker
            FROM sys_dept
            WHERE dept_name = ? AND power = ?
            LIMIT 1`,
            ['综合办', '结算付款审批单']
        );
        const deptList = Array.isArray(deptResult) ? deptResult : deptResult?.results || [];

        // 如果找到部门配置，覆盖所有记录的5级审批人字段
        if (deptList.length > 0) {
            const deptConfig = deptList[0];
            list = list.map(item => ({
                ...item,
                level_one_checker: deptConfig.level_one_checker,
                level_two_checker: deptConfig.level_two_checker,
                level_three_checker: deptConfig.level_three_checker,
                level_four_checker: deptConfig.level_four_checker,
                level_five_checker: deptConfig.level_five_checker
            }));
        }

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

// 10. 发起审批（5级审批人模式）- 与财务管理一致
const submitApplyWithLevels = async (req, res) => {
    try {
        const { id, next_checker } = req.body;

        // 1. 必传参数校验
        if (!id) {
            return res.json({ code: 400, msg: 'ID不能为空', data: null });
        }
        if (!next_checker) {
            return res.json({ code: 400, msg: '下一级审批人不能为空', data: null });
        }

        // 2. 校验记录存在性及当前状态
        const existResult = await query(
            'SELECT id, document_status_apply FROM sys_apply WHERE id = ?',
            [id]
        );
        const exist = Array.isArray(existResult) ? existResult : existResult?.results || [];
        if (exist.length === 0) {
            return res.json({ code: 404, msg: '报销申请不存在', data: null });
        }

        const current = exist[0];

        // 3. 校验当前状态必须是草稿
        if (current.document_status_apply !== 0) {
            return res.json({
                code: 400,
                msg: '只有草稿状态的记录才能提交审批',
                data: null
            });
        }

        // 4. 查询部门表中结算付款审批单的5级审批人配置
        const deptResult = await query(
            `SELECT level_one_checker, level_two_checker, level_three_checker,
                level_four_checker, level_five_checker
            FROM sys_dept
            WHERE dept_name = ? AND power = ?
            LIMIT 1`,
            ['综合办', '结算付款审批单']
        );
        const deptList = Array.isArray(deptResult) ? deptResult : deptResult?.results || [];

        // 5. 组装5级审批人（优先使用传入的next_checker作为第一级，其余从dept表取）
        let levelCheckers = {
            level_one_checker: next_checker,
            level_two_checker: '',
            level_three_checker: '',
            level_four_checker: '',
            level_five_checker: ''
        };

        if (deptList.length > 0) {
            const deptConfig = deptList[0];
            // 找到next_checker在dept配置中的位置，后面的级别顺延
            const checkers = [
                deptConfig.level_one_checker,
                deptConfig.level_two_checker,
                deptConfig.level_three_checker,
                deptConfig.level_four_checker,
                deptConfig.level_five_checker
            ];

            // 找到next_checker在配置中的索引
            let startIndex = checkers.findIndex(c => c == next_checker);
            if (startIndex === -1) {
                // 如果传入的审批人不在配置中，就用它作为第一级，其余按配置填充
                startIndex = 0;
                checkers[0] = next_checker;
            }

            levelCheckers = {
                level_one_checker: checkers[0] || '',
                level_two_checker: checkers[1] || '',
                level_three_checker: checkers[2] || '',
                level_four_checker: checkers[3] || '',
                level_five_checker: checkers[4] || ''
            };
        }

        // 6. 更新状态为一级审批，并设置5级审批人，current_apply_level设为'two'（表示已进入一级审批）
        const updateResult = await query(
            `UPDATE sys_apply SET
                document_status_apply = 1,
                audit_status_apply = 0,
                current_apply_level = 'two',
                level_one_checker = ?,
                level_two_checker = ?,
                level_three_checker = ?,
                level_four_checker = ?,
                level_five_checker = ?,
                update_time = NOW()
            WHERE id = ?`,
            [
                levelCheckers.level_one_checker,
                levelCheckers.level_two_checker,
                levelCheckers.level_three_checker,
                levelCheckers.level_four_checker,
                levelCheckers.level_five_checker,
                id
            ]
        );

        const affectedRows = updateResult.affectedRows || (Array.isArray(updateResult) ? updateResult[0]?.affectedRows : 0);
        if (affectedRows > 0) {
            res.json({
                code: 200,
                msg: '提交审批成功',
                data: {
                    id,
                    document_status_apply: 1,
                    audit_status_apply: 0,
                    current_apply_level: 'two',
                    next_checker,
                    ...levelCheckers
                }
            });
        } else {
            res.json({ code: 400, msg: '提交审批失败，未更新任何数据', data: null });
        }
    } catch (err) {
        res.json({ code: 500, msg: '服务器错误：' + err.message, data: null });
    }
};

// 11. 审批通过（5级审批人模式）
const approveApplyWithLevels = async (req, res) => {
    try {
        const {
            id,
            user_id,
            mark = '' // 前端传过来的审批备注，直接存储
        } = req.body;

        if (!id) {
            return res.json({ code: 400, msg: 'ID不能为空', data: null });
        }
        if (!user_id) {
            return res.json({ code: 400, msg: '审批人ID不能为空', data: null });
        }

        // 查询记录及当前审批状态
        const existResult = await query(
            `SELECT id, document_status_apply, audit_status_apply, current_apply_level,
                level_one_checker, level_two_checker, level_three_checker,
                level_four_checker, level_five_checker
            FROM sys_apply WHERE id = ?`,
            [id]
        );
        const exist = Array.isArray(existResult) ? existResult : existResult?.results || [];
        if (exist.length === 0) {
            return res.json({ code: 404, msg: '报销申请不存在', data: null });
        }

        const current = exist[0];

        const checkers = [
            current.level_one_checker,
            current.level_two_checker,
            current.level_three_checker,
            current.level_four_checker,
            current.level_five_checker
        ];

        // 根据 current_apply_level 字段判断当前审批级别（避免多审批人为同一用户时误判）
        const levelMap = ['', 'one', 'two', 'three', 'four', 'five'];
        const levelStrToNum = { one: 1, two: 2, three: 3, four: 4, five: 5 };
        const currentLevel = levelStrToNum[current.current_apply_level] || 0;

        if (currentLevel === 0) {
            return res.json({ code: 400, msg: '当前审批级别异常', data: null });
        }

        // 校验当前用户必须是当前级别的审批人
        if (checkers[currentLevel - 1] != user_id) {
            return res.json({ code: 400, msg: '您不是当前级别的指定审批人', data: null });
        }
        let newDocumentStatus = currentLevel; // 当前审批层级
        let newAuditStatus = 1; // 默认已通过
        let newCurrentApplyLevel = levelMap[currentLevel]; // 默认当前级别
        let nextLevelChecker = '';

        // 如果还有下一级审批人，流转到下一级
        if (currentLevel < 5 && checkers[currentLevel]) {
            newDocumentStatus = currentLevel + 1; // 进入下一级
            newAuditStatus = 0; // 待审批
            newCurrentApplyLevel = levelMap[currentLevel + 1]; // 下一级别字符串（关键修复）
            nextLevelChecker = checkers[currentLevel];
        }

        // 执行更新，将前端传来的mark存入数据库，并更新current_apply_level
        const updateResult = await query(
            `UPDATE sys_apply SET
                document_status_apply = ?,
                audit_status_apply = ?,
                current_apply_level = ?,
                mark = ?,
                update_time = NOW()
            WHERE id = ?`,
            [newDocumentStatus, newAuditStatus, newCurrentApplyLevel, mark, id]
        );

        const affectedRows = updateResult.affectedRows || (Array.isArray(updateResult) ? updateResult[0]?.affectedRows : 0);
        if (affectedRows > 0) {
            res.json({
                code: 200,
                msg: '审批通过成功',
                data: {
                    id,
                    document_status_apply: newDocumentStatus,
                    audit_status_apply: newAuditStatus,
                    current_apply_level: newCurrentApplyLevel,
                    current_level: currentLevel,
                    next_checker: nextLevelChecker,
                    mark
                }
            });
        } else {
            res.json({ code: 400, msg: '审批通过失败', data: null });
        }
    } catch (err) {
        res.json({ code: 500, msg: '服务器错误：' + err.message, data: null });
    }
};

// 12. 审批驳回（5级审批人模式）
const rejectApplyWithLevels = async (req, res) => {
    try {
        const {
            id,
            user_id,
            mark = '' // 前端传过来的驳回备注，直接存储
        } = req.body;

        if (!id) {
            return res.json({ code: 400, msg: 'ID不能为空', data: null });
        }
        if (!user_id) {
            return res.json({ code: 400, msg: '审批人ID不能为空', data: null });
        }

        // 查询记录
        const existResult = await query(
            `SELECT id, document_status_apply, current_apply_level,
                level_one_checker, level_two_checker, level_three_checker,
                level_four_checker, level_five_checker
            FROM sys_apply WHERE id = ?`,
            [id]
        );
        const exist = Array.isArray(existResult) ? existResult : existResult?.results || [];
        if (exist.length === 0) {
            return res.json({ code: 404, msg: '报销申请不存在', data: null });
        }

        const current = exist[0];

        const checkers = [
            current.level_one_checker,
            current.level_two_checker,
            current.level_three_checker,
            current.level_four_checker,
            current.level_five_checker
        ];

        // 根据 current_apply_level 字段判断当前审批级别
        const levelStrToNum = { one: 1, two: 2, three: 3, four: 4, five: 5 };
        const currentLevel = levelStrToNum[current.current_apply_level] || 0;

        if (currentLevel === 0) {
            return res.json({ code: 400, msg: '当前审批级别异常', data: null });
        }

        // 校验当前用户必须是当前级别的审批人
        if (checkers[currentLevel - 1] != user_id) {
            return res.json({ code: 400, msg: '您不是当前级别的指定审批人', data: null });
        }

        // 驳回后重置为草稿状态，current_apply_level重置为'one'，将前端传来的mark存入数据库
        const updateResult = await query(
            `UPDATE sys_apply SET
                audit_status_apply = 2,
                document_status_apply = 0,
                current_apply_level = 'one',
                mark = ?,
                update_time = NOW()
            WHERE id = ?`,
            [mark, id]
        );

        const affectedRows = updateResult.affectedRows || (Array.isArray(updateResult) ? updateResult[0]?.affectedRows : 0);
        if (affectedRows > 0) {
            res.json({
                code: 200,
                msg: '审批驳回成功，单据已退回草稿',
                data: {
                    id,
                    audit_status_apply: 2,
                    document_status_apply: 0,
                    current_apply_level: 'one',
                    reject_level: currentLevel,
                    mark
                }
            });
        } else {
            res.json({ code: 400, msg: '审批驳回失败', data: null });
        }
    } catch (err) {
        res.json({ code: 500, msg: '服务器错误：' + err.message, data: null });
    }
};

module.exports = {
    getApplyList,
    getApplyDetail,
    addApply,
    updateApply,
    deleteApply,
    submitApproval,
    approveApply,
    rejectApply,
    // 新接口：基于5级审批人
    getApplyListByLevel,
    submitApplyWithLevels,
    approveApplyWithLevels,
    rejectApplyWithLevels
};
