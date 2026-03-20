const { query } = require('../../db');

// 1. 获取补充合同列表（无分页，支持多字段筛选）
const getSubContractList = async (req, res) => {
    try {
        const {
            sub_contract_id = '',
            own_contract_id = '',
            project_name = '',
            party_b = '',
            term = '',
            type = ''
        } = req.body || {};

        let whereSql = '1=1';
        const params = [];

        if (sub_contract_id) {
            whereSql += ' AND sub_contract_id = ?';
            params.push(sub_contract_id);
        }
        if (own_contract_id) {
            whereSql += ' AND own_contract_id = ?';
            params.push(own_contract_id);
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

        const listResult = await query(
            `SELECT sub_contract_id, own_contract_id, party_a, party_b, party_b_id, project_id, project_name, contract_amount,
              account_paid, wait_account_paid, term,
              project_content, type, contract_type, material_name, people_name, other_name, machinery_name,
              contract_attachment, create_time, update_time
       FROM sys_sub_contract
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

// 2. 新增补充合同
const addSubContract = async (req, res) => {
    try {
        const {
            own_contract_id,
            party_a,
            party_b,
            party_b_id,
            project_id,
            project_name,
            contract_amount = 0.0,
            account_paid,
            term = '',
            project_content = '',
            type = '',
            contract_type = '1',
            material_name = '',
            people_name = '',
            other_name = '',
            machinery_name = '',
            contract_attachment = ''
        } = req.body;

        if (!own_contract_id) {
            return res.json({ code: 400, msg: '主合同ID（own_contract_id）不能为空', data: null });
        }
        if (!party_a) {
            return res.json({ code: 400, msg: '甲方不能为空', data: null });
        }
        if (!party_b) {
            return res.json({ code: 400, msg: '乙方不能为空', data: null });
        }

        const mainResult = await query(
            'SELECT contract_id FROM sys_contract WHERE contract_id = ?',
            [own_contract_id]
        );
        const main = Array.isArray(mainResult) ? mainResult : mainResult?.results || [];
        if (main.length === 0) {
            return res.json({ code: 404, msg: '主合同不存在，无法新增补充合同', data: null });
        }

        const finalContractAmount = Number(contract_amount) || 0;
        const finalAccountPaid = account_paid !== undefined ? Number(account_paid) || 0 : 0;
        const waitAccountPaid = finalContractAmount - finalAccountPaid;

        const insertResult = await query(
            `INSERT INTO sys_sub_contract (
                own_contract_id,
                party_a, party_b, party_b_id, project_id, project_name,
                contract_amount, account_paid, wait_account_paid,
                term, project_content,
                type, contract_type,
                material_name, people_name, other_name, machinery_name,
                contract_attachment
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                own_contract_id,
                party_a, party_b, party_b_id, project_id, project_name,
                finalContractAmount, finalAccountPaid, waitAccountPaid,
                term, project_content,
                type, contract_type,
                material_name, people_name, other_name, machinery_name,
                contract_attachment
            ]
        );

        const insertId = insertResult.insertId || (Array.isArray(insertResult) ? insertResult[0]?.insertId : null);

        try {
            await query(
                'UPDATE sys_contract SET contract_amount = contract_amount + ?, wait_account_paid = wait_account_paid + ? WHERE contract_id = ?',
                [finalContractAmount, finalContractAmount, own_contract_id]
            );
        } catch (syncErr) {
            if (insertId) {
                await query('DELETE FROM sys_sub_contract WHERE sub_contract_id = ?', [insertId]);
            }
            throw syncErr;
        }

        res.json({
            code: 200,
            msg: '新增补充合同成功',
            data: { sub_contract_id: insertId }
        });
    } catch (err) {
        res.json({
            code: 500,
            msg: '服务器错误：' + err.message,
            data: null
        });
    }
};

// 3. 修改补充合同（全量更新）
const updateSubContract = async (req, res) => {
    try {
        const { sub_contract_id } = req.body;
        const {
            own_contract_id,
            party_a,
            party_b,
            party_b_id,
            project_id,
            project_name,
            contract_amount,
            account_paid,
            term,
            project_content,
            type,
            contract_type,
            material_name,
            people_name,
            other_name,
            machinery_name,
            contract_attachment
        } = req.body;

        if (!sub_contract_id) {
            return res.json({ code: 400, msg: '补充合同ID（sub_contract_id）不能为空', data: null });
        }

        const existResult = await query(
            `SELECT sub_contract_id, own_contract_id, party_a, party_b, party_b_id, project_id, project_name,
              contract_amount, account_paid, wait_account_paid, term, project_content, type, contract_type,
              material_name, people_name, other_name, machinery_name, contract_attachment
       FROM sys_sub_contract WHERE sub_contract_id = ?`,
            [sub_contract_id]
        );
        const exist = Array.isArray(existResult) ? existResult : existResult?.results || [];
        if (exist.length === 0) {
            return res.json({ code: 404, msg: '补充合同不存在，无法修改', data: null });
        }

        const current = exist[0];
        const targetOwnContractId = own_contract_id || current.own_contract_id;

        if (party_a !== undefined && !party_a) {
            return res.json({ code: 400, msg: '甲方不能为空', data: null });
        }
        if (party_b !== undefined && !party_b) {
            return res.json({ code: 400, msg: '乙方不能为空', data: null });
        }

        const mainResult = await query(
            'SELECT contract_id FROM sys_contract WHERE contract_id = ?',
            [targetOwnContractId]
        );
        const main = Array.isArray(mainResult) ? mainResult : mainResult?.results || [];
        if (main.length === 0) {
            return res.json({ code: 404, msg: '主合同不存在，无法修改补充合同', data: null });
        }

        const oldAmount = Number(current.contract_amount) || 0;
        const finalContractAmount = contract_amount !== undefined ? Number(contract_amount) || 0 : oldAmount;
        const finalAccountPaid = account_paid !== undefined ? Number(account_paid) || 0 : Number(current.account_paid) || 0;
        const waitAccountPaid = finalContractAmount - finalAccountPaid;
        const delta = finalContractAmount - oldAmount;

        const finalPartyA = party_a !== undefined ? party_a : (current.party_a || '');
        const finalPartyB = party_b !== undefined ? party_b : (current.party_b || '');
        const finalPartyBId = party_b_id !== undefined ? party_b_id : (current.party_b_id || '');
        const finalProjectId = project_id !== undefined ? project_id : (current.project_id || '');
        const finalProjectName = project_name !== undefined ? project_name : (current.project_name || '');
        const finalTerm = term !== undefined ? term : (current.term || '');
        const finalProjectContent = project_content !== undefined ? project_content : (current.project_content || '');
        const finalType = type !== undefined ? type : (current.type || '');
        const finalContractType = contract_type !== undefined ? contract_type : (current.contract_type || '1');
        const finalMaterialName = material_name !== undefined ? material_name : (current.material_name || '');
        const finalPeopleName = people_name !== undefined ? people_name : (current.people_name || '');
        const finalOtherName = other_name !== undefined ? other_name : (current.other_name || '');
        const finalMachineryName = machinery_name !== undefined ? machinery_name : (current.machinery_name || '');
        const finalAttachment = contract_attachment !== undefined ? contract_attachment : (current.contract_attachment || '');

        const updateResult = await query(
            `UPDATE sys_sub_contract SET
                own_contract_id = ?,
                party_a = ?, party_b = ?, party_b_id = ?, project_id = ?, project_name = ?,
                contract_amount = ?, account_paid = ?, wait_account_paid = ?,
                term = ?, project_content = ?,
                type = ?, contract_type = ?,
                material_name = ?, people_name = ?, other_name = ?, machinery_name = ?,
                contract_attachment = ?,
                update_time = NOW()
            WHERE sub_contract_id = ?`,
            [
                targetOwnContractId,
                finalPartyA, finalPartyB, finalPartyBId, finalProjectId, finalProjectName,
                finalContractAmount, finalAccountPaid, waitAccountPaid,
                finalTerm, finalProjectContent,
                finalType, finalContractType,
                finalMaterialName, finalPeopleName, finalOtherName, finalMachineryName,
                finalAttachment,
                sub_contract_id
            ]
        );

        const affectedRows = updateResult.affectedRows || (Array.isArray(updateResult) ? updateResult[0]?.affectedRows : 0);
        if (affectedRows <= 0) {
            return res.json({ code: 400, msg: '修改补充合同失败，未更新任何数据', data: null });
        }

        const oldOwnContractId = current.own_contract_id;
        if (oldOwnContractId !== targetOwnContractId) {
            // 移动到新的主合同：旧主合同扣除原金额，新主合同增加新金额
            if (oldAmount !== 0) {
                await query(
                    'UPDATE sys_contract SET contract_amount = contract_amount + ?, wait_account_paid = wait_account_paid + ? WHERE contract_id = ?',
                    [-oldAmount, -oldAmount, oldOwnContractId]
                );
            }
            if (finalContractAmount !== 0) {
                await query(
                    'UPDATE sys_contract SET contract_amount = contract_amount + ?, wait_account_paid = wait_account_paid + ? WHERE contract_id = ?',
                    [finalContractAmount, finalContractAmount, targetOwnContractId]
                );
            }
        } else if (delta !== 0) {
            await query(
                'UPDATE sys_contract SET contract_amount = contract_amount + ?, wait_account_paid = wait_account_paid + ? WHERE contract_id = ?',
                [delta, delta, targetOwnContractId]
            );
        }

        res.json({
            code: 200,
            msg: '修改补充合同成功',
            data: { sub_contract_id }
        });
    } catch (err) {
        res.json({
            code: 500,
            msg: '服务器错误：' + err.message,
            data: null
        });
    }
};

// 4. 删除补充合同
const deleteSubContract = async (req, res) => {
    try {
        const { sub_contract_id } = req.body;
        if (!sub_contract_id) {
            return res.json({ code: 400, msg: '补充合同ID（sub_contract_id）不能为空', data: null });
        }

        const existResult = await query(
            'SELECT sub_contract_id, own_contract_id, contract_amount FROM sys_sub_contract WHERE sub_contract_id = ?',
            [sub_contract_id]
        );
        const exist = Array.isArray(existResult) ? existResult : existResult?.results || [];
        if (exist.length === 0) {
            return res.json({ code: 404, msg: '补充合同不存在，无法删除', data: null });
        }

        const current = exist[0];
        const ownContractId = current.own_contract_id;
        const oldAmount = Number(current.contract_amount) || 0;

        const deleteResult = await query(
            'DELETE FROM sys_sub_contract WHERE sub_contract_id = ?',
            [sub_contract_id]
        );
        const affectedRows = deleteResult.affectedRows || (Array.isArray(deleteResult) ? deleteResult[0]?.affectedRows : 0);
        if (affectedRows <= 0) {
            return res.json({ code: 400, msg: '补充合同删除失败，未执行删除操作', data: null });
        }

        if (oldAmount !== 0) {
            await query(
                'UPDATE sys_contract SET contract_amount = contract_amount + ?, wait_account_paid = wait_account_paid + ? WHERE contract_id = ?',
                [-oldAmount, -oldAmount, ownContractId]
            );
        }

        res.json({
            code: 200,
            msg: '补充合同删除成功',
            data: null
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
    getSubContractList,
    addSubContract,
    updateSubContract,
    deleteSubContract
};
