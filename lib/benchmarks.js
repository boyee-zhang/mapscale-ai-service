/**
 * Dutch national benchmark reference values (CBS, ~2022-2023 averages).
 * Injected into the AI prompt so the model can produce meaningful comparisons.
 */
export const NL_BENCHMARKS = {
    safety: {
        metric: "Safety Index (100 − crime_per_1000_inhabitants)",
        unit: "index points (0–100, higher = safer)",
        national_avg: 37.0,
        thresholds: {
            "Very Safe":        "> 65  (crime_per_1k < 35)",
            "Safe / Secure":    "50–65 (crime_per_1k 35–50)",
            "Average":          "20–50 (crime_per_1k 50–80)",
            "High Crime Alert": "< 20  (crime_per_1k > 80)"
        },
        note: "Netherlands national avg crime_per_1k ≈ 63, so national avg safety index ≈ 37"
    },
    commute: {
        metric: "Commute Efficiency (km / min)",
        unit: "km per minute",
        national_avg: 19.5,
        thresholds: {
            "Excellent":  "> 25 km/min",
            "Good":       "20–25 km/min",
            "Average":    "15–20 km/min",
            "Congested":  "< 15 km/min"
        },
        note: "Provincial averages range from ~16 (Zuid-Holland) to ~23 (Groningen)"
    },
    education: {
        metric: "High Education Rate (HBO/WO graduates as % of working-age population)",
        unit: "percentage (%)",
        national_avg: 32.0,
        thresholds: {
            "Highly Educated":  "> 45%",
            "Above Average":    "35–45%",
            "Average":          "25–35%",
            "Below Average":    "< 25%"
        },
        note: "Major cities (Amsterdam, Utrecht) typically 40–55%; rural areas 20–28%"
    },
    housing_yoy: {
        metric: "Year-on-Year housing price growth",
        unit: "percentage (%)",
        national_avg: 5.5,
        thresholds: {
            "High Growth":   "> 10%",
            "Above Average": "5–10%",
            "Moderate":      "0–5%",
            "Declining":     "< 0%"
        },
        note: "2015–2022 avg was ~8%; 2023 correction brought national avg closer to 3–5%"
    }
};
