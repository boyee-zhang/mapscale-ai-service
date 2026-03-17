import { kv } from '../kv.js';

/**
 * Housing Transformer - 工业级增强版
 * 功能：计算均价、YoY、10年涨幅、历史总涨幅、波动率，并持久化至 KV
 */
export async function saveHousingFeatures(regionCode) {
    const rawKey = `raw:housing:${regionCode}`;
    const featureKey = `features:housing:${regionCode}`;

    console.log(`🔄 [Processing] 正在生成工业级特征值: ${regionCode}...`);

    // 1. 获取原始数据
    const response = await kv.get(rawKey);
    const rawData = response?.data || response;

    if (!rawData || !Array.isArray(rawData)) {
        console.error("❌ 无法找到原始数据，请检查 raw:housing Key 是否存在");
        return;
    }

    // 2. 清洗与格式化 (识别 Periods/Perioden, 清洗价格字符串)
    const cleanData = rawData
        .filter(item => (item.Periods || item.Perioden) && item.AveragePurchasePrice_1)
        .map(item => ({
            period: (item.Periods || item.Perioden).substring(0, 4),
            price: parseFloat(item.AveragePurchasePrice_1.toString().replace(/[^0-9.]/g, ''))
        }))
        .sort((a, b) => a.period.localeCompare(b.period));

    if (cleanData.length === 0) {
        console.warn("⚠️ 过滤后无有效数据");
        return null;
    }

    // 3. 统计学计算
    const prices = cleanData.map(d => d.price);
    const latestPrice = prices[prices.length - 1];
    const firstPrice = prices[0];
    
    // A. 历史总增长 (从有记录开始)
    const totalGrowth = (((latestPrice - firstPrice) / firstPrice) * 100).toFixed(2) + "%";

    // B. 最近10年增长
    const last10Years = cleanData.slice(-10);
    const price10YearsAgo = last10Years[0].price;
    const growth10Year = (((latestPrice - price10YearsAgo) / price10YearsAgo) * 100).toFixed(2) + "%";

    // C. 波动率 (标准差 / 均值)
    const n = prices.length;
    const mean = prices.reduce((a, b) => a + b) / n;
    const standardDeviation = Math.sqrt(
        prices.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / n
    );
    const volatility = (standardDeviation / mean).toFixed(4);

    // D. 年度增长 (YoY)
    const previousPrice = prices.length > 1 ? prices[prices.length - 2] : null;
    let annualGrowth = "N/A";
    if (previousPrice) {
        annualGrowth = (((latestPrice - previousPrice) / previousPrice) * 100).toFixed(2) + "%";
    }

    // 4. 构造 AI 特征包
    const features = {
        summary: {
            latest_price: latestPrice,
            currency: "EUR",
            as_of_year: cleanData[cleanData.length - 1].period,
            annual_growth_yoy: annualGrowth,
            growth_last_10yrs: growth10Year,
            total_historical_growth: totalGrowth,
            market_volatility: volatility
        },
        trend: cleanData.slice(-10), 
        ai_signal: parseFloat(volatility) < 0.20 ? "Stable Appreciation" : "High Growth / Volatile"
    };

    // 5. 控制台打印 (满足你的实时查看需求)
    console.log(`\n📊 --- HOUSING ANALYSIS: ${regionCode} ---`);
    console.table(features.summary);
    console.log(`💡 AI Signal: ${features.ai_signal}`);
    console.log("------------------------------------------\n");

    // 6. 存储到 Upstash
    await kv.set(featureKey, features);
    console.log(`✅ [Saved] 工业级特征已存入: ${featureKey}`);

    return features;
}

/**
 * --- 启动函数 (Entry Point) ---
 */
if (process.argv[1] && process.argv[1].includes('housing.js')) {
    const region = process.argv[2] || "GM0384"; 
    
    (async () => {
        const dotenv = await import('dotenv');
        dotenv.config();
        
        try {
            await saveHousingFeatures(region);
            process.exit(0);
        } catch (err) {
            console.error("💥 启动失败:", err.message);
            process.exit(1);
        }
    })();
}