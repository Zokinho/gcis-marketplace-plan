# GCIS Marketplace — CLAUDE.md

## Overview

B2B cannabis marketplace connecting licensed producers (sellers) with buyers. Products are synced from Zoho CRM, enriched with AI-extracted Certificate of Analysis (CoA) data, and surfaced in a marketplace with bidding, intelligence matching, and curated sharing.

---

## Architecture

| Layer | Stack |
|-------|-------|
| **Monorepo** | npm workspaces (`server/`, `client/`) |
| **Backend** | Express 4 + TypeScript + Prisma 6 (PostgreSQL) |
| **Frontend** | React 19 + Vite 6 + Tailwind CSS v4 + React Router v7 |
| **Auth** | Clerk (sign-up/sign-in, JWT middleware, webhook sync) |
| **CRM** | Zoho CRM API v7 (Canada region — zohocloud.ca) |
| **CoA** | Proxy to CoA microservice (Python/FastAPI at localhost:8000) |
| **Database** | PostgreSQL 16 via Docker on **port 5434** |
| **Testing** | Vitest + Supertest (289 tests across 14 files) |
| **Logging** | Pino (structured JSON) |

---

## Quick Start

```bash
# Start database
sudo docker compose up -d postgres

# Install deps
npm install

# Generate Prisma client & apply migrations
cd server && npx prisma generate && npx prisma migrate deploy && cd ..

# Copy .env.example → .env and fill in real values
cp .env.example .env

# Run dev (server + client concurrently)
npm run dev
```

### Environment Variables

See `.env.example`. Key vars:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection (port 5434 locally) |
| `CLERK_SECRET_KEY` / `VITE_CLERK_PUBLISHABLE_KEY` | Clerk auth |
| `CLERK_WEBHOOK_SECRET` | Svix signature verification |
| `ZOHO_CLIENT_ID` / `ZOHO_CLIENT_SECRET` / `ZOHO_REFRESH_TOKEN` | Zoho CRM OAuth |
| `ZOHO_ACCOUNTS_URL` | `https://accounts.zohocloud.ca` (Canada) |
| `ZOHO_API_URL` | `https://www.zohoapis.ca/crm/v7` (Canada) |
| `COA_API_URL` | CoA microservice URL (e.g. `http://localhost:8000`) |
| `COA_API_KEY` | Optional API key for CoA service |
| `ADMIN_EMAILS` | Comma-separated admin email addresses |
| `ZOHO_DEALS_ENABLED` | `true`/`false` — gates Zoho Deal creation on bid accept |

---

## Project Structure

