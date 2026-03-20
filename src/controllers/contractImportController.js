const xlsx = require('xlsx');
const { query } = require('../../db');
const fs = require('fs');
const path = require('path');
const { uploadDir } = require('../uploadConfig');

const ensureImportTaskTables = async () => {
    await query(
        `CREATE TABLE IF NOT EXISTS sys_import_task (
            task_id BIGINT PRIMARY KEY AUTO_INCREMENT,
            task_type VARCHAR(50) NOT NULL,
            status TINYINT NOT NULL DEFAULT 0,
            file_name VARCHAR(255) DEFAULT '',
            file_path VARCHAR(500) DEFAULT '',
            total_rows INT NOT NULL DEFAULT 0,
            processed_rows INT NOT NULL DEFAULT 0,
            success_rows INT NOT NULL DEFAULT 0,
            failed_rows INT NOT NULL DEFAULT 0,
            invalid_rows INT NOT NULL DEFAULT 0,
            message TEXT,
            create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
    );

    await query(
        `CREATE TABLE IF NOT EXISTS sys_import_task_log (
            id BIGINT PRIMARY KEY AUTO_INCREMENT,
            task_id BIGINT NOT NULL,
            row_num INT DEFAULT NULL,
            level VARCHAR(20) NOT NULL DEFAULT 'error',
            message TEXT,
            create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_task_id (task_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
    );
};

const ensureBudgetTable = async () => {
    await query(
        `CREATE TABLE IF NOT EXISTS sys_budget (
            budget_id BIGINT PRIMARY KEY AUTO_INCREMENT,
            project_id VARCHAR(50) NOT NULL,
            project_name VARCHAR(255) DEFAULT '',
            import_task_id BIGINT NOT NULL,
            name VARCHAR(255) NOT NULL,
            spec_model VARCHAR(255) NOT NULL DEFAULT '',
            unit VARCHAR(50) DEFAULT '',
            quantity DECIMAL(18,4) NOT NULL DEFAULT 0,
            budget_unit_price DECIMAL(18,4) NOT NULL DEFAULT 0,
            budget_total_price DECIMAL(18,4) NOT NULL DEFAULT 0,
            create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uk_budget (project_id, name, spec_model),
            INDEX idx_import_task_id (import_task_id),
            INDEX idx_project_id (project_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`
    );
};

const getProjectNameById = async (projectId) => {
    if (!projectId) return '';
    try {
        const result = await query(
            'SELECT project_name FROM sys_project WHERE project_id = ? LIMIT 1',
            [projectId]
        );
        const list = Array.isArray(result) ? result : result?.results || [];
        return list.length > 0 ? (list[0].project_name || '') : '';
    } catch (e) {
        return '';
    }
};

const resolveExcelFilePathFromBody = (body = {}) => {
    let fileNameFromBody = '';
    if (body.fileName) {
        fileNameFromBody = String(body.fileName);
    } else if (body.fileUrl) {
        const urlStr = String(body.fileUrl);
        const match = urlStr.match(/\/uploads\/contract\/(.+)$/);
        if (match && match[1]) {
            fileNameFromBody = match[1];
        } else {
            fileNameFromBody = urlStr.split('/').pop() || '';
        }
    }

    if (!fileNameFromBody) {
        return { ok: false, msg: '请选择要导入的Excel文件', filePath: '' };
    }

    try {
        fileNameFromBody = decodeURIComponent(fileNameFromBody);
    } catch (e) {
        fileNameFromBody = String(fileNameFromBody);
    }

    fileNameFromBody = path.basename(fileNameFromBody);
    const filePath = path.join(uploadDir, fileNameFromBody);
    if (!fs.existsSync(filePath)) {
        return { ok: false, msg: 'Excel文件不存在或已被删除，请重新上传', filePath: '' };
    }

    const ext = path.extname(filePath).toLowerCase();
    if (ext !== '.xls' && ext !== '.xlsx') {
        return { ok: false, msg: '仅支持导入 .xls 和 .xlsx 格式的Excel文件', filePath: '' };
    }

    return { ok: true, msg: 'ok', filePath, fileName: fileNameFromBody };
};

const runBudgetImportTask = async (taskId, filePath, projectId) => {
    await query(
        'UPDATE sys_import_task SET status = 1, message = ?, update_time = NOW() WHERE task_id = ?',
        ['处理中', taskId]
    );

    await ensureBudgetTable();

    const projectName = await getProjectNameById(projectId);

    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet, {
        header: 1,
        raw: false,
        defval: ''
    });

    if (!Array.isArray(data) || data.length < 2) {
        await query('UPDATE sys_import_task SET status = 3, message = ?, update_time = NOW() WHERE task_id = ?', ['Excel文件数据为空或缺少表头', taskId]);
        return;
    }

    const headers = data[0];
    const requiredFields = ['名称', '规格型号', '单位', '数量', '预算单价', '预算总价'];
    const missingFields = requiredFields.filter(field => !headers.includes(field));
    if (missingFields.length > 0) {
        await query('UPDATE sys_import_task SET status = 3, message = ?, update_time = NOW() WHERE task_id = ?', [`Excel缺少必填字段：${missingFields.join(', ')}`, taskId]);
        return;
    }

    const getIndex = (field) => headers.indexOf(field);
    const indices = {
        name: getIndex('名称'),
        spec_model: getIndex('规格型号'),
        unit: getIndex('单位'),
        quantity: getIndex('数量'),
        budget_unit_price: getIndex('预算单价'),
        budget_total_price: getIndex('预算总价')
    };

    const rows = data.slice(1);
    const totalRows = rows.length;
    await query('UPDATE sys_import_task SET total_rows = ?, update_time = NOW() WHERE task_id = ?', [totalRows, taskId]);

    let processed = 0;
    let success = 0;
    let failed = 0;
    let invalid = 0;

    const batchSize = 500;
    let batchItems = [];

    const parseDecimal = (val) => {
        const n = Number(String(val || '').trim());
        return Number.isFinite(n) ? n : 0;
    };

    const upsertOneBudget = async (itemWithMeta) => {
        const item = itemWithMeta.item;
        const rowNum = itemWithMeta.rowNum;
        try {
            await query(
                `INSERT INTO sys_budget (
                    project_id, project_name, import_task_id,
                    name, spec_model, unit,
                    quantity, budget_unit_price, budget_total_price
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    project_name = VALUES(project_name),
                    import_task_id = VALUES(import_task_id),
                    unit = VALUES(unit),
                    quantity = VALUES(quantity),
                    budget_unit_price = VALUES(budget_unit_price),
                    budget_total_price = VALUES(budget_total_price),
                    update_time = NOW()`,
                [
                    item.project_id, item.project_name, item.import_task_id,
                    item.name, item.spec_model, item.unit,
                    item.quantity, item.budget_unit_price, item.budget_total_price
                ]
            );
            success += 1;
        } catch (err) {
            failed++;
            await query(
                'INSERT INTO sys_import_task_log (task_id, row_num, level, message) VALUES (?, ?, ?, ?)',
                [taskId, rowNum, 'error', err.message]
            );
        }
    };

    const flushBatch = async () => {
        if (batchItems.length === 0) return;

        const valuesSql = batchItems
            .map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .join(',');
        const params = [];
        for (const wrapper of batchItems) {
            const item = wrapper.item;
            params.push(
                item.project_id, item.project_name, item.import_task_id,
                item.name, item.spec_model, item.unit,
                item.quantity, item.budget_unit_price, item.budget_total_price
            );
        }

        try {
            await query(
                `INSERT INTO sys_budget (
                    project_id, project_name, import_task_id,
                    name, spec_model, unit,
                    quantity, budget_unit_price, budget_total_price
                ) VALUES ${valuesSql}
                ON DUPLICATE KEY UPDATE
                    project_name = VALUES(project_name),
                    import_task_id = VALUES(import_task_id),
                    unit = VALUES(unit),
                    quantity = VALUES(quantity),
                    budget_unit_price = VALUES(budget_unit_price),
                    budget_total_price = VALUES(budget_total_price),
                    update_time = NOW()`,
                params
            );

            success += batchItems.length;
        } catch (batchErr) {
            // 批量失败：降级逐条插入，以便记录行级错误
            for (const item of batchItems) {
                await upsertOneBudget(item);
            }
        } finally {
            batchItems = [];
        }
    };

    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;
        processed++;

        if (!Array.isArray(row) || row.every(cell => !cell || String(cell).trim() === '')) {
            continue;
        }

        const name = indices.name >= 0 ? String(row[indices.name] || '').trim() : '';
        const specModel = indices.spec_model >= 0 ? String(row[indices.spec_model] || '').trim() : '';
        const unit = indices.unit >= 0 ? String(row[indices.unit] || '').trim() : '';
        const quantity = indices.quantity >= 0 ? parseDecimal(row[indices.quantity]) : 0;
        const budgetUnitPrice = indices.budget_unit_price >= 0 ? parseDecimal(row[indices.budget_unit_price]) : 0;
        const totalFromExcel = indices.budget_total_price >= 0 ? parseDecimal(row[indices.budget_total_price]) : 0;
        const budgetTotalPrice = totalFromExcel > 0 ? totalFromExcel : Number((quantity * budgetUnitPrice).toFixed(4));

        if (!name || quantity <= 0 || budgetUnitPrice <= 0) {
            invalid++;
            await query(
                'INSERT INTO sys_import_task_log (task_id, row_num, level, message) VALUES (?, ?, ?, ?)',
                [taskId, rowNum, 'invalid', `第${rowNum}行：名称不能为空，数量/预算单价必须大于0`]
            );
        } else {
            const item = {
                project_id: String(projectId || '').trim(),
                project_name: String(projectName || '').trim(),
                import_task_id: taskId,
                name,
                spec_model: specModel,
                unit,
                quantity,
                budget_unit_price: budgetUnitPrice,
                budget_total_price: budgetTotalPrice
            };

            batchItems.push({ rowNum, item });
            if (batchItems.length >= batchSize) {
                await flushBatch();
            }
        }

        if (processed % 200 === 0) {
            await query(
                'UPDATE sys_import_task SET processed_rows = ?, success_rows = ?, failed_rows = ?, invalid_rows = ?, update_time = NOW() WHERE task_id = ?',
                [processed, success, failed, invalid, taskId]
            );
        }
    }

    await flushBatch();

    const finalMessage = `导入完成：成功 ${success} 条，失败 ${failed} 条，无效 ${invalid} 条`;
    await query(
        'UPDATE sys_import_task SET status = 2, processed_rows = ?, success_rows = ?, failed_rows = ?, invalid_rows = ?, message = ?, update_time = NOW() WHERE task_id = ?',
        [processed, success, failed, invalid, finalMessage, taskId]
    );
};

