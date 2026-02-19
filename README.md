# GCIS Marketplace

B2B cannabis marketplace connecting licensed producers with buyers. Products sync from Zoho CRM and are enriched with AI-extracted Certificate of Analysis (CoA) data. Features intelligent matching, bidding, curated share links, and a comprehensive intelligence dashboard.

## Tech Stack

- **Backend**: Express + TypeScript, Prisma, PostgreSQL
- **Frontend**: React 19 + Vite, Tailwind CSS
- **Auth**: JWT (bcrypt, access + refresh tokens)
- **Integrations**: Zoho CRM API, CoA extraction microservice (Claude Vision)
- **Infrastructure**: Docker Compose, Nginx + Let's Encrypt SSL
- **Monitoring**: Sentry, Prometheus, Pino logging
- **Testing**: Vitest + Supertest (380+ tests)

## Features

**Marketplace**
- Real-time Zoho CRM product sync (15-min delta sync)
- Full-text search with relevance ranking
- Advanced filtering (category, THC/CBD ranges, certifications, producer)
- Bid placement with competitiveness scoring

**Intelligence Engine**
- Buyer-product matching (10-factor scoring)
- Seller reliability scorecards (fill rate, quality, delivery, pricing)
- Reorder predictions and churn detection
- Propensity scoring (RFM+ model)
- Market context (price trends, supply/demand ratios)

**Additional**
- Certificate of Analysis PDF upload + AI extraction
- Curated share links (token-based public catalogs)
- Notification system (13 types, per-user preferences)
- Admin tools with audit logging

## Project Structure

```
server/                 # Express API
  src/
    routes/             # 11 API route modules
    services/           # Matching engine, churn detection, Zoho sync
    middleware/          # JWT auth
    __tests__/          # 22 test files
  prisma/               # Schema (17 models) + migrations

client/                 # React frontend
  src/
    pages/              # 20+ feature pages
    components/         # 25+ reusable components
    lib/                # API client, auth context
```

## Getting Started

```bash
# Start PostgreSQL
docker compose up -d postgres

# Install and run
npm install
npm run build
npm run dev          # Starts server + client concurrently
```

## Environment Variables

Copy `.env.example` to `.env` and configure:
- `DATABASE_URL` - PostgreSQL connection
- `JWT_SECRET`, `JWT_REFRESH_SECRET` - Auth tokens
- `ZOHO_*` - CRM integration
- `COA_API_URL` - AI extraction service
- `SENTRY_DSN` - Error tracking

## License

Proprietary
