// lib/kv.js
import nodeFetch from 'node-fetch';

// 内部辅助函数：获取配置并校验
const getConfig = () => {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.error("❌ ERROR: Upstash KV credentials missing in environment variables!");
  }
  
  // 处理 URL 格式，确保没有末尾斜杠且包含协议
  const formattedUrl = url?.startsWith('http') ? url : `https://${url}`;
  return { url: formattedUrl?.replace(/\/$/, ""), token };
};

/**
 * 封装为 kv 对象导出，确保与 analyze.js 中的 import { kv } 兼容
 */
export const kv = {
  async get(key) {
    const { url, token } = getConfig();
    if (!url) throw new Error("KV URL is not defined");

    const fullUrl = `${url}/get/${encodeURIComponent(key)}`;
    
    const res = await nodeFetch(fullUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) throw new Error(`KV GET failed: ${res.status}`);
    
    const data = await res.json();
    // Upstash REST API 返回格式为 { result: "..." }
    if (data.result === null) return null;
    
    try {
      return JSON.parse(data.result);
    } catch {
      return data.result;
    }
  },

  async set(key, value, options = {}) {
    const { url, token } = getConfig();
    if (!url) throw new Error("KV URL is not defined");

    const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
    
    // 如果有过期时间参数 (例如 { ex: 604800 })
    let fullUrl = `${url}/set/${encodeURIComponent(key)}`;
    if (options.ex) {
      fullUrl += `?ex=${options.ex}`;
    }

    const res = await nodeFetch(fullUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'text/plain'
      },
      body: valueStr
    });

    if (!res.ok) throw new Error(`KV SET failed: ${res.status}`);
    const data = await res.json();
    return data.result === 'OK';
  }
};