const submitBudgetImportTask = async (req, res) => {
    try {
        await ensureImportTaskTables();

        const { project_id } = req.body || {};
        if (!project_id) {
            return res.json({ code: 400, msg: 'project_id不能为空', data: null });
        }

        const resolved = resolveExcelFilePathFromBody(req.body || {});
        if (!resolved.ok) {
            return res.json({ code: 400, msg: resolved.msg, data: null });
        }

        const insertTaskResult = await query(
            'INSERT INTO sys_import_task (task_type, status, file_name, file_path, message) VALUES (?, ?, ?, ?, ?)',
            ['budget_import', 0, resolved.fileName || '', resolved.filePath, '待处理']
        );
        const taskId = insertTaskResult.insertId || (Array.isArray(insertTaskResult) ? insertTaskResult[0]?.insertId : null);
        if (!taskId) {
            return res.json({ code: 500, msg: '创建导入任务失败', data: null });
        }

        setImmediate(async () => {
            try {
                await runBudgetImportTask(taskId, resolved.filePath, project_id);
            } catch (err) {
                try {
                    await ensureImportTaskTables();
                    await query(
                        'UPDATE sys_import_task SET status = 3, message = ?, update_time = NOW() WHERE task_id = ?',
                        [`导入异常：${err.message}`, taskId]
                    );
                    await query(
                        'INSERT INTO sys_import_task_log (task_id, row_num, level, message) VALUES (?, ?, ?, ?)',
                        [taskId, null, 'error', err.message]
                    );
                } catch (e) {
                }
            }
        });

        res.json({
            code: 200,
            msg: '任务已创建，正在后台导入',
            data: { task_id: taskId }
        });
    } catch (err) {
        res.json({ code: 500, msg: '服务器错误：' + err.message, data: null });
    }
};

