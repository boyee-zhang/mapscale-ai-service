// api/analyze.js
import { getAreaStats } from '../lib/scraper.js';
import { kv } from '../lib/kv.js';
import fetch from 'node-fetch';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { city, pois } = req.body;
  if (!city) {
    return res.status(400).json({ error: 'City name is required' });
  }

  const cacheKey = `mapscale:analysis:${city.toLowerCase()}`;

  try {
    // 1. 缓存优先 (Upstash)
    const cachedData = await kv.get(cacheKey);
    if (cachedData) {
      console.log(`[Cache] Hit for ${city}`);
      return res.json({ ...cachedData, _fromCache: true });
    }

    // 2. 异步执行爬虫 (AlleCijfers)
    // 包装一下，防止爬虫挂了导致整个接口挂掉
    let scrapedData = {};
    // try {
    //   scrapedData = await getAreaStats(city);
    // } catch (err) {
    //   console.error('[Scraper Error]:', err);
    //   scrapedData = { info: "Live statistics currently unavailable" };
    // }
    try {
        console.log(`--- Starting Scraper for ${city} ---`);
        scrapedData = await getAreaStats(city);
        
        // 💡 调试重点：查看爬虫返回的结构
        console.log("Scraped Data Structure:", JSON.stringify(scrapedData, null, 2));

        // 如果返回了 html 源码（我们在下一步修改 scraper 加上它）
        if (scrapedData._rawHtml) {
            console.log("HTML Source received, length:", scrapedData._rawHtml.length);
            // 建议：不要直接在 console 打印几万行的 HTML，太乱了。
            // 我们把它存入 KV，你可以直接去 Upstash 查看这个 key
            await kv.set(`debug:html:${city.toLowerCase()}`, scrapedData._rawHtml.substring(0, 50000), { ex: 3600 });
            console.log(`[Debug] Full HTML saved to KV key: debug:html:${city.toLowerCase()}`);
        }
        } catch (err) {
        console.error('[Scraper Error]:', err);
        scrapedData = { info: "Live statistics currently unavailable" };
        }
        
    // 3. 数据压缩 (聚合 POI 减少 Token 消耗)
    const poiSummary = pois && Array.isArray(pois) 
      ? pois.reduce((acc, p) => {
          const type = p.type || 'other';
          acc[type] = (acc[type] || 0) + 1;
          return acc;
        }, {})
      : "No POI data provided";

    // 4. 构造 AI Prompt
    const prompt = `
      你是荷兰房地产专家。请分析 ${city} 的生活与投资潜力。
      市场统计数据: ${JSON.stringify(scrapedData)}
      设施分布情况: ${JSON.stringify(poiSummary)}
      
      任务：
      1. 生成 3 个 Positive (优势) 和 3 个 Negative (劣势)。
      2. 给出综合评级 (1-100)。
      3. 必须返回严格的 JSON 格式：
      {"score": number, "positives": [{"tag":string, "desc":string}], "negatives": [...], "summary": string}
    `;

    // 5. 调用 DeepSeek
// 5. 调用 DeepSeek
    console.log("--- Sending Prompt to DeepSeek ---");
    const aiRes = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_TOKEN}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'You are a professional Dutch real estate analyst. Output ONLY pure JSON.' },
          { role: 'user', content: prompt }
        ],
        // 关键：强制返回 JSON
        response_format: { type: 'json_object' }
      })
    });

    const aiData = await aiRes.json();
    
    // 调试：看看 DeepSeek 到底回了什么
    if (aiData.error) {
      console.error("❌ DeepSeek API Error:", aiData.error);
      throw new Error(`DeepSeek API Error: ${aiData.error.message}`);
    }

    if (!aiData.choices || aiData.choices.length === 0) {
      console.log("Full AI Response:", JSON.stringify(aiData));
      throw new Error('DeepSeek response invalid: Missing choices');
    }

    let rawContent = aiData.choices[0].message.content;
    
    // 容错处理：去掉可能存在的 Markdown 代码块标记
    rawContent = rawContent.replace(/```json/g, '').replace(/```/g, '').trim();

    let result;
    try {
      result = JSON.parse(rawContent);
    } catch (parseErr) {
      console.error("❌ JSON Parse Error. Raw content:", rawContent);
      throw new Error("Failed to parse AI response as JSON");
    }

    // 6. 存入缓存 (有效期 7 天)
    const finalResponse = { ...result, meta: scrapedData, timestamp: new Date() };
    await kv.set(cacheKey, finalResponse, { ex: 60 * 60 * 24 * 7 });

    return res.json(finalResponse);

  } catch (error) {
    console.error('[API Error]:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}