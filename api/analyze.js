import { kv } from '../lib/kv.js';
import fetch from 'node-fetch';
import { NL_BENCHMARKS } from '../lib/benchmarks.js';

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

    // res.setHeader('Access-Control-Allow-Origin', '*'); 
    // res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    // res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // // 2. 处理浏览器发送的 OPTIONS 预检请求 (解决 405 的核心！)
    // // 浏览器在发 POST 之前会先发 OPTIONS 问一下，必须直接返回 200
    // if (req.method === 'OPTIONS') {
    //     return res.status(200).end(); 
    // }

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
        
        const systemPrompt = `You are a senior Dutch real estate investment analyst with deep expertise in the Dutch housing market, CBS statistics, and macroeconomic factors. Your role is to synthesize multi-dimensional socio-economic data into a rigorous, data-driven investment report.

You MUST output a single valid JSON object — no markdown, no prose outside the JSON.

The JSON schema you must follow exactly:
{
  "schema_version": "1.1",
  "request": { "city": string, "region_code": string },
  "data": {
    "investment_score": number (0–100),
    "investment_grade": string ("A+" | "A" | "B+" | "B" | "C+" | "C" | "D"),
    "overall_sentiment": string ("Strongly Bullish" | "Bullish" | "Neutral" | "Bearish" | "Strongly Bearish"),
    "executive_summary": string (2–3 sentences, highlight the most important finding),
    "data_sources": [
      { "name": string, "table_id": string, "description": string, "url": string }
    ],
    "dimensional_analysis": {
      "housing": {
        "score": number (0–100),
        "trend": string,
        "avg_price_eur": number,
        "yoy_growth_pct": number,
        "10yr_growth_pct": number,
        "volatility_assessment": string,
        "insight": string,
        "source": "CBS",
        "benchmark": {
          "metric": "Year-on-Year price growth",
          "value": number (the actual yoy_growth_pct),
          "unit": "%",
          "national_avg": number,
          "rating": string ("High Growth" | "Above Average" | "Moderate" | "Declining"),
          "vs_national": string (e.g. "+2.3pp above national avg")
        }
      },
      "population": {
        "score": number (0–100),
        "education_profile": string,
        "income_level": string,
        "household_composition": string,
        "urban_density": string,
        "insight": string,
        "source": "CBS",
        "benchmark": {
          "metric": "High education rate (HBO/WO)",
          "value": number (numeric % without the % sign),
          "unit": "%",
          "national_avg": number,
          "rating": string ("Highly Educated" | "Above Average" | "Average" | "Below Average"),
          "vs_national": string (e.g. "+15pp above national avg")
        }
      },
      "safety": {
        "score": number (0–100),
        "crime_rate_per_1000": number,
        "safety_index": number,
        "safety_rating": string,
        "trend_direction": string ("Improving" | "Stable" | "Deteriorating"),
        "insight": string,
        "source": "CBS",
        "benchmark": {
          "metric": "Safety Index (100 − crime_per_1000)",
          "value": number (the safety_index value),
          "unit": "index points (0–100)",
          "national_avg": number,
          "rating": string ("Very Safe" | "Safe / Secure" | "Average" | "High Crime Alert"),
          "vs_national": string (e.g. "+8.8 points above national avg")
        }
      },
      "connectivity": {
        "score": number (0–100),
        "commute_efficiency_km_per_min": number,
        "avg_trip_duration_min": number,
        "data_note": string,
        "insight": string,
        "source": "CBS (Provincial proxy: PV27 North Holland)",
        "benchmark": {
          "metric": "Commute efficiency (km/min)",
          "value": number (the commute_efficiency value),
          "unit": "km per minute",
          "national_avg": number,
          "rating": string ("Excellent" | "Good" | "Average" | "Congested"),
          "vs_national": string (e.g. "-1.3 km/min below national avg")
        }
      }
    },
    "prediction": {
      "confidence": string ("low" | "medium" | "high"),
      "overall_outlook": string ("Bullish" | "Bearish" | "Neutral"),
      "horizon": {
        "1yr": { "price_change_pct": number, "price_target_eur": number, "rationale": string },
        "3yr": { "price_change_pct": number, "price_target_eur": number, "rationale": string },
        "5yr": { "price_change_pct": number, "price_target_eur": number, "rationale": string }
      },
      "key_drivers": [string],
      "key_risks": [string]
    }
  }
}

Rules for benchmark fields — use these Dutch national averages exactly:
${JSON.stringify(NL_BENCHMARKS, null, 2)}
For each benchmark.vs_national: compute the difference between the actual value and national_avg, prefix with "+" or "−", and append the unit (e.g. "+15pp above national avg" or "−1.3 km/min below national avg").

Rules for data_sources — always include these four entries exactly:
- { "name": "CBS Housing Price Index", "table_id": "83625ENG", "description": "Existing own homes; purchase price indices", "url": "https://opendata.cbs.nl/ODataFeed/odata/83625ENG" }
- { "name": "CBS Social Safety", "table_id": "83648NED", "description": "Victimization and crime statistics by region", "url": "https://opendata.cbs.nl/ODataFeed/odata/83648NED" }
- { "name": "CBS Key Figures Districts & Neighbourhoods", "table_id": "85618NED", "description": "Demographics, income, education and facilities by municipality", "url": "https://opendata.cbs.nl/ODataFeed/odata/85618NED" }
- { "name": "CBS Mobility Survey", "table_id": "84713NED", "description": "Personal travel behaviour; provincial proxy PV27 (North Holland)", "url": "https://opendata.cbs.nl/ODataFeed/odata/84713NED" }

Rules for prediction:
- Base price targets on the current avg_price_eur from housing features.
- Compound the growth percentages correctly (not linear).
- Set confidence to "low" if housing data has high volatility or limited years of data.
- key_drivers and key_risks must each have 3–5 specific, data-backed items referencing actual numbers from the features.`;

        const userPrompt = `Analyze the following feature data for ${city} (${regionCode}) and return the complete JSON report per the schema above.

Feature Data:
${JSON.stringify(features, null, 2)}`;

        const aiResponse = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.DEEPSEEK_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                response_format: { type: 'json_object' }
            })
        });

        const aiData = await aiResponse.json();
        const analysis = JSON.parse(aiData.choices[0].message.content);
        console.log(`🧠 [AI Complete] 耗时: ${Date.now() - aiStartTime}ms`);

        // 4. 组装返回
        const finalPayload = {
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