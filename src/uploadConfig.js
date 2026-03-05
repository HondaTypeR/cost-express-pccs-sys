const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 1. 定义文件存储路径（项目根目录下的 uploads/contract 文件夹）
const uploadDir = path.join(__dirname, './uploads/contract');
// 确保文件夹存在，不存在则创建
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// 2. 配置multer存储规则
const storage = multer.diskStorage({
    // 存储路径
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    // 文件名：时间戳 + 原文件名（避免重复）
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname); // 获取文件后缀
        const fileName = Date.now() + '_' + file.originalname.replace(ext, '') + ext;
        cb(null, fileName);
    }
});

// 3. 文件类型过滤（仅允许上传PDF/Word/Excel/图片等合同相关文件）
const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        'application/pdf', // PDF
        'application/msword', // DOC
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
        'image/jpeg', 'image/png', 'image/jpg', // 图片
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' // Excel
    ];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('仅支持上传PDF、Word、Excel、JPG/PNG图片格式的文件！'), false);
    }
};

// 4. 创建上传实例（限制单个文件50MB，最多上传5个文件）
const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    fileFilter: fileFilter
});

module.exports = {
    upload,
    uploadDir,
    // 生成文件访问URL（前端可直接访问）
    getFileUrl: (fileName) => {
        // 假设你的服务域名是 http://localhost:3000，可根据实际修改
        return `http://localhost:3000/uploads/contract/${fileName}`;
    }
};