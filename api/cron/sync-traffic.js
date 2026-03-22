import { syncAllProvinceTraffic } from '../../lib/etl/sync_traffic.js';

/**
 * Vercel Cron endpoint — runs on the 1st of every month at 03:00 UTC.
 * Configured in vercel.json: { "path": "/api/cron/sync-traffic", "schedule": "0 3 1 * *" }
 *
 * Vercel automatically sets the CRON_SECRET env var. We validate it here
 * so the endpoint cannot be triggered by random external callers.
 */
export default async function handler(req, res) {
    const authHeader = req.headers['authorization'];
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const result = await syncAllProvinceTraffic();
        return res.status(200).json({
            ok: true,
            ...result,
            triggered_at: new Date().toISOString()
        });
    } catch (error) {
        console.error('💥 [Cron] Traffic ETL failed:', error);
        return res.status(500).json({ error: error.message });
    }
}
