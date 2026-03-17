import dotenv from 'dotenv';

dotenv.config();

import fs from 'fs';
import { kv } from './kv.js';


async function uploadDiemenTraffic(filePath) {
    const TARGET_REGION = 'PV27';
    console.log(`📖 正在处理本地文件: ${filePath}`);
    
    try {
        // 1. 使用流式读取，并强制 trim 掉开头可能存在的非法字符
        const rawBuffer = fs.readFileSync(filePath);
        let rawContent = rawBuffer.toString('utf8').trim();

        // 2. 移除可能的 UTF-8 BOM (Byte Order Mark)
        if (rawContent.charCodeAt(0) === 0xFEFF) {
            rawContent = rawContent.slice(1);
        }

        // 3. 尝试解析
        let json;
        try {
            json = JSON.parse(rawContent);
        } catch (parseError) {
            // 如果还是错，打印出报错位置附近的字符辅助定位
            const pos = parseError.message.match(/at position (\d+)/);
            if (pos) {
                const index = parseInt(pos[1]);
                console.error("📍 解析错误邻近内容:", rawContent.substring(Math.max(0, index - 20), index + 20));
            }
            throw parseError;
        }
        
        // 4. 处理对象格式转数组逻辑
        let allData = [];
        const valueField = json.value;
        if (valueField && typeof valueField === 'object' && !Array.isArray(valueField)) {
            console.log("📦 检测到对象映射格式，正在提取 values...");
            allData = Object.values(valueField);
        } else {
            allData = Array.isArray(valueField) ? valueField : (Array.isArray(json) ? json : []);
        }

        // 5. 过滤 Diemen 数据
        const diemenData = allData.filter(item => 
            item.RegioS && item.RegioS.trim() === TARGET_REGION
        );

        if (diemenData.length === 0) {
            console.warn(`⚠️ 注意：解析成功但在文件中未发现 ${TARGET_REGION}。`);
            // 打印前两个数据的 RegioS 看看格式
            const samples = allData.slice(0, 2).map(d => d.RegioS);
            console.log("样本中的地区代码:", samples);
            return;
        }

        // 6. 构造 Payload 并上传
        const payload = {
            metadata: {
                category: 'traffic',
                regionCode: TARGET_REGION,
                lastSynced: new Date().toISOString(),
                rowCount: diemenData.length
            },
            data: diemenData 
        };

        const success = await kv.set(`raw:traffic:${TARGET_REGION}`, payload);
        if (success) {
            console.log(`✅ 同步完成！Diemen (${TARGET_REGION}) 数据条数: ${diemenData.length}`);
        }

    } catch (error) {
        console.error("💥 运行失败:", error.message);
    }
}

// 确保路径正确
uploadDiemenTraffic('./data/traffic_data.json');