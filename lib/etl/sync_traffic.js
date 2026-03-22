import dotenv from 'dotenv';
dotenv.config();

import nodeFetch from 'node-fetch';
import { kv } from '../kv.js';

/**
 * Dutch province codes (CBS format, padded to 6 chars)
 * CBS pads region codes with trailing spaces in OData filters.
 */
const DUTCH_PROVINCES = [
    { code: 'PV20', name: 'Groningen' },
    { code: 'PV21', name: 'Friesland' },
    { code: 'PV22', name: 'Drenthe' },
    { code: 'PV23', name: 'Overijssel' },
    { code: 'PV24', name: 'Flevoland' },
    { code: 'PV25', name: 'Gelderland' },
    { code: 'PV26', name: 'Utrecht' },
    { code: 'PV27', name: 'Noord-Holland' },
    { code: 'PV28', name: 'Zuid-Holland' },
    { code: 'PV29', name: 'Zeeland' },
    { code: 'PV30', name: 'Noord-Brabant' },
    { code: 'PV31', name: 'Limburg' },
];

const TABLE_ID = '84713NED';

// Reismotieven codes: commute (2030170) + leisure (2030190) + total (T001080)
// Populatie: A048709 = persons 6+ years
const REISMOTIEVEN_FILTER = [
    "Reismotieven eq '2030170'",
    "Reismotieven eq '2030190'",
    "Reismotieven eq 'T001080'"
].join(' or ');

const FIELDS = 'ID,Populatie,Geslacht,Persoonskenmerken,Reismotieven,Marges,RegioS,Perioden,Verplaatsingen_4,Afstand_5,Reisduur_6';

function buildUrl(provinceCode) {
    // CBS OData pads region codes with trailing spaces (e.g. "PV27    ")
    const paddedCode = provinceCode.padEnd(8);
    const filter = `((${REISMOTIEVEN_FILTER})) and ((Populatie eq 'A048709')) and ((RegioS eq '${paddedCode}'))`;
    return `https://opendata.cbs.nl/ODataFeed/odata/${TABLE_ID}/UntypedDataSet?$filter=${encodeURIComponent(filter)}&$select=${FIELDS}&$format=json`;
}

async function syncProvince(province) {
    const url = buildUrl(province.code);
    console.log(`📡 Fetching traffic data: ${province.name} (${province.code})...`);

    const response = await nodeFetch(url, {
        method: 'GET',
        timeout: 30000,
        headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
        throw new Error(`CBS API error ${response.status} for ${province.code}`);
    }

    const json = await response.json();
    const data = json.value || [];

    if (data.length === 0) {
        console.warn(`⚠️  No data returned for ${province.code}`);
    }

    const payload = {
        metadata: {
            category: 'traffic',
            tableId: TABLE_ID,
            regionCode: province.code,
            regionName: province.name,
            lastSynced: new Date().toISOString(),
            rowCount: data.length
        },
        data
    };

    await kv.set(`raw:traffic:${province.code}`, payload);
    console.log(`✅ Saved raw:traffic:${province.code} (${data.length} rows)`);
    return payload;
}

/**
 * Run the full traffic ETL for all Dutch provinces.
 * Safe to call from a cron endpoint or manually via CLI.
 */
export async function syncAllProvinceTraffic() {
    console.log(`\n🚀 [Traffic ETL] Starting monthly sync for ${DUTCH_PROVINCES.length} provinces...`);
    const startTime = Date.now();

    const results = await Promise.allSettled(
        DUTCH_PROVINCES.map(p => syncProvince(p))
    );

    let succeeded = 0;
    let failed = 0;
    console.log('\n--- Traffic ETL Summary ---');
    DUTCH_PROVINCES.forEach((p, i) => {
        if (results[i].status === 'fulfilled') {
            console.log(`🟢 ${p.code} ${p.name.padEnd(15)}: OK`);
            succeeded++;
        } else {
            console.log(`🔴 ${p.code} ${p.name.padEnd(15)}: FAILED — ${results[i].reason.message}`);
            failed++;
        }
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✨ Done in ${duration}s | ${succeeded} succeeded, ${failed} failed\n`);

    return { succeeded, failed, duration };
}

// Allow direct CLI execution: node lib/etl/sync_traffic.js
if (process.argv[1]?.includes('sync_traffic')) {
    syncAllProvinceTraffic()
        .then(() => process.exit(0))
        .catch(err => { console.error('💥', err); process.exit(1); });
}
