const { query } = require('../../db');

const normalizeRows = (result) => Array.isArray(result) ? result : result?.results || [];

const parseDeptRouter = (routerValue) =>
    String(routerValue || '')
        .split(',')
        .map(s => s.trim())
        .filter(p => p && p !== '0');

const collectRouterPaths = (rows) =>
    Array.from(new Set(normalizeRows(rows).flatMap(r => parseDeptRouter(r.router))));

const getMenuPathsByDeptIds = async (deptIds) => {
    if (!deptIds.length) return [];
    const placeholders = deptIds.map(() => '?').join(', ');
    const rows = await query(
        `SELECT router FROM sys_dept WHERE dept_id IN (${placeholders})`,
        deptIds
    );
    return collectRouterPaths(rows);
};

const getCheckerMenuPaths = async (userId) => {
    if (!userId) return [];
    const rows = await query(
        `SELECT router FROM sys_dept
         WHERE router IS NOT NULL AND router <> ''
           AND (level_one_checker = ? OR level_two_checker = ?
                OR level_three_checker = ? OR level_four_checker = ?
                OR level_five_checker = ?)`,
        [userId, userId, userId, userId, userId]
    );
    return collectRouterPaths(rows);
};

module.exports = {
    parseDeptRouter,
    getMenuPathsByDeptIds,
    getCheckerMenuPaths
};