```
gcis-marketplace-plan/
├── .env / .env.example
├── docker-compose.yml              # PostgreSQL, server, client containers
├── package.json                    # Workspace root (npm workspaces)
│
├── server/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── prisma/
│   │   ├── schema.prisma           # Full data model (16 models)
│   │   └── migrations/             # Versioned migrations (baseline + incremental)
│   └── src/
│       ├── index.ts                # Express entry, middleware, route mounting, cron setup
│       ├── middleware/
│       │   └── auth.ts             # requireAuth, marketplaceAuth, requireSeller, requireAdmin
│       ├── routes/
│       │   ├── admin.ts            # User management, sync triggers, CoA queue, audit log
│       │   ├── bids.ts             # Create bid, buyer/seller history, accept/reject/outcome
│       │   ├── coa.ts              # Upload CoA, status, preview, confirm/dismiss
│       │   ├── intelligence.ts     # Admin dashboard, matches, predictions, churn, market, scores
│       │   ├── marketplace.ts      # Product listing (filtered/paginated/FTS), product detail
│       │   ├── myListings.ts       # Seller listings, update, toggle active, share links
│       │   ├── notifications.ts    # List, count, mark read, preferences, broadcast
│       │   ├── onboarding.ts       # EULA accept, doc upload, onboarding status
│       │   ├── shares.ts           # Admin CRUD + public share viewer (token-based)
│       │   ├── shortlist.ts       # Toggle, list, check, count (buyer shortlist)
│       │   ├── user.ts             # User status/profile
│       │   └── webhooks.ts         # Clerk webhook (user.created/updated/deleted)
│       ├── services/
│       │   ├── auditService.ts     # logAudit (fire-and-forget), getRequestIp
│       │   ├── churnDetectionService.ts  # At-risk buyer detection
│       │   ├── coaClient.ts        # Axios client for CoA backend API
│       │   ├── coaEmailSync.ts     # Email-to-product pipeline (5-min cron)
│       │   ├── marketContextService.ts   # Price trends, supply/demand
│       │   ├── matchingEngine.ts   # 10-factor buyer-product scoring
│       │   ├── notificationService.ts    # createNotification, batch, prefs
│       │   ├── predictionEngine.ts # Reorder forecasting
│       │   ├── propensityService.ts      # RFM+ buyer scoring
│       │   ├── sellerDetection.ts  # Match email/company to marketplace sellers
│       │   ├── sellerScoreService.ts     # 4-metric seller reliability
│       │   ├── zohoApi.ts          # Zoho CRM CRUD operations
│       │   ├── zohoAuth.ts         # OAuth token management
│       │   └── zohoSync.ts         # Full + delta product/contact sync (15-min cron)
│       ├── utils/
│       │   ├── coaMapper.ts        # Map CoA extraction → Product fields
│       │   ├── cronLock.ts         # PostgreSQL advisory locks for cron jobs
│       │   ├── logger.ts           # Pino structured logger
│       │   ├── proximity.ts        # Bid proximity score calculator
│       │   └── validation.ts       # Zod schemas + validate/validateQuery/validateParams
│       └── __tests__/
│           ├── setup.ts            # Global Prisma + logger mocks
│           ├── admin.test.ts       # 18 tests
│           ├── auth.test.ts        # 17 tests
│           ├── bids.test.ts        # 22 tests
│           ├── coaMapper.test.ts   # 22 tests
│           ├── cronLock.test.ts    # 11 tests
│           ├── marketplace.test.ts # 32 tests
│           ├── matchingEngine.test.ts # 9 tests
│           ├── myListings.test.ts  # 19 tests
│           ├── notifications.test.ts  # 18 tests
│           ├── proximity.test.ts   # 21 tests
│           ├── sellerDetection.test.ts # 16 tests
│           ├── shares.test.ts      # 19 tests
│           └── validation.test.ts  # 49 tests
│
├── client/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx                 # Router + Clerk provider
│       ├── index.css               # Tailwind v4 @theme (brand colors, dark mode)
│       ├── lib/
│       │   ├── api.ts              # Axios client + Clerk token injection + all API functions
│       │   ├── useNotifications.ts # Polling hook (30s interval)
│       │   └── useShortlist.tsx   # Context provider + optimistic toggle hook
│       ├── components/
│       │   ├── Layout.tsx          # Main layout with nav, sidebar, notifications
│       │   ├── BidForm.tsx         # Bid placement form
│       │   ├── CoaUpload.tsx       # CoA PDF upload with drag-and-drop
│       │   ├── ErrorBoundary.tsx   # React error boundary
│       │   ├── FilterSidebar.tsx   # Marketplace filter panel
│       │   ├── HarvexLogo.tsx      # Brand logo SVG
│       │   ├── MarketTrendChart.tsx # Category price trends
│       │   ├── MatchCard.tsx       # Product recommendation card
│       │   ├── NotificationBell.tsx # Header bell + dropdown
│       │   ├── OutcomeForm.tsx     # Record delivery outcome
│       │   ├── PredictionCalendar.tsx # Weekly reorder view
│       │   ├── ProductCard.tsx     # Marketplace product card
│       │   ├── ProductDetailContent.tsx # Shared product detail view
│       │   ├── ProductListItem.tsx # Compact list view item
│       │   ├── ProductModal.tsx    # Product quick-view modal
│       │   ├── ProximityIndicator.tsx # Bid proximity gauge
│       │   ├── RiskBadge.tsx       # Color-coded risk chip
│       │   ├── ScoreBreakdown.tsx  # Match scoring factor bars
│       │   ├── SellerPicker.tsx    # Seller selection dropdown
│       │   ├── SellerScoreCard.tsx # 4-metric seller card
│       │   ├── ShortlistButton.tsx  # Bookmark icon (reusable, sm/md sizes)
│       │   ├── ShareModal.tsx      # Share link creation modal
│       │   ├── TestResultsDisplay.tsx # CoA test results viewer
│       │   └── ThemeToggle.tsx     # Dark/light mode toggle
│       └── pages/
│           ├── Landing.tsx         # Public landing page
│           ├── Onboarding.tsx      # EULA + doc upload flow
│           ├── PendingApproval.tsx  # Waiting for admin approval
│           ├── Dashboard.tsx       # User dashboard
│           ├── Marketplace.tsx     # Product browsing + filters
│           ├── ProductDetail.tsx   # Full product page
│           ├── CreateListing.tsx   # CoA-based product creation
│           ├── MyListings.tsx      # Seller inventory management
│           ├── Orders.tsx          # Bid history + accept/reject
│           ├── UserManagement.tsx  # Admin user approve/reject
│           ├── CoaEmailQueue.tsx   # Admin CoA email review queue
│           ├── CuratedShares.tsx   # Admin share link management
│           ├── ShareViewer.tsx     # Public share catalog view
│           ├── SharedProductDetail.tsx # Public product detail
│           ├── ShortlistPage.tsx    # Saved products page (sort/filter/paginate)
│           ├── NotificationsPage.tsx   # Full notification center
│           ├── IntelDashboard.tsx  # Intelligence hub (admin)
│           ├── MatchExplorer.tsx   # Match analysis (admin)
│           ├── PredictionsPage.tsx # Reorder predictions (admin)
│           ├── ChurnPage.tsx       # Churn risk analysis (admin)
│           ├── MarketIntelPage.tsx # Market trends (admin)
│           ├── SellerScorecardsPage.tsx # Seller reliability (admin)
│           ├── TransactionsPage.tsx    # Transaction history (admin)
│           └── BuyerMatchesPage.tsx    # Buyer-facing matches
```