const getBudgetImportTaskStatus = async (req, res) => {
    try {
        await ensureImportTaskTables();
        const { task_id } = req.params;
        if (!task_id) {
            return res.json({ code: 400, msg: 'task_id不能为空', data: null });
        }

        const taskResult = await query('SELECT * FROM sys_import_task WHERE task_id = ?', [task_id]);
        const tasks = Array.isArray(taskResult) ? taskResult : taskResult?.results || [];
        if (tasks.length === 0) {
            return res.json({ code: 404, msg: '任务不存在', data: null });
        }

        res.json({ code: 200, msg: '查询成功', data: tasks[0] });
    } catch (err) {
        res.json({ code: 500, msg: '服务器错误：' + err.message, data: null });
    }
};

const getBudgetImportTaskResult = async (req, res) => {
    try {
        await ensureImportTaskTables();
        const { task_id } = req.params;
        if (!task_id) {
            return res.json({ code: 400, msg: 'task_id不能为空', data: null });
        }

        const logsResult = await query(
            'SELECT id, row_num, level, message, create_time FROM sys_import_task_log WHERE task_id = ? ORDER BY id DESC LIMIT 500',
            [task_id]
        );
        const logs = Array.isArray(logsResult) ? logsResult : logsResult?.results || [];
        res.json({ code: 200, msg: '查询成功', data: { task_id, logs } });
    } catch (err) {
        res.json({ code: 500, msg: '服务器错误：' + err.message, data: null });
    }
};

