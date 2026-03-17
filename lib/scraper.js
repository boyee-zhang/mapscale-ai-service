import dotenv from 'dotenv';
dotenv.config();

import nodeFetch from 'node-fetch';
import { kv } from './kv.js';
import { CBS_CONFIG } from './config.js';

/**
 * 核心抓取函数：将 CBS 远程数据同步到 Upstash
 */
export async function syncCbsToUpstash(category, regionCode) {
    const config = CBS_CONFIG[category];
    const cleanCode = regionCode.trim();
    const regionField = config.regionField;

    // 💡 只有非 traffic 类别才走这个远程抓取逻辑
    let url = "";
    if (config.fullUrl) {
        url = config.fullUrl;
    } else {
        const filterStr = `substringof('${cleanCode}', ${regionField})`;
        url = `https://opendata.cbs.nl/ODataFeed/odata/${config.tableId}/UntypedDataSet?$filter=${encodeURIComponent(filterStr)}&$format=json`;
    }

    try {
        console.log(`📡 [Syncing] 正在从 CBS 抓取 ${category} 数据...`);
        const response = await nodeFetch(url, {
            method: 'GET',
            timeout: 30000,
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) throw new Error(`CBS API 响应失败: ${response.status}`);
        
        const json = await response.json();
        const rawData = json.value || [];

        const storagePayload = {
            metadata: {
                category,
                tableId: config.tableId,
                regionCode: cleanCode,
                lastSynced: new Date().toISOString()
            },
            data: rawData
        };

        const kvKey = `raw:${category}:${cleanCode}`;
        await kv.set(kvKey, storagePayload);
        
        console.log(`✅ [Saved] ${kvKey} | 匹配条数: ${rawData.length}`);
        return storagePayload;

    } catch (error) {
        console.error(`❌ [Error] ${category} 同步失败:`, error.message);
        throw error;
    }
}

/**
 * 全维度点火函数 - 已移除 Traffic 远程抓取
 */
export async function runFullSync(regionCode) {
    console.log(`🚀 开始为地区 ${regionCode} 构建 Raw Data 仓库...`);
    
    // 获取所有板块，但过滤掉 traffic
    const allCategories = Object.keys(CBS_CONFIG);
    const syncCategories = allCategories.filter(cat => cat !== 'traffic');
    
    console.log(`ℹ️  本次任务将抓取: [${syncCategories.join(', ')}]`);
    console.log(`ℹ️  跳过自动抓取: [traffic] (请确保已通过本地文件上传)`);

    // 使用 map 启动剩余请求
    const results = await Promise.allSettled(
        syncCategories.map(cat => syncCbsToUpstash(cat, regionCode))
    );

    console.log("\n--- 同步任务汇总 ---");
    syncCategories.forEach((cat, i) => {
        const res = results[i];
        if (res.status === 'fulfilled') {
            console.log(`🟢 ${cat.padEnd(12)}: 同步成功`);
        } else {
            console.log(`🔴 ${cat.padEnd(12)}: 失败 (${res.reason.message})`);
        }
    });
    
    return results;
}

// // 立即运行：同步 Diemen 其余数据
// runFullSync("GM0384").then(() => {
//     console.log("\n✨ 基础维度同步完成 (Traffic 保持手动更新状态)。");
//     process.exit(0);
// }).catch(err => {
//     console.error("💥 脚本崩溃:", err);
//     process.exit(1);
// });