---

## Data Model (Prisma)

17 models in `server/prisma/schema.prisma`:

| Model | Purpose |
|-------|---------|
| **User** | Clerk ↔ Zoho linked user (buyer/seller/admin) |
| **Product** | Cannabis product (synced from Zoho, enriched with CoA) |
| **Bid** | Buyer bid on a product (PENDING → ACCEPTED/REJECTED) |
| **Transaction** | Created when bid accepted (tracks delivery outcome) |
| **Match** | Auto-generated buyer-product recommendation (10-factor scoring) |
| **SellerScore** | 4-metric seller reliability score (fill rate, quality, delivery, pricing) |
| **Prediction** | Buyer reorder forecast by category |
| **ChurnSignal** | At-risk buyer detection |
| **PropensityScore** | RFM+ buyer purchasing propensity |
| **MarketPrice** | Category price trends with rolling averages |
| **Category** | Auto-populated product categories |
| **Notification** | In-app notifications (12 types, user preferences) |
| **SyncLog** | Zoho sync audit trail |
| **CoaSyncRecord** | CoA email → product pipeline tracking |
| **CuratedShare** | Token-based public product catalog links |
| **ShortlistItem** | Buyer-saved products (unique buyer+product, feeds intelligence) |
| **AuditLog** | Admin action audit trail |

### Full-Text Search

The `Product` table has a `search_vector` tsvector column managed **outside Prisma** via `fts-setup.sql`. After any migration that recreates the Product table, re-run:

```sql
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS search_vector tsvector;
CREATE INDEX IF NOT EXISTS product_search_idx ON "Product" USING gin(search_vector);
-- Plus the trigger from fts-setup.sql
```

---

## API Routes

