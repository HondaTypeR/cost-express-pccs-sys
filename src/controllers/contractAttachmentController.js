const { getFileUrl } = require('../uploadConfig');

// 上传合同附件接口（支持多文件上传）
const uploadContractAttachment = async (req, res) => {
    try {
        // req.files 是multer解析后的文件列表
        if (!req.files || req.files.length === 0) {
            return res.json({
                code: 400,
                msg: '请选择要上传的合同附件',
                data: null
            });
        }

        // 处理上传后的文件，生成访问URL
        const fileList = req.files.map(file => {
            return {
                fileName: file.filename, // 存储的文件名
                originalName: file.originalname, // 原文件名
                fileSize: (file.size / 1024).toFixed(2) + 'KB', // 文件大小
                fileUrl: getFileUrl(file.filename) // 访问URL
            };
        });

        // 返回文件信息（前端可把fileUrl存入合同的contract_attachment字段）
        res.json({
            code: 200,
            msg: '附件上传成功',
            data: {
                fileList,
                // 拼接所有URL，方便直接存入数据库（逗号分隔）
                fileUrls: fileList.map(item => item.fileUrl).join(',')
            }
        });
    } catch (err) {
        res.json({
            code: 500,
            msg: '附件上传失败：' + err.message,
            data: null
        });
    }
};

module.exports = {
    uploadContractAttachment
};