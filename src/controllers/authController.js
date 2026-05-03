const { verifyPassword, generateToken } = require('../utils/authUtils');
const { query } = require('../../db');
const bcrypt = require('bcryptjs');


// 登录接口逻辑
const login = async (req, res) => {
    try {
        const { username, password } = req.body;

        // 查询用户
        const users = await query('SELECT * FROM sys_user WHERE username = ?', [username]);
        if (users.length === 0) {
            return res.json({
                code: 401,
                msg: '用户名或密码错误',
                data: null
            });
        }

        const user = users[0];

        // 验证密码（bcrypt 对比）
        const isPwdCorrect = bcrypt.compareSync(password, user.password);
        if (!isPwdCorrect) {
            return res.json({
                code: 401,
                msg: '用户名或密码错误',
                data: null
            });
        }

        // 生成 JWT 令牌
        const token = generateToken(user);
        const userInfo = {
            id: user.id,
            username: user.username,
            nickname: user.nickname,
            role: user.role,
            name: user.name,
            avatar: user.avatar
        };

        res.json({
            code: 200,
            msg: '登录成功',
            data: {
                user: userInfo,
                token: token,
                expiresIn: '2小时'
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

// 获取当前登录用户信息
const getCurrentUser = async (req, res) => {
    try {
        const { id, username } = req.user;

        // 从数据库查询用户
        const users = await query('SELECT * FROM sys_user WHERE id = ? AND username = ?', [id, username]);
        if (users.length === 0) {
            return res.json({
                code: 404,
                msg: '用户不存在',
                data: null
            });
        }

        const user = users[0];
        const userInfo = {
            id: user.id,
            username: user.username,
            nickname: user.nickname,
            role: user.role,
            name: user.name,
            avatar: user.avatar,
            owner_dept: user.owner_dept,  // 归属部门
            bankCardNo: user.bankCardNo,
            bankCardName: user.bankCardName
        };

        res.json({
            code: 200,
            msg: '获取当前用户信息成功',
            data: userInfo
        });
    } catch (err) {
        res.json({
            code: 500,
            msg: '服务器错误：' + err.message,
            data: null
        });
    }
};

// 获取用户菜单接口逻辑
const getUserMenu = async (req, res) => {
    try {
        // 从数据库查询菜单并按sort排序
        let menus = await query('SELECT * FROM sys_menus');
        const currentUserInfo = await query('SELECT * FROM sys_user WHERE id = ?', [req.user.id]);
        const curUser = currentUserInfo[0] || {};
        const menuRole = curUser.menu_role;
        const ownerDept = Number(curUser.owner_dept);

        // 部门白名单：成本部(1) / 工程部(2)
        const DEPT_MENU_WHITELIST = {
            1: ['/welcome', '/supplier', '/contract', '/sub-contract-list', '/financeManagement'],
            2: ['/welcome', '/contract', '/sub-contract-list', '/comprehensive', '/financeManagement']
        };

        if (menuRole === 'admin') {
            // admin用户返回所有菜单
            menus = menus;
        } else if (menuRole === 'user' && DEPT_MENU_WHITELIST[ownerDept]) {
            // 按部门白名单过滤
            const whitelist = DEPT_MENU_WHITELIST[ownerDept];
            const allMenus = menus;
            menus = menus.filter(item => whitelist.includes(item.path));

            // 追加：如果当前用户是某个部门的任一级审核人，把该部门的 router 菜单也加入
            const userId = curUser.id;
            if (userId) {
                const deptRouterRows = await query(
                    `SELECT router FROM sys_dept
                     WHERE router IS NOT NULL AND router <> ''
                       AND (level_one_checker = ? OR level_two_checker = ?
                            OR level_three_checker = ? OR level_four_checker = ?
                            OR level_five_checker = ?)`,
                    [userId, userId, userId, userId, userId]
                );
                const deptRouters = Array.from(new Set(
                    (deptRouterRows || [])
                        .map(r => String(r.router || '').trim())
                        .filter(Boolean)
                ));
                if (deptRouters.length > 0) {
                    const existingPaths = new Set(menus.map(m => m.path));
                    const extraMenus = allMenus.filter(m =>
                        deptRouters.includes(m.path) && !existingPaths.has(m.path)
                    );
                    menus = menus.concat(extraMenus);
                }
            }
        } else {
            // 默认仅返回 /welcome 菜单
            menus = menus.filter(item => ['/welcome', '/financeManagement'].includes(item.path));
        }

        res.json({
            code: 200,
            data: menus
        });
    } catch (err) {
        res.json({
            code: 500,
            msg: '服务器错误：' + err.message,
            data: null
        });
    }
};


// 退出登录接口
const logout = async (req, res) => {
    try {
        // 1. 获取前端传递的token（优先从请求头获取，也兼容请求体）
        const token = req.headers.authorization?.replace('Bearer ', '') || req.body.token;

        // 2. 基础校验：token不能为空
        if (!token) {
            return res.json({
                code: 400,
                msg: '退出登录失败，token不能为空',
                data: null
            });
        }

        // --------------------------
        // 方案1：简易版（无redis）- 仅提示前端清理token
        // 适合小型系统，依赖前端主动删除本地缓存的token
        // --------------------------
        res.json({
            code: 200,
            msg: '退出登录成功',
            data: {
                tip: '请清理本地存储的token（如localStorage/sessionStorage）'
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



module.exports = {
    login,
    getCurrentUser,
    getUserMenu,
    logout
};