### Public (no auth)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Health check (`?detailed=true` for full) |
| POST | `/api/webhooks` | Clerk webhook (Svix signature) |
| GET | `/api/shares/public/:token` | Public share catalog |
| GET | `/api/shares/public/:token/:productId` | Public product detail |

### Authenticated (Clerk + marketplace approval)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/user/status` | Current user status |
| POST | `/api/onboarding/eula` | Accept EULA |
| POST | `/api/onboarding/document` | Upload agreement doc |
| GET | `/api/marketplace/products` | Browse products (filtered, paginated, FTS) |
| GET | `/api/marketplace/products/:id` | Product detail |
| GET | `/api/marketplace/filters` | Available filter options |
| POST | `/api/bids` | Place a bid |
| GET | `/api/bids` | Buyer bid history |
| GET | `/api/bids/seller` | Seller incoming bids |
| PATCH | `/api/bids/:id/accept` | Accept bid → create Transaction |
| PATCH | `/api/bids/:id/reject` | Reject bid |
| PATCH | `/api/bids/:id/outcome` | Record delivery outcome |
| GET | `/api/notifications` | List notifications |
| GET | `/api/notifications/unread-count` | Unread count |
| PATCH | `/api/notifications/read` | Mark read (by IDs or all) |
| GET/PATCH | `/api/notifications/preferences` | Notification preferences |
| GET | `/api/matches` | Buyer's match suggestions |
| POST | `/api/matches/:id/dismiss` | Dismiss a match |
| POST | `/api/shortlist/toggle` | Add/remove product from shortlist |
| GET | `/api/shortlist` | Paginated shortlist (sort/filter) |
| GET | `/api/shortlist/check?productIds=a,b,c` | Bulk check shortlist state (max 50) |
| GET | `/api/shortlist/count` | Total shortlist count |

### Seller (requires seller role)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/my-listings` | Seller's products |
| PATCH | `/api/my-listings/:id` | Update price/qty/description |
| PATCH | `/api/my-listings/:id/toggle-active` | Pause/resume listing |
| POST | `/api/my-listings/share` | Create share link |
| GET | `/api/my-listings/shares` | List share links |
| DELETE | `/api/my-listings/shares/:id` | Deactivate share |

### Admin
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/users` | User list (filterable by status) |
| PATCH | `/api/admin/users/:id/approve` | Approve user |
| PATCH | `/api/admin/users/:id/reject` | Reject user |
| GET | `/api/admin/sync-status` | Zoho sync status |
| POST | `/api/admin/sync-now` | Trigger manual sync |
| GET | `/api/admin/coa-queue` | CoA email queue |
| POST | `/api/admin/coa-queue/:id/confirm` | Confirm CoA → product |
| POST | `/api/admin/coa-queue/:id/dismiss` | Dismiss CoA record |
| GET | `/api/admin/sellers` | Active sellers list |
| GET | `/api/admin/audit-log` | Audit log (paginated, filterable) |
| POST | `/api/notifications/admin/broadcast` | Send system announcement |
| GET | `/api/shares` | Manage curated shares |
| POST | `/api/shares` | Create curated share |
| DELETE | `/api/shares/:id` | Delete share |

### Intelligence (admin)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/intelligence/dashboard` | Consolidated KPIs |
| GET | `/api/intelligence/matches` | All matches (paginated) |
| POST | `/api/intelligence/matches/generate` | Trigger match generation |
| GET | `/api/intelligence/predictions` | Reorder predictions |
| GET | `/api/intelligence/predictions/calendar` | Weekly calendar view |
| GET | `/api/intelligence/churn/at-risk` | At-risk buyers |
| GET | `/api/intelligence/churn/stats` | Churn statistics |
| POST | `/api/intelligence/churn/detect` | Run churn detection |
| GET | `/api/intelligence/market/trends` | Price trends |
| GET | `/api/intelligence/market/insights` | Dashboard insights |
| GET | `/api/intelligence/market/:categoryName` | Category context |
| GET | `/api/intelligence/propensity/top` | Top buyers by score |
| GET | `/api/intelligence/seller-scores` | All seller scores |
| POST | `/api/intelligence/seller-scores/recalculate` | Recalculate scores |
| GET | `/api/intelligence/transactions` | Transaction history |

