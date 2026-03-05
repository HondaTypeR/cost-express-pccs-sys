const Joi = require('joi');

// 登录参数校验规则
const loginSchema = Joi.object({
    username: Joi.string().min(3).max(20).required().messages({
        'string.empty': '用户名不能为空',
        'string.min': '用户名长度不能少于3位',
        'any.required': '用户名是必填项'
    }),
    password: Joi.string().min(6).max(20).required().messages({
        'string.empty': '密码不能为空',
        'string.min': '密码长度不能少于6位',
        'any.required': '密码是必填项'
    })
});

// 校验中间件
const validateLogin = (req, res, next) => {
    const { error } = loginSchema.validate(req.body, { abortEarly: false });
    if (error) {
        // 提取错误信息
        const errMsg = error.details.map(item => item.message).join('；');
        return res.json({
            code: 400,
            msg: errMsg,
            data: null
        });
    }
    // 校验通过，执行下一步
    next();
};

module.exports = {
    validateLogin
};