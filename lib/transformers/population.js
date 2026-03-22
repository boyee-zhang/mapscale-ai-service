import { kv } from '../kv.js';

/**
 * Population & Neighborhood Transformer
 * 功能：提取社区画像（受教育程度、家庭结构、收入、便利性）
 */
export async function savePopulationFeatures(regionCode) {
    const rawKey = `raw:population:${regionCode}`;
    const featureKey = `features:population:${regionCode}`;

    console.log(`🔄 [Processing] 正在生成社区画像特征: ${regionCode}...`);

    // 1. 获取原始数据
    const response = await kv.get(rawKey);
    const rawData = response?.data || response;

    if (!rawData || !Array.isArray(rawData) || rawData.length === 0) {
        console.error("❌ 无法找到原始人口数据");
        return;
    }

    const d = rawData[0]; // 这是一个快照数据，通常取第一条（最顶级行政区）

    // 2. 关键指标提取与计算
    const totalInhabitants = parseInt(d.AantalInwoners_5);
    
    // A. 教育水平占比 (HboWo_72 是高学历人数)
    const highEdRatio = ((parseInt(d.HboWo_72) / (parseInt(d.BasisonderwijsVmboMbo1_70) + parseInt(d.HavoVwoMbo24_71) + parseInt(d.HboWo_72))) * 100).toFixed(1) + "%";

    // B. 家庭画像
    const householdTotal = parseInt(d.HuishoudensTotaal_29);
    const familyWithKidsRatio = ((parseInt(d.HuishoudensMetKinderen_32) / householdTotal) * 100).toFixed(1) + "%";

    // C. 经济画像
    const avgIncomePerReceiver = parseFloat(d.GemiddeldInkomenPerInkomensontvanger_80); // 单位：1000 EUR
    const povertyRatio = d.HuishoudensMetEenLaagInkomen_87 + "%";

    // D. 居住环境 (Stedelijkheid: 1 = 极度城市化, 5 = 非城市化)
    const urbanLevel = d.MateVanStedelijkheid_125;
    
    // E. 设施距离 (单位：km)
    const facilityAccess = {
        supermarket_km: parseFloat(d.AfstandTotGroteSupermarkt_116),
        primary_school_km: parseFloat(d.AfstandTotSchool_118),
        gp_doctor_km: parseFloat(d.AfstandTotHuisartsenpraktijk_115)
    };

    // 3. 构造 AI 特征包
    const features = {
        summary: {
            region_name: d.Gemeentenaam_1.trim(),
            population_density_per_km2: d.Bevolkingsdichtheid_34.trim(),
            avg_household_size: d.GemiddeldeHuishoudensgrootte_33.trim(),
            urban_level_score: urbanLevel, // 1 是最高
        },
        social_status: {
            high_education_rate: highEdRatio,
            family_with_children_rate: familyWithKidsRatio,
            avg_income_per_receiver_k: avgIncomePerReceiver,
            home_ownership_rate: d.Koopwoningen_41 + "%"
        },
        amenities: {
            ...facilityAccess,
            car_per_household: d.PersonenautoSPerHuishouden_112.trim()
        },
        ai_signal: parseInt(highEdRatio) > 40 ? "High-End Intellectual Neighborhood" : "Mixed/Diverse Neighborhood"
    };

    // 4. 打印结果
    console.log(`\n👥 --- NEIGHBORHOOD PROFILE: ${regionCode} ---`);
    console.table(features.social_status);
    console.table(features.amenities);
    console.log(`💡 AI Signal: ${features.ai_signal}`);
    console.log("----------------------------------------------\n");

    // 5. 存储
    await kv.set(featureKey, features);
    console.log(`✅ [Saved] 社区特征已存入: ${featureKey}`);

    return features;
}

/**
 * --- 启动函数 ---
 */
// if (process.argv[1] && process.argv[1].includes('population.js')) {
//     const region = process.argv[2] || "GM0384"; 
//     (async () => {
//         const dotenv = await import('dotenv');
//         dotenv.config();
//         try {
//             await savePopulationFeatures(region);
//             process.exit(0);
//         } catch (err) {
//             console.error("💥 失败:", err.message);
//             process.exit(1);
//         }
//     })();
// }