---

## Auth Model

1. **Clerk** handles sign-up/sign-in and issues JWTs
2. **`requireAuth()`** — Clerk middleware validates JWT
3. **`marketplaceAuth`** — Checks user exists in DB with `approved: true`
4. **`requireSeller`** — Checks `contactType` includes "Seller"
5. **`requireAdmin`** — Checks email is in `ADMIN_EMAILS` env var

### Middleware Chain
```
Public:     no middleware
Auth only:  requireAuth()
Marketplace: requireAuth() → marketplaceAuth
Seller:     requireAuth() → marketplaceAuth → requireSeller
Admin:      requireAuth() → marketplaceAuth → requireAdmin
```

---

## Cron Jobs

| Job | Schedule | Lock ID | Description |
|-----|----------|---------|-------------|
| Zoho Sync | Every 15 min | 100001 | Delta products + contacts |
| CoA Email Sync | Every 5 min | 100002 | Poll CoA backend for email ingestions |
| Predictions + Churn | Daily midnight | 100003, 100004 | Reorder forecasts + at-risk buyers |
| Propensity Scores | Daily 1am | 100005 | RFM+ buyer scoring |
| Seller Scores | Daily 2am | 100006 | 4-metric reliability recalc |

All cron jobs use **PostgreSQL advisory locks** (`withCronLock()`) to prevent duplicate execution across multiple server instances.

---

## Intelligence Engine

### Matching (10 factors)
| Factor | Weight | Source |
|--------|--------|--------|
| Category match | 15% | Buyer's bid/transaction history |
| Buyer propensity | 15% | PropensityScore model |
| Price fit | 12% | Product price vs buyer's typical spend |
| Relationship history | 10% | Prior transactions with seller |
| Reorder timing | 10% | Prediction model |
| Seller reliability | 10% | SellerScore model |
| Price vs market | 10% | Product price vs MarketPrice.rollingAvg30d |
| Quantity fit | 8% | gramsAvailable vs buyer's typical order |
| Location match | 5% | Buyer vs seller country |
| Supply/demand | 5% | Predicted reorders / active products |

### Seller Score (4 components)
- Fill rate (30%) — actualQuantityDelivered / ordered
- Quality (30%) — % where qualityAsExpected = true
- Delivery (25%) — % where deliveryOnTime = true
- Pricing (15%) — Competitiveness vs category average

### Churn Risk Levels
- `critical` — daysSince/avgInterval >= 3 (score 80-100)
- `high` — ratio 2-3 (score 60-80)
- `medium` — ratio 1.5-2 (score 40-60)
- `low` — ratio 1-1.5 (score 0-40)

### Propensity Score (RFM+)
- Recency (25%), Frequency (20%), Monetary (15%), Category Affinity (15%), Engagement (25%)

---

## Zoho CRM Integration

### API Gotchas
- **Canada region**: `zohocloud.ca` / `zohoapis.ca` (not `.com`)
- **Field names differ from labels** — use `/settings/fields?module=X` to discover real `api_name`
- **Key field mappings**: `Categories` (Type), `Manufacturer_name` (LP), `Min_Request_G_Including_5_markup` (Price), `THC_as_is`/`CBD_as_is`
- **`Contact_Name`** accepts plain string ID (not object)
- **`Certification`/`Categories`** are `multiselectpicklist` — send as arrays
- **File uploads require v2 API** — v7 silently ignores `file_id`
- **Token refresh** can return HTTP 200 with `{error}` — always check `response.data.error`
- **`trigger: []`** on ALL writes to suppress Zoho workflow rules

### Sync Strategy
- **Delta sync** (default cron): `Modified_Time:greater_than` search, falls back to full sync on error
- **Full sync**: available via admin `POST /api/admin/sync-now`
- **Bid writeback**: accept/reject/outcome → Zoho Tasks + optional Deal creation
- **Onboarding writeback**: EULA_Accepted/Agreement_Uploaded → Zoho Contact

