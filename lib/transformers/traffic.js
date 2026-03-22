import { kv } from '../kv.js';

/**
 * Traffic Transformer
 * 功能：从 raw:traffic 提取关键特征并存入 Upstash
 */
export async function saveTrafficFeatures(regionCode) {
    const rawKey = `raw:traffic:${regionCode}`;
    const featureKey = `features:traffic:${regionCode}`;

    console.log(`🔄 [Processing] 正在提取交通特征值: ${regionCode}...`);

    // 1. 获取原始数据
    const response = await kv.get(rawKey);
    // 兼容不同的 Upstash 返回格式
    const rawData = response?.data || response;

    if (!rawData || !Array.isArray(rawData)) {
        console.error(`❌ 无法找到原始数据: ${rawKey}`);
        return;
    }

    // 2. 数据清洗 (只取平均值 MW00000 和 总计 T001080)
    const cleanData = rawData
        .filter(item => item.Marges === "MW00000" && item.Reismotieven === "T001080")
        .map(item => ({
            period: item.Perioden.substring(0, 4),
            trips: parseFloat(item.Verplaatsingen_4.toString().trim()),
            distance: parseFloat(item.Afstand_5.toString().trim()),
            duration: parseFloat(item.Reisduur_6.toString().trim())
        }))
        .sort((a, b) => a.period.localeCompare(b.period));

    if (cleanData.length === 0) {
        console.warn("⚠️ 过滤后无有效交通数据");
        return null;
    }

    // 3. 核心计算
    const latest = cleanData[cleanData.length - 1];
    const previous = cleanData.length > 1 ? cleanData[cleanData.length - 2] : null;

    // A. 效率指数 (速度): 公里/分钟 (越高越顺畅)
    const efficiency = (latest.distance / latest.duration).toFixed(2);
    
    // B. 单次出行平均时长 (分钟)
    const avgTripTime = (latest.duration / (latest.trips / 100)).toFixed(1);

    // C. 活跃度 YoY
    let annualChange = "N/A";
    if (previous) {
        annualChange = (((latest.trips - previous.trips) / previous.trips) * 100).toFixed(2) + "%";
    }

    // 4. 构造 AI 特征
    const rawMeta = response?.metadata || {};
    const provinceName = rawMeta.regionName || regionCode;

    const features = {
            summary: {
                region_code: regionCode,
                region_name: provinceName,
                data_level: "Province",
                as_of_year: latest.period,
                commute_efficiency: efficiency,
                avg_trip_duration_min: avgTripTime,
                mobility_intensity_yoy: annualChange
            },
            ai_context: {
                reliability: "Medium",
                source_note: `Data represents the provincial average for ${provinceName} (${regionCode}). Municipal-level granularity is not available from CBS table 84713NED.`,
                interpretation_guide: "Use as a regional baseline for commuting behaviour. Cities close to major urban centres may experience higher congestion than the provincial average."
            },
            ai_signal: parseFloat(efficiency) > 25 ? "Good Regional Connectivity" : "Regional Traffic Pressure"
        };

    // 5. 打印 (增加一行来源警告，方便你自己看)
    console.log(`\n🚦 --- TRAFFIC ANALYSIS: ${regionCode} (${provinceName}) ---`);
    console.log(`ℹ️  Data level: Province`);
    console.table(features.summary);
    console.log(`💡 AI Signal: ${features.ai_signal}`);
    console.log("--------------------------------------------\n");

    // 6. 存储
    await kv.set(featureKey, features);
    console.log(`✅ [Saved] 交通特征已存入: ${featureKey}`);

    return features;
}

/**
 * --- 启动逻辑 ---
 */
// if (process.argv[1] && (process.argv[1].includes('traffic.js') || process.argv[1].includes('test.js'))) {
//     const region = process.argv[2] || "PV27"; 
    
//     (async () => {
//         // 关键修复：动态加载 dotenv 确保在所有逻辑之前
//         const dotenv = await import('dotenv');
//         dotenv.config();
        
//         try {
//             await saveTrafficFeatures(region);
//             process.exit(0);
//         } catch (err) {
//             console.error("💥 失败:", err.message);
//             process.exit(1);
//         }
//     })();
// }