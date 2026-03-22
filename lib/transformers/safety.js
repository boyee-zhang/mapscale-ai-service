import { kv } from '../kv.js';

/**
 * Safety Transformer
 * 功能：分析犯罪率趋势、每千人犯罪密度及破案率
 */
export async function saveSafetyFeatures(regionCode) {
    const rawKey = `raw:safety:${regionCode}`;
    const featureKey = `features:safety:${regionCode}`;

    console.log(`🔄 [Processing] 正在提取治安特征值: ${regionCode}...`);

    // 1. 获取原始数据
    const response = await kv.get(rawKey);
    const rawData = response?.data || response;

    if (!rawData || !Array.isArray(rawData)) {
        console.error("❌ 无法找到原始安全数据");
        return;
    }

    // 2. 数据清洗
    // 过滤条件：SoortMisdrijf === "T001161" (代表总犯罪量 Totaal geregistreerde misdrijven)
    const cleanData = rawData
        .filter(item => item.SoortMisdrijf === "T001161")
        .map(item => ({
            period: item.Perioden.substring(0, 4),
            total_crimes: parseInt(item.TotaalGeregistreerdeMisdrijven_1.trim()),
            crime_per_1k: parseFloat(item.GeregistreerdeMisdrijvenPer1000Inw_3.trim()),
            solve_rate: parseFloat(item.OpgehelderdeMisdrijvenRelatief_5.trim())
        }))
        .sort((a, b) => a.period.localeCompare(b.period));

    if (cleanData.length === 0) {
        console.warn("⚠️ 过滤后无有效安全数据");
        return null;
    }

    // 3. 核心指标计算
    const latest = cleanData[cleanData.length - 1];
    const previous = cleanData.length > 1 ? cleanData[cleanData.length - 2] : null;
    const historicalAverage = (cleanData.reduce((acc, curr) => acc + curr.crime_per_1k, 0) / cleanData.length).toFixed(1);

    // A. 犯罪率变化趋势 (YoY)
    let trend = "Stable";
    if (previous) {
        const change = ((latest.crime_per_1k - previous.crime_per_1k) / previous.crime_per_1k * 100);
        if (change > 5) trend = "Increasing";
        if (change < -5) trend = "Decreasing";
    }

    // B. 安全评级逻辑 (基于每千人犯罪数)
    // 荷兰平均水平通常在 60-80 左右，低于 50 属于非常安全
    let safetyRating = "Average";
    if (latest.crime_per_1k < 50) safetyRating = "Safe / Secure";
    if (latest.crime_per_1k < 35) safetyRating = "Very Safe";
    if (latest.crime_per_1k > 80) safetyRating = "High Crime Alert";

    // 4. 构造 AI 特征包
    const features = {
        summary: {
            region_code: regionCode,
            as_of_year: latest.period,
            crime_per_1k_inhabitants: latest.crime_per_1k,
            historical_avg_per_1k: historicalAverage,
            current_solve_rate: latest.solve_rate + "%",
            crime_trend: trend
        },
        ai_signal: safetyRating,
        safety_index: (100 - latest.crime_per_1k).toFixed(1) // 满分 100 的安全指数
    };

    // 5. 打印结果
    console.log(`\n🛡️ --- SAFETY ANALYSIS: ${regionCode} ---`);
    console.table(features.summary);
    console.log(`💡 AI Signal: ${features.ai_signal}`);
    console.log("--------------------------------------------\n");

    // 6. 存储到 Upstash
    await kv.set(featureKey, features);
    console.log(`✅ [Saved] 治安特征已存入: ${featureKey}`);

    return features;
}

/**
 * --- 启动函数 ---
 */
// if (process.argv[1] && process.argv[1].includes('safety.js')) {
//     const region = process.argv[2] || "GM0384"; 
//     (async () => {
//         const dotenv = await import('dotenv');
//         dotenv.config();
//         try {
//             await saveSafetyFeatures(region);
//             process.exit(0);
//         } catch (err) {
//             console.error("💥 失败:", err.message);
//             process.exit(1);
//         }
//     })();
// }