---

## Security

### Input Validation
All routes use **Zod schemas** via middleware:
- `validate(schema)` — request body
- `validateQuery(schema)` — query parameters (with coercion)
- `validateParams(schema)` — URL parameters

15 schemas in `server/src/utils/validation.ts` covering marketplace, notifications, intelligence, bids, CoA, and admin routes.

### Other Measures
- **Helmet** + **CORS** (configurable origin)
- **Rate limiting**: 200/min general (reads), 30/min writes (route-level on POST/PATCH/DELETE for bids + listings), 30/min auth, 60/min public
- **Clerk JWT** verification on all protected routes
- **Svix signature** verification on webhooks
- **Zoho file proxy** requires auth + validates product exists in DB
- **PDF magic byte** validation (`%PDF-`) on CoA upload
- **`$queryRaw` tagged templates** (not `$queryRawUnsafe`) for SQL
- **Admin audit log** — all admin actions logged with actor, action, target, IP

### Public Routes (no auth required)
- `/api/health` — Health check
- `/uploads/*` — Static file serving
- `/api/webhooks` — Clerk webhook (Svix signature verification)
- `/api/shares/public/*` — Token-based share access

---

## Audit Log

Actions logged: `user.approve`, `user.reject`, `sync.trigger`, `coa.confirm`, `coa.dismiss`, `bid.accept`, `bid.reject`, `bid.outcome`, `notification.broadcast`

`GET /api/admin/audit-log` — Paginated, filterable by action, actorId, targetType, date range.

---

## Notification System

13 notification types: `BID_RECEIVED`, `BID_ACCEPTED`, `BID_REJECTED`, `BID_COUNTERED`, `BID_OUTCOME`, `PRODUCT_NEW`, `PRODUCT_PRICE`, `PRODUCT_STOCK`, `MATCH_SUGGESTION`, `COA_PROCESSED`, `PREDICTION_DUE`, `SHORTLIST_PRICE_DROP`, `SYSTEM_ANNOUNCEMENT`

- Fire-and-forget `createNotification()` respects per-user preferences
- `SYSTEM_ANNOUNCEMENT` always delivered (cannot be disabled)
- Frontend: 30-second polling via `useNotifications` hook + `NotificationBell` dropdown

---

## Testing

```bash
cd server
npm test              # Run all 273 tests
npm run test:watch    # Watch mode
npm run test:coverage # With coverage report
```

| Test File | Count | Type |
|-----------|-------|------|
| validation.test.ts | 49 | Unit — Zod schema validation |
| marketplace.test.ts | 32 | Integration — product listing/detail/filters |
| coaMapper.test.ts | 22 | Unit — CoA → Product field mapping |
| bids.test.ts | 22 | Integration — bid CRUD + accept/reject/outcome |
| proximity.test.ts | 21 | Unit — proximity score calculation |
| myListings.test.ts | 19 | Integration — seller listings/shares |
| shares.test.ts | 19 | Integration — curated share CRUD |
| notifications.test.ts | 18 | Integration + Unit — routes + service logic |
| admin.test.ts | 18 | Integration — user management + sync + queue |
| auth.test.ts | 17 | Unit — auth middleware chain |
| sellerDetection.test.ts | 16 | Unit — email/company/producer matching |
| cronLock.test.ts | 11 | Unit — PostgreSQL advisory lock behavior |
| shortlist.test.ts | 16 | Integration — toggle, list, check, count |
| matchingEngine.test.ts | 9 | Unit — 10-factor scoring algorithm |

### Test Patterns
- Global mock setup in `__tests__/setup.ts` (Prisma + logger)
- `createTestApp()` factory injects `req.user` for auth simulation
- `vi.mock()` for service isolation, `vi.mocked()` for type-safe access
- `vi.clearAllMocks()` in every `beforeEach`

---

## Brand Colors

