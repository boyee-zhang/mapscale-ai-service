import { kv } from '../lib/kv.js';
import fetch from 'node-fetch';

// 导入你的自动化组件 (请确保路径正确)
import { runFullSync } from '../lib/scraper.js';
import { saveHousingFeatures } from '../lib/transformers/housing.js';
import { saveTrafficFeatures } from '../lib/transformers/traffic.js';
import { savePopulationFeatures } from '../lib/transformers/population.js';
import { saveSafetyFeatures } from '../lib/transformers/safety.js';

/**
 * 核心逻辑：确保数据存在，如果不存在则按顺序点火
 */
async function ensureAndFetchFeatures(regionCode, city) {
    console.log(`\n📦 [Step 2/4] 检查特征库完整性...`);
    const provinceCode = 'PV27'; // 交通数据代理

    // 1. 尝试直接获取
    let features = {
        housing: await kv.get(`features:housing:${regionCode}`),
        traffic: await kv.get(`features:traffic:${provinceCode}`),
        population: await kv.get(`features:population:${regionCode}`),
        safety: await kv.get(`features:safety:${regionCode}`)
    };

    // 2. 如果数据缺失，触发“点火”流程
    const missingData = Object.values(features).some(v => !v || v.status === 'missing');

    if (missingData) {
        console.warn(`⚠️  检测到特征库不完整，正在启动【自动化点火流程】...`);

        // A. 抓取原始数据 (Scrape)
        console.log(`   🛠️  [Pipeline] 1. 抓取远程 CBS 原始数据...`);
        await runFullSync(regionCode); 

        // B. 特征提取 (Transform) - 并行执行四个转换器
        console.log(`   🛠️  [Pipeline] 2. 运行特征提取转换器...`);
        const [h, t, p, s] = await Promise.all([
            saveHousingFeatures(regionCode),
            saveTrafficFeatures(provinceCode), // 注意交通用省代码
            savePopulationFeatures(regionCode),
            saveSafetyFeatures(regionCode)
        ]);

        features = { housing: h, traffic: t, population: p, safety: s };
        console.log(`✅ [Pipeline] 全链路数据准备就绪。`);
    } else {
        console.log(`✅ 特征库完整，直接进入 AI 分析。`);
    }

    return features;
}

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { city, regionCode } = req.body;
    console.log(`\n🚀 [Start] 收到分析请求: ${city} (${regionCode})`);

    const cacheKey = `analysis:cache:${regionCode.toLowerCase()}`;

    try {
        // 1. 缓存优先
        const cached = await kv.get(cacheKey);
        if (cached) {
            console.log(`⚡ [Cache Hit] 命中缓存。`);
            return res.status(200).json({ ...cached, _cache: true });
        }

        // 2. 检查并自动补全数据 (核心逻辑)
        const features = await ensureAndFetchFeatures(regionCode, city);

        // 3. AI 调用
        console.log(`🤖 [Step 3/4] 发送特征包至 AI...`);
        const aiStartTime = Date.now();
        
        const prompt = `你是荷兰房产专家。请根据以下提取的特征分析 ${city} (${regionCode})：\n${JSON.stringify(features)}`;

        const aiResponse = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.DEEPSEEK_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: 'You are a Dutch Real Estate Analyst. Output ONLY JSON.' },
                    { role: 'user', content: prompt }
                ],
                response_format: { type: 'json_object' }
            })
        });

        const aiData = await aiResponse.json();
        const analysis = JSON.parse(aiData.choices[0].message.content);
        console.log(`🧠 [AI Complete] 耗时: ${Date.now() - aiStartTime}ms`);

        // 4. 组装返回
        const finalPayload = {
            city,
            regionCode,
            ...analysis,
            raw_features: features,
            generated_at: new Date().toISOString()
        };

        await kv.set(cacheKey, finalPayload, { ex: 604800 });
        console.log(`✨ [Success] 分析完成！`);
        return res.status(200).json(finalPayload);

    } catch (error) {
        console.error(`💥 [Critical Error]:`, error);
        return res.status(500).json({ error: "分析失败", details: error.message });
    }
}