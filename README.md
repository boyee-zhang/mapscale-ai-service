# MapScale AI Service 🇳🇱

MapScale AI Service is a specialized microservice designed to perform deep Real Estate Investment Analysis for regions in the Netherlands. By aggregating high-granularity socio-economic data, the service provides an AI-driven "Investment Potential Score" to help users decide whether a specific area is a viable investment target.

## 🏗 Core Purpose

The service bridges the gap between raw statistical data and actionable investment insights. It analyzes four key dimensions:

1. Housing: Price trends, inventory, and historical value growth.

2. Traffic: Commuting efficiency and regional connectivity (via PV27 Proxy).

3. Population: Demographic shifts, education levels, and household income.

4. Safety: Crime rate trends and resolution metrics.

## 🛠 Technology Stack

We chose a modern, serverless-first stack to ensure low latency and high scalability:

* Runtime: Node.js (ES Modules) - For asynchronous data processing and efficient API handling.

* Deployment: Vercel - Providing a global edge network and seamless Serverless Functions (/api/analyze).

* Database: Upstash (Redis) - Used as a high-performance state store. We utilize Upstash for:

* Raw Caching: Storing expensive CBS/Eurostat API responses.

* Feature Store: Saving "refined" data (Transformers) to avoid redundant computation.

* Final Analysis Cache: Storing AI-generated reports for 7 days.

* LLM: DeepSeek-V3 - Leveraged for its high reasoning capabilities in analyzing complex JSON data structures and generating structured investment summaries.

## 📊 Data Sources

The engine consumes data from reputable Dutch and European statistical providers:

* CBS (Centraal Bureau voor de Statistiek): The primary source for Dutch municipal-level data. (https://opendata.cbs.nl/portal.html?_la=nl&_catalog=CBS)

* Eurostat: For broader European context and cross-border comparisons.(https://ec.europa.eu/eurostat/web/main/data/database)

## ⚙️ The Data Pipeline (Transformers)
### Our unique "Self-Healing" Pipeline ensures that the AI never analyzes stale or missing data.

Implementation Details:
1. Abstraction: Every data dimension (Housing, Safety, etc.) has a dedicated Transformer.

2. Data Provenance: Since high-resolution traffic data is often unavailable at the city level, we implemented a Regional Proxy logic (using North Holland/PV27) to provide the AI with the best possible context.

3. Efficiency: Transformers perform "heavy lifting" (calculating YoY growth, filtering noise) before the data hits the LLM, significantly reducing Token usage and improving AI accuracy.

4. Fault Tolerance: If a feature is missing from Upstash, the analyze endpoint triggers an automatic runFullSync -> Transform sequence before proceeding.

## 🚀 Getting Started

1. Environment Setup
Create a .env file in the root directory:
```
UPSTASH_REDIS_REST_URL=your_upstash_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_token
DEEPSEEK_API_TOKEN=your_deepseek_token
```

2. We use Vercel CLI to emulate the serverless environment locally or directly deploy on Vercel
```
bash npm install
```
## 📁 Project Structure
1. /api: Serverless entry points.

2. /lib/scraper.js: CBS OData integration logic.

3. /lib/transformers: Domain-specific data refining scripts.

4. /lib/kv.js: Upstash Redis client configuration.

5. /data: Local datasets for manual overrides (e.g., Traffic JSON).