| Name | Hex | CSS Variable |
|------|-----|-------------|
| Teal | `#265463` | `--color-brand-teal` |
| Blue | `#207AD5` | `--color-brand-blue` |
| Yellow | `#F5DE5C` | `--color-brand-yellow` |
| Coral | `#F07878` | `--color-brand-coral` |
| Gray | `#DBE0EB` | `--color-brand-gray` |
| Sage | `#91C9BF` | `--color-brand-sage` |
| Off-white | `#FAFAFA` | `--color-brand-offwhite` |
| Dark | `#242424` | `--color-brand-dark` |

Defined in `client/src/index.css` via Tailwind v4 `@theme` directive. Dark mode supported via `ThemeToggle` component.

---

## Docker / Deployment

```bash
# Local dev (database only)
sudo docker compose up -d postgres

# Full stack — dev (HTTP only)
sudo docker compose up -d

# Full stack — production (HTTPS via Let's Encrypt)
sudo bash scripts/init-letsencrypt.sh   # First time only
sudo docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

- **Server Dockerfile**: `prisma migrate deploy` on startup (safe for production)
- **Client Dockerfile**: Dual-mode Nginx — dev (HTTP) or production (TLS termination via `SSL_DOMAIN` env)
- **Docker Compose**: postgres (5434→5432), server (3001), client (80)
- **Docker Compose Prod Override**: client (80+443), certbot (auto-renewal every 12h)
- **GitHub Actions CI**: Build + test pipeline

### HTTPS / SSL
- **TLS termination** at Nginx (client container) — Express stays HTTP behind reverse proxy
- **Let's Encrypt** certificates via Certbot webroot ACME challenge
- **Auto-renewal**: certbot container runs `certbot renew` every 12 hours
- **HSTS**: Strict-Transport-Security header (1 year, includeSubDomains, preload) — gated by `FORCE_HTTPS`
- **HTTPS redirect**: Express middleware + Nginx 301 redirect — both gated by `FORCE_HTTPS`
- **trust proxy**: `app.set('trust proxy', 1)` ensures `req.ip` and `req.protocol` are correct behind Nginx
- **Dev mode**: No SSL, no HSTS, no redirect — works unchanged on HTTP

---

## Development Notes

### Prisma Migrations
- Baseline migration `0_baseline` created and applied
- Future changes: `cd server && npx prisma migrate dev --name <description>`
- Production: `npx prisma migrate deploy` (in Dockerfile CMD)
- FTS `search_vector` column managed outside Prisma — re-run after table recreation

### Technical Gotchas
- Prisma `Json` fields need `Prisma.JsonNull` instead of `null` for nullable Json
- Express `req.params` needs `Request<{ paramName: string }>` type annotation
- `validateQuery` assigns coerced values to `(req as any).query` (TS workaround for `ParsedQs` type)
- Prisma `@@unique` composite keys with nullable fields: use sentinel value (e.g. `"_all"`) instead of null
- Route ordering: `/bids/seller` must be defined before `/bids/:id`
- Docker requires `sudo` (user not in docker group)
- Three Postgres containers on this machine: taskflow (5433), dealintel-db (5432), gcis-postgres (5434)

### Tailwind v4
- Uses `@tailwindcss/vite` plugin (no `tailwind.config.js`)
- Brand colors in `client/src/index.css` via `@theme` directive
- Dark mode via CSS `prefers-color-scheme` + manual toggle

---

## Implementation History

| Phase | Prompt | What was built |
|-------|--------|---------------|
| 1 | 1 | Project init — monorepo, Docker, Prisma schema, Express skeleton |
| 1 | 2 | Auth flow — Clerk integration, webhook sync, middleware chain |
| 2 | 3 | Zoho sync engine — OAuth, product/contact sync, cron job |
| 3 | 4 | Marketplace UI — product listing, filters, FTS, product detail |
| 4 | 5 | Seller features — my listings, update, toggle active, share links |
| 4 | 6 | Bid system — create bid, history, proximity scoring |
| 5 | 7 | CoA backend — upload, extraction proxy, email sync, seller detection |
| 5 | 8 | CoA frontend + curated shares — CoA upload UI, share viewer, admin queue |
| 6 | 9 | Intelligence backend — 6 services, 8 models, matching/predictions/churn |
| 6 | 10 | Intelligence frontend — 8 admin pages, buyer matches, score visualizations |
| 7 | 11 | Zoho deep sync — delta sync, bid writeback, deal creation, file URLs |
| 8 | 12 | Notification system — 12 types, preferences, bell, broadcast, polling |
| 9 | 13 | Security hardening — Zod validation, $queryRaw, auth on file proxy, PDF validation |
| 10 | 14 | Admin audit log — AuditLog model, fire-and-forget logging, filterable API |
| 11 | 15 | Shortlist — product saving, intelligence integration, price-drop notifications |
| 15 | 19 | HTTPS/SSL — Nginx TLS termination, Let's Encrypt, HSTS, HTTPS redirect |

### Production Hardening (cross-cutting)
- Structured logging (pino) — replaced 130+ console.log/error calls
- Global error handling — Express catch-all, process.on handlers, React ErrorBoundary
- Database indexes on all foreign keys
- PostgreSQL advisory lock cron locking (6 jobs)
- Docker startup with `prisma migrate deploy`
- Health check with detailed mode (DB, Zoho, Clerk, CoA)
- Rate limiting (4 tiers)
- 289 tests across 14 files
- Dark mode support across all pages

---

## Production Readiness — Remaining Items

### P0 — Must fix before launch
- [ ] **Rotate credentials** — .env has real keys in git history; revoke and regenerate

### P1 — High risk
- [x] **File uploads → S3/GCS** — DigitalOcean Spaces with presigned URLs (Phase 14)
- [x] **HTTPS/SSL** — Nginx TLS termination + Let's Encrypt + HSTS + redirect (Phase 15)

### P2 — Medium risk
- [ ] **Monitoring** — No Sentry/APM/log aggregation yet

### P3 — Nice to have
- [x] **CSRF protection** — Origin/Referer validation on mutating requests
- [ ] **E2E tests** — Full signup → onboarding → marketplace → bid flow

---

## Related Projects

- **CoA Project**: `/home/okinho1/gcis-coa-project/` — Python/FastAPI, Claude Vision AI extraction
- **Deal Intelligence**: `/home/okinho1/deal-intelligence/` — Original matching algorithm (adapted into Phase 6)

# Security Audit — CLAUDE.md Snippet

Add the following to the CLAUDE.md file in any project root where you want
Claude Code to automatically run security checks before deployment.

---

## Paste this into your project's CLAUDE.md:

```markdown
## Pre-Deployment Security Protocol

