const xlsx = require('xlsx');
const { query } = require('../../db');

/**
 * 导入Excel合同数据
 * 前端上传Excel文件，后端解析并批量插入合同数据
 */
const importContractExcel = async (req, res) => {
    try {
        // 检查是否有文件上传
        if (!req.file) {
            return res.json({
                code: 400,
                msg: '请选择要导入的Excel文件',
                data: null
            });
        }

        // 验证文件类型
        const allowedTypes = [
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ];
        if (!allowedTypes.includes(req.file.mimetype)) {
            return res.json({
                code: 400,
                msg: '仅支持导入 .xls 和 .xlsx 格式的Excel文件',
                data: null
            });
        }

        // 读取Excel文件
        const workbook = xlsx.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // 将Excel数据转换为JSON数组
        const data = xlsx.utils.sheet_to_json(worksheet, {
            header: 1, // 返回二维数组，第一行是表头
            raw: false, // 将所有值作为字符串返回
            defval: '' // 空单元格默认值
        });

        if (data.length < 2) {
            return res.json({
                code: 400,
                msg: 'Excel文件数据为空或缺少表头',
                data: null
            });
        }

        // 解析表头（第一行）
        const headers = data[0];
        const requiredFields = ['甲方', '乙方', '合同金额'];
        const missingFields = requiredFields.filter(field => !headers.includes(field));

        if (missingFields.length > 0) {
            return res.json({
                code: 400,
                msg: `Excel缺少必填字段：${missingFields.join(', ')}`,
                data: null
            });
        }

        // 获取各字段索引
        const getIndex = (field) => headers.indexOf(field);
        const indices = {
            party_a: getIndex('甲方'),
            party_b: getIndex('乙方'),
            party_b_id: getIndex('乙方ID'),
            project_id: getIndex('项目ID'),
            project_name: getIndex('项目名称'),
            contract_amount: getIndex('合同金额'),
            contract_type: getIndex('合同类型'),
            term: getIndex('期限'),
            project_content: getIndex('项目内容'),
            type: getIndex('类型'),
            material_name: getIndex('材料名称'),
            machinery_name: getIndex('机械名称')
        };

        // 解析数据行（从第二行开始）
        const rows = data.slice(1);
        const validContracts = [];
        const invalidRows = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 2; // Excel行号（从1开始，加1是因为有表头）

            // 跳过空行
            if (row.every(cell => !cell || String(cell).trim() === '')) {
                continue;
            }

            const party_a = indices.party_a >= 0 ? String(row[indices.party_a] || '').trim() : '';
            const party_b = indices.party_b >= 0 ? String(row[indices.party_b] || '').trim() : '';
            const contract_amount = indices.contract_amount >= 0 ? parseFloat(row[indices.contract_amount]) || 0 : 0;

            // 验证必填字段
            if (!party_a || !party_b || contract_amount <= 0) {
                invalidRows.push({
                    row: rowNum,
                    reason: `第${rowNum}行：甲方、乙方不能为空，合同金额必须大于0`
                });
                continue;
            }

            const contract = {
                party_a,
                party_b,
                party_b_id: indices.party_b_id >= 0 ? String(row[indices.party_b_id] || '').trim() : '',
                project_id: indices.project_id >= 0 ? String(row[indices.project_id] || '').trim() : '',
                project_name: indices.project_name >= 0 ? String(row[indices.project_name] || '').trim() : '',
                contract_amount: contract_amount,
                contract_type: indices.contract_type >= 0 ? String(row[indices.contract_type] || '').trim() || '1' : '1',
                account_paid: 0,
                wait_account_paid: contract_amount,
                term: indices.term >= 0 ? String(row[indices.term] || '').trim() : '',
                project_content: indices.project_content >= 0 ? String(row[indices.project_content] || '').trim() : '',
                type: indices.type >= 0 ? String(row[indices.type] || '').trim() : '',
                material_name: indices.material_name >= 0 ? String(row[indices.material_name] || '').trim() : '',
                machinery_name: indices.machinery_name >= 0 ? String(row[indices.machinery_name] || '').trim() : ''
            };

            validContracts.push(contract);
        }

        if (validContracts.length === 0) {
            return res.json({
                code: 400,
                msg: 'Excel中没有有效的合同数据',
                data: { invalidRows }
            });
        }

        // 批量插入合同数据
        const results = {
            success: 0,
            failed: 0,
            errors: []
        };

        for (const contract of validContracts) {
            try {
                // 插入合同
                const insertResult = await query(
                    `INSERT INTO sys_contract (
                        party_a, party_b, party_b_id, project_id, project_name, contract_amount,
                        contract_type, account_paid, wait_account_paid, term, project_content,
                        type, material_name, machinery_name
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        contract.party_a, contract.party_b, contract.party_b_id, contract.project_id,
                        contract.project_name, contract.contract_amount, contract.contract_type, contract.account_paid,
                        contract.wait_account_paid, contract.term, contract.project_content,
                        contract.type, contract.material_name, contract.machinery_name
                    ]
                );

                const insertId = insertResult.insertId || (Array.isArray(insertResult) ? insertResult[0]?.insertId : null);

                // 更新供应商的contract_id
                if (contract.party_b_id && insertId) {
                    const currentContractResult = await query(
                        `SELECT contract_id FROM sys_supplier WHERE supplier_id = ?`,
                        [contract.party_b_id]
                    );
                    const supplierData = Array.isArray(currentContractResult)
                        ? currentContractResult
                        : currentContractResult?.results || [];
                    const existingContractId = supplierData.length > 0 ? supplierData[0].contract_id : '';

                    let newContractId;
                    if (!existingContractId || existingContractId === '') {
                        newContractId = String(insertId);
                    } else {
                        newContractId = existingContractId + ',' + insertId;
                    }

                    await query(
                        `UPDATE sys_supplier SET contract_id = ? WHERE supplier_id = ?`,
                        [newContractId, contract.party_b_id]
                    );
                }

                results.success++;
            } catch (err) {
                results.failed++;
                results.errors.push({
                    contract: contract.project_name || contract.party_b,
                    error: err.message
                });
            }
        }

        res.json({
            code: 200,
            msg: `导入完成：成功 ${results.success} 条，失败 ${results.failed} 条`,
            data: {
                total: validContracts.length + invalidRows.length,
                valid: validContracts.length,
                invalid: invalidRows.length,
                success: results.success,
                failed: results.failed,
                invalidRows,
                errors: results.errors
            }
        });

    } catch (err) {
        res.json({
            code: 500,
            msg: 'Excel导入失败：' + err.message,
            data: null
        });
    }
};

/**
 * 获取Excel导入模板
 * 返回一个示例Excel文件的下载URL或表头信息
 */
const getImportTemplate = async (req, res) => {
    try {
        // 定义模板表头和示例数据
        const templateData = [
            ['甲方', '乙方', '乙方ID', '项目ID', '项目名称', '合同金额', '合同类型', '期限', '项目内容', '类型', '材料名称', '机械名称'],
            ['甲方公司A', '乙方供应商B', 'SUP001', 'PROJ001', '示例项目', '100000', '1', '2024-01至2024-12', '项目描述', '材料采购', '钢材', '挖掘机'],
            ['甲方公司C', '乙方供应商D', 'SUP002', 'PROJ002', '示例项目2', '200000', '2', '2024-03至2024-09', '项目描述2', '机械租赁', '', '起重机']
        ];

        // 创建工作簿
        const worksheet = xlsx.utils.aoa_to_sheet(templateData);

        // 设置列宽
        const colWidths = [
            { wch: 15 }, // 甲方
            { wch: 15 }, // 乙方
            { wch: 12 }, // 乙方ID
            { wch: 12 }, // 项目ID
            { wch: 15 }, // 项目名称
            { wch: 12 }, // 合同金额
            { wch: 12 }, // 合同类型
            { wch: 20 }, // 期限
            { wch: 20 }, // 项目内容
            { wch: 12 }, // 类型
            { wch: 15 }, // 材料名称
            { wch: 15 }  // 机械名称
        ];
        worksheet['!cols'] = colWidths;

        const workbook = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(workbook, worksheet, '合同导入模板');

        // 生成文件路径
        const path = require('path');
        const fs = require('fs');
        const templateDir = path.join(__dirname, '../uploads/template');
        if (!fs.existsSync(templateDir)) {
            fs.mkdirSync(templateDir, { recursive: true });
        }

        const templatePath = path.join(templateDir, 'contract_import_template.xlsx');
        xlsx.writeFile(workbook, templatePath);

        res.json({
            code: 200,
            msg: '获取模板成功',
            data: {
                templateUrl: `/uploads/template/contract_import_template.xlsx`,
                headers: templateData[0],
                requiredFields: ['甲方', '乙方', '合同金额'],
                description: '甲方、乙方、合同金额为必填字段，合同金额必须大于0。合同类型：1为非采购合同，2为采购合同，默认为1'
            }
        });

    } catch (err) {
        res.json({
            code: 500,
            msg: '获取模板失败：' + err.message,
            data: null
        });
    }
};

module.exports = {
    importContractExcel,
    getImportTemplate
};
