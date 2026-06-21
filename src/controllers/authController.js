const { verifyPassword, generateToken } = require('../utils/authUtils');
const { getMenuPathsByDeptIds, getCheckerMenuPaths } = require('../utils/deptMenuUtils');
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
            bankCardName: user.bankCardName,
            isInitPass: user.isInitPass
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
        // owner_dept 支持多部门（如 '1,2,3'），解析为部门ID数组
        const ownerDepts = String(curUser.owner_dept || '')
            .split(',')
            .map(s => Number(s.trim()))
            .filter(n => !isNaN(n) && n > 0);

        const ownerPaths = await getMenuPathsByDeptIds(ownerDepts);
        const checkerPaths = await getCheckerMenuPaths(curUser.id);
        const hasDeptMenuPaths = ownerPaths.length > 0 || checkerPaths.length > 0;
        const mergedWhitelist = Array.from(new Set([
            '/welcome',
            ...ownerPaths,
            ...checkerPaths
        ]));

        if (menuRole === 'admin') {
            // admin用户返回所有菜单
            menus = menus;
        } else if (menuRole === 'user' && hasDeptMenuPaths) {
            menus = menus.filter(item => mergedWhitelist.includes(item.path));
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