const getBudgetImportTaskList = async (req, res) => {
    try {
        await ensureImportTaskTables();
        const taskResult = await query('SELECT * FROM sys_import_task ORDER BY create_time DESC');
        const tasks = Array.isArray(taskResult) ? taskResult : taskResult?.results || [];
        res.json({ code: 200, msg: '查询成功', data: tasks });
    } catch (err) {
        res.json({ code: 500, msg: '服务器错误：' + err.message, data: null });
    }
};

/**
 * 导入Excel合同数据
 * 前端上传Excel文件，后端解析并批量插入合同数据
 */
const importContractExcel = async (req, res) => {
    try {
        // 兼容两种传参：1) 直接上传文件 req.file 2) 传 fileName/fileUrl 指向已上传文件
        let filePath = '';
        let fileNameFromBody = '';

        if (req.file && req.file.path) {
            filePath = req.file.path;
        } else {
            const { fileName, fileUrl } = req.body || {};
            if (fileName) {
                fileNameFromBody = String(fileName);
            } else if (fileUrl) {
                const urlStr = String(fileUrl);
                const match = urlStr.match(/\/uploads\/contract\/(.+)$/);
                if (match && match[1]) {
                    fileNameFromBody = match[1];
                } else {
                    fileNameFromBody = urlStr.split('/').pop() || '';
                }
            }

            if (!fileNameFromBody) {
                return res.json({
                    code: 400,
                    msg: '请选择要导入的Excel文件',
                    data: null
                });
            }

            try {
                fileNameFromBody = decodeURIComponent(fileNameFromBody);
            } catch (e) {
                fileNameFromBody = String(fileNameFromBody);
            }

            fileNameFromBody = path.basename(fileNameFromBody);
            filePath = path.join(uploadDir, fileNameFromBody);

            if (!fs.existsSync(filePath)) {
                return res.json({
                    code: 400,
                    msg: 'Excel文件不存在或已被删除，请重新上传',
                    data: null
                });
            }
        }

        // 验证文件类型（上传时用 mimetype；传 fileName/fileUrl 时用后缀名）
        const allowedTypes = [
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ];
        if (req.file && req.file.mimetype) {
            if (!allowedTypes.includes(req.file.mimetype)) {
                return res.json({
                    code: 400,
                    msg: '仅支持导入 .xls 和 .xlsx 格式的Excel文件',
                    data: null
                });
            }
        } else {
            const ext = path.extname(filePath).toLowerCase();
            if (ext !== '.xls' && ext !== '.xlsx') {
                return res.json({
                    code: 400,
                    msg: '仅支持导入 .xls 和 .xlsx 格式的Excel文件',
                    data: null
                });
            }
        }

        // 读取Excel文件
        const workbook = xlsx.readFile(filePath);
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
    getImportTemplate,
    submitBudgetImportTask,
    getBudgetImportTaskStatus,
    getBudgetImportTaskResult,
    getBudgetImportTaskList
};