Before any production deployment, build completion, or when I say "run security audit":

1. Run `bash security-audit.sh .` from the project root
2. Review every FAIL and WARN item
3. Fix all FAIL items before proceeding — do not skip any
4. For each WARN item, explain whether it's a real risk or a false positive
5. Generate the security-audit-report.md and show me the summary

### Security rules to follow at all times during development:

- Never hardcode API keys, tokens, or secrets — always use environment variables
- Every API route must have server-side authentication — never rely on frontend-only protection
- Always use parameterized queries — never concatenate user input into SQL/DB queries
- Sanitize all user input server-side before processing or storing
- Set CORS to specific origins, never wildcard (*) in production
- File uploads must validate type and size server-side
- Use NEXT_PUBLIC_ prefix ONLY for values safe to expose to the browser
- Add security headers (CSP, X-Frame-Options, HSTS) to all projects
- Never log sensitive data (passwords, tokens, keys) even in dev mode
```

---

## Setup Instructions

1. Copy `security-audit.sh` to your project root (or a `scripts/` directory)
2. Make it executable: `chmod +x security-audit.sh`
3. Add the snippet above to your project's `CLAUDE.md`
4. Add `security-audit-report.md` to your `.gitignore` (it's a temp output)

Now whenever you tell Claude Code "we're ready to deploy" or "run security audit",
it will execute the script and walk through the findings with you.

You can also run it yourself anytime: `bash security-audit.sh`