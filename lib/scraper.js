// lib/scraper.js
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

export const getAreaStats = async (city) => {
  if (!city) return { error: 'No city provided' };

  // 1. 尝试多个可能的路径
  const urls = [
    `https://allecijfers.nl/woonplaats/${city.toLowerCase()}/`,
    `https://allecijfers.nl/gemeente/${city.toLowerCase()}/`
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
      });

      if (!response.ok) continue;

      const html = await response.text();
      const $ = cheerio.load(html);

      // --- 关键改进：定义一个“深度搜索”函数 ---
      const findValueByLabel = (label) => {
        let result = 'N/A';
        // 遍历所有 td 标签
        $('td').each((i, el) => {
          const text = $(el).text().trim();
          // 如果这个 td 包含我们要找的关键字
          if (text.includes(label)) {
            // 获取它的下一个兄弟节点 (通常是存放数值的 td)
            const val = $(el).next().text().trim();
            if (val && val !== '') {
              result = val;
              return false; // 找到后跳出循环
            }
          }
        });
        return result;
      };

      // 提取关键指标（使用最准确的荷兰语标签）
      const stats = {
        // 人口：尝试从标题提取或表格提取
        population: findValueByLabel('Aantal inwoners'),
        // 房价：WOZ-waarde 是荷兰房产价值的标准称呼
        avg_house_value: findValueByLabel('Gemiddelde WOZ-waarde'),
        // 收入：
        avg_income: findValueByLabel('Gemiddeld inkomen per inwoner'),
        source_url: url,
        last_updated: $('meta[property="article:modified_time"]').attr('content') || new Date().toISOString()
      };

      // 只要抓到一个核心数据，就返回
      if (stats.population !== 'N/A' || stats.avg_house_value !== 'N/A') {
        return stats;
      }
    } catch (error) {
      console.warn(`[Scraper Trace]: Failed ${url}`);
    }
  }

  return { population: 'N/A', avg_house_value: 'N/A', source_url: urls[0] };
};