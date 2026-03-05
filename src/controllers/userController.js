const { query } = require('../../db');
const bcrypt = require('bcryptjs');
// 获取人员列表
const getUserList = async (req, res) => {
    try {
        const result = await query('SELECT * FROM sys_user');
        res.json({
            code: 200,
            data: result
        });
    } catch (err) {
        res.json({
            code: 500,
            msg: '服务器错误：' + err.message,
            data: null
        });
    }
};

const addUser = async (req, res) => {
    try {
        const { username, nickname, name, owner_dept, owner_company, status = 1, password } = req.body;

        // 检查公司名称是否重复
        const existResult = await query(
            'SELECT id FROM sys_user WHERE username = ?',
            [username]
        );
        // 适配 query 返回的结果结构
        const exist = Array.isArray(existResult) ? existResult : existResult?.results || [];

        if (exist.length > 0) {
            return res.json({
                code: 400,
                msg: '该用户名已存在',
                data: null
            });
        }

        // 插入
        const insertResult = await query(
            'INSERT INTO sys_user (username, nickname, name, owner_dept, owner_company, status, password) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [username, nickname || '', name || '', owner_dept || '', owner_company || '', status, password]
        );

        res.json({
            code: 200,
            msg: '新增成功',
            data: { id: insertResult.insertId || (Array.isArray(insertResult) ? insertResult[0]?.insertId : insertResult?.insertId) }
        });
    } catch (err) {
        res.json({
            code: 500,
            msg: '服务器错误：' + err.message,
            data: null
        });
    }
};

const updateUser = async (req, res) => {
    try {
        // POST方式：ID从请求体获取（不再从URL参数取）
        const { id, username, nickname, name, owner_dept, owner_company, status } = req.body;

        // 1. 基础参数校验
        if (!id) {
            return res.json({
                code: 400,
                msg: '员工ID不能为空',
                data: null
            });
        }
        if (!username) {
            return res.json({
                code: 400,
                msg: '用户名不能为空',
                data: null
            });
        }

        // 2. 检查公司是否存在
        const existUserResult = await query(
            'SELECT id FROM sys_user WHERE id = ?',
            [id]
        );
        const existUser = Array.isArray(existUserResult) ? existUserResult : existUserResult?.results || [];
        if (existUser.length === 0) {
            return res.json({
                code: 404,
                msg: '该员工不存在，无法编辑',
                data: null
            });
        }

        // 3. 检查用户名是否重复（排除自身）
        const existNameResult = await query(
            'SELECT id FROM sys_user WHERE username = ? AND id != ?',
            [username, id]
        );
        const existName = Array.isArray(existNameResult) ? existNameResult : existNameResult?.results || [];
        if (existName.length > 0) {
            return res.json({
                code: 400,
                msg: '用户名已存在，无法修改',
                data: null
            });
        }

        // 4. 执行更新操作
        const updateResult = await query(
            'UPDATE sys_user SET username = ?, nickname = ?, name = ?, owner_dept = ?, owner_company = ?, status = ? WHERE id = ?',
            [username, nickname || '', name || '', owner_dept || '', owner_company || '', status ?? 1, id]
        );

        // 5. 判断更新是否成功
        const affectedRows = updateResult.affectedRows || (Array.isArray(updateResult) ? updateResult[0]?.affectedRows : 0);
        if (affectedRows > 0) {
            res.json({
                code: 200,
                msg: '员工信息编辑成功',
                data: { id: id }
            });
        } else {
            res.json({
                code: 400,
                msg: '员工信息编辑失败，未修改任何数据',
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

// 修改密码接口
const changePassword = async (req, res) => {
    try {
        // 从请求体获取参数
        const { userId, oldPassword, newPassword, confirmPassword } = req.body;
        // 4. 查询用户是否存在，并获取原密码
        const userResult = await query(
            'SELECT id, password FROM sys_user WHERE id = ?',
            [userId]
        );
        const user = Array.isArray(userResult) ? userResult : userResult?.results || [];

        if (user.length === 0) {
            return res.json({
                code: 404,
                msg: '用户不存在，无法修改密码',
                data: null
            });
        }

        // 5. 验证原密码是否正确
        const isOldPwdValid = await bcrypt.compare(oldPassword, user[0].password);
        if (!isOldPwdValid) {
            return res.json({
                code: 400,
                msg: '原密码错误，请重新输入',
                data: null
            });
        }

        // 6. 加密新密码（盐值加密）
        const salt = await bcrypt.genSalt(10); // 生成盐值
        const newPwdHash = await bcrypt.hash(newPassword, salt);

        // 7. 更新数据库中的密码
        const updateResult = await query(
            'UPDATE sys_user SET password = ? WHERE id = ?',
            [newPwdHash, userId]
        );

        // 8. 判断更新是否成功
        const affectedRows = updateResult.affectedRows || (Array.isArray(updateResult) ? updateResult[0]?.affectedRows : 0);
        if (affectedRows > 0) {
            res.json({
                code: 200,
                msg: '密码修改成功，请重新登录',
                data: null
            });
        } else {
            res.json({
                code: 400,
                msg: '密码修改失败，未更新任何数据',
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

module.exports = {
    getUserList,
    addUser,
    updateUser,
    changePassword
};