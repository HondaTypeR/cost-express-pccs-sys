const { query } = require('../../db');

function toBool(value, def) {
    if (value === undefined || value === null) return def;
    const s = String(value).trim().toLowerCase();
    if (s === '1' || s === 'true' || s === 'yes') return true;
    if (s === '0' || s === 'false' || s === 'no') return false;
    return def;
}

const getProjectCostPie = async (req, res) => {
    try {
        const {
            project_id,
            phase_num = '',
            start_date = '',
            end_date = '',
            approved_only,
            include_budget
        } = req.query;

        if (!project_id) {
            return res.json({ code: 400, msg: 'project_id不能为空', data: null });
        }

        const approvedOnly = toBool(approved_only, true);
        const includeBudget = toBool(include_budget, true);

        let whereSql = 'project_id = ?';
        const baseParams = [project_id];
        if (phase_num) {
            whereSql += ' AND phase_num = ?';
            baseParams.push(phase_num);
        }
        if (approvedOnly) {
            whereSql += ' AND document_status = 3 AND audit_status = 1';
        }
        if (start_date) {
            whereSql += ' AND create_time >= ?';
            baseParams.push(start_date);
        }
        if (end_date) {
            whereSql += ' AND create_time <= ?';
            baseParams.push(end_date);
        }

        const sumByTable = async (tableName) => {
            const sql = `SELECT COALESCE(SUM(total_price), 0) AS total FROM ${tableName} WHERE ${whereSql}`;
            const rows = await query(sql, baseParams);
            const list = Array.isArray(rows) ? rows : rows?.results || [];
            const total = list.length > 0 ? Number(list[0].total || 0) : 0;
            return total;
        };

        const [materialActual, mechanicalActual, artificialActual] = await Promise.all([
            sumByTable('sys_material_management'),
            sumByTable('sys_mechanical_management'),
            sumByTable('sys_artificial_management')
        ]);

        let budgetMaterial = 0, budgetMechanical = 0, budgetArtificial = 0;

        if (includeBudget) {
            let budgetWhere = 'project_id = ?';
            const budgetParams = [project_id];
            if (phase_num) {
                budgetWhere += ' AND issue = ?';
                budgetParams.push(phase_num);
            }
            const budgetSql = `SELECT 
                COALESCE(SUM(CASE WHEN types LIKE '%材料%' OR types LIKE '%material%' THEN budget_total_price ELSE 0 END), 0) AS material_total,
                COALESCE(SUM(CASE WHEN types LIKE '%机械%' OR types LIKE '%mechan%' THEN budget_total_price ELSE 0 END), 0) AS mechanical_total,
                COALESCE(SUM(CASE WHEN types LIKE '%人工%' OR types LIKE '%labor%' OR types LIKE '%artificial%' THEN budget_total_price ELSE 0 END), 0) AS artificial_total
            FROM sys_budget WHERE ${budgetWhere}`;
            const rows = await query(budgetSql, budgetParams);
            const list = Array.isArray(rows) ? rows : rows?.results || [];
            if (list.length > 0) {
                budgetMaterial = Number(list[0].material_total || 0);
                budgetMechanical = Number(list[0].mechanical_total || 0);
                budgetArtificial = Number(list[0].artificial_total || 0);
            }
        }

        const actualGrandTotal = Number(materialActual + mechanicalActual + artificialActual);
        const budgetGrandTotal = Number(budgetMaterial + budgetMechanical + budgetArtificial);

        const items = [
            {
                type: 'material',
                label: '材料',
                actual_total: materialActual,
                budget_total: includeBudget ? budgetMaterial : null,
                variance: includeBudget ? Number(materialActual - budgetMaterial) : null,
                percent: actualGrandTotal > 0 ? materialActual / actualGrandTotal : 0
            },
            {
                type: 'mechanical',
                label: '机械',
                actual_total: mechanicalActual,
                budget_total: includeBudget ? budgetMechanical : null,
                variance: includeBudget ? Number(mechanicalActual - budgetMechanical) : null,
                percent: actualGrandTotal > 0 ? mechanicalActual / actualGrandTotal : 0
            },
            {
                type: 'artificial',
                label: '人工',
                actual_total: artificialActual,
                budget_total: includeBudget ? budgetArtificial : null,
                variance: includeBudget ? Number(artificialActual - budgetArtificial) : null,
                percent: actualGrandTotal > 0 ? artificialActual / actualGrandTotal : 0
            }
        ];

        res.json({
            code: 200,
            msg: 'ok',
            data: {
                project_id,
                filters: {
                    phase_num: phase_num || undefined,
                    start_date: start_date || undefined,
                    end_date: end_date || undefined,
                    approved_only: approvedOnly,
                    include_budget: includeBudget
                },
                items,
                summary: {
                    actual_grand_total: actualGrandTotal,
                    budget_grand_total: includeBudget ? budgetGrandTotal : null,
                    variance_total: includeBudget ? Number(actualGrandTotal - budgetGrandTotal) : null
                }
            }
        });
    } catch (err) {
        res.json({ code: 500, msg: '服务器错误：' + err.message, data: null });
    }
};

module.exports = { getProjectCostPie };
