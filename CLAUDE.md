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
| **Auth** | Self-hosted bcrypt + JWT (access token 15min + refresh token 7d httpOnly cookie) |
| **CRM** | Zoho CRM API v7 (Canada region — zohocloud.ca) |
| **CoA** | Proxy to CoA microservice (Python/FastAPI at localhost:8000) |
| **Database** | PostgreSQL 16 via Docker on **port 5434** |
| **Testing** | Vitest + Supertest (404 tests across 23 files) |
| **Logging** | Pino (structured JSON) + pino-sentry-transport |
| **Monitoring** | Sentry (backend + frontend) + Prometheus metrics |

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
| `JWT_SECRET` | Secret for signing access tokens (required) |
| `JWT_REFRESH_SECRET` | Secret for signing refresh tokens (required) |
| `ZOHO_CLIENT_ID` / `ZOHO_CLIENT_SECRET` / `ZOHO_REFRESH_TOKEN` | Zoho CRM OAuth |
| `ZOHO_ACCOUNTS_URL` | `https://accounts.zohocloud.ca` (Canada) |
| `ZOHO_API_URL` | `https://www.zohoapis.ca/crm/v7` (Canada) |
| `COA_API_URL` | CoA microservice URL (e.g. `http://localhost:8000`) |
| `COA_API_KEY` | Optional API key for CoA service |
| `ADMIN_EMAILS` | Comma-separated admin email addresses |
| `ZOHO_DEALS_ENABLED` | `true`/`false` — gates Zoho Deal creation on bid accept |
| `SENTRY_DSN` | Backend Sentry DSN (optional — disables Sentry if unset) |
| `VITE_SENTRY_DSN` | Frontend Sentry DSN (build-time, optional) |
| `SENTRY_TRACES_SAMPLE_RATE` | Sentry trace sampling rate (default `0.1`) |
| `ENABLE_METRICS` | `true`/`false` — enables Prometheus `/metrics` endpoint |
| `MARKETPLACE_COUPLED` | `true` follows Zoho Product_Active, `false` independent visibility (testing) |
| `CSP_EXTRA_CONNECT_SRC` | Extra connect-src domains for CSP (comma-separated, optional) |
| `RESEND_API_KEY` | Resend email API key (optional — disables email if unset). Powers: password reset, welcome, approval/rejection, onboarding reminder, notification emails |
| `SENDER_EMAIL` | From address for emails (default `noreply@harvex.ca`) |

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
│   │   ├── schema.prisma           # Full data model (22 models)
│   │   └── migrations/             # Versioned migrations (baseline + incremental)
│   └── src/
│       ├── index.ts                # Express entry, middleware, route mounting, cron setup
│       ├── middleware/
│       │   └── auth.ts             # requireAuth, marketplaceAuth, requireSeller, requireAdmin
│       ├── routes/
│       │   ├── admin.ts            # User management, sync triggers, CoA queue, audit log
│       │   ├── auth.ts             # Register, login, refresh, logout, upload-agreement, forgot/reset password
│       │   ├── bids.ts             # Create bid, buyer/seller history, accept/reject/outcome
│       │   ├── coa.ts              # Upload CoA, status, preview, confirm/dismiss
│       │   ├── intelligence.ts     # Admin dashboard, matches, predictions, churn, market, scores
│       │   ├── marketplace.ts      # Product listing (filtered/paginated/FTS), product detail
│       │   ├── myListings.ts       # Seller listings, update, toggle active, share links
│       │   ├── notifications.ts    # List, count, mark read, preferences, broadcast
│       │   ├── onboarding.ts       # EULA accept, doc upload, onboarding status
│       │   ├── shares.ts           # Admin CRUD + public share viewer (token-based)
│       │   ├── shortlist.ts       # Toggle, list, check, count (buyer shortlist)
│       │   ├── iso.ts              # ISO board — create, browse, respond, admin, auto-matching
│       │   ├── spotSales.ts        # Spot sales — buyer view + admin CRUD + record sale
│       │   ├── user.ts             # User status/profile
│       │   └── webhooks.ts         # Zoho webhook (product/contact updates)
│       ├── services/
│       │   ├── auditService.ts     # logAudit (fire-and-forget), getRequestIp
│       │   ├── emailService.ts     # Resend client, email templates (welcome, approval, rejection, onboarding reminder, notifications), fire-and-forget send
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
│       │   ├── isoMatchingService.ts    # 7-factor ISO→Product auto-matching
│       │   ├── zohoApi.ts          # Zoho CRM CRUD operations
│       │   ├── zohoAuth.ts         # OAuth token management
│       │   └── zohoSync.ts         # Full + delta product/contact sync (15-min cron)
│       ├── utils/
│       │   ├── auth.ts             # JWT sign/verify, bcrypt hash/compare, refresh token helpers
│       │   ├── coaMapper.ts        # Map CoA extraction → Product fields
│       │   ├── cronLock.ts         # PostgreSQL advisory locks for cron jobs (instrumented with metrics)
│       │   ├── logger.ts           # Pino structured logger + pino-sentry-transport
│       │   ├── metrics.ts          # Prometheus registry, HTTP + cron metrics, metricsMiddleware
│       │   ├── proximity.ts        # Bid proximity score calculator
│       │   ├── s3.ts               # S3-compatible uploads (DigitalOcean Spaces), presigned URLs
│       │   ├── sentry.ts           # Sentry SDK init, user context helpers
│       │   └── validation.ts       # Zod schemas + validate/validateQuery/validateParams
│       └── __tests__/
│           ├── setup.ts            # Global Prisma + logger + metrics + sentry mocks
│           ├── admin.test.ts       # 18 tests
│           ├── auth.test.ts        # 20 tests
│           ├── authRoutes.test.ts  # 19 tests
│           ├── authUtils.test.ts   # 13 tests
│           ├── bids.test.ts        # 22 tests
│           ├── coaMapper.test.ts   # 22 tests
│           ├── cronLock.test.ts    # 11 tests
│           ├── marketplace.test.ts # 32 tests
│           ├── matchingEngine.test.ts # 9 tests
│           ├── myListings.test.ts  # 20 tests
│           ├── notifications.test.ts  # 18 tests
│           ├── proximity.test.ts   # 21 tests
│           ├── sellerDetection.test.ts # 16 tests
│           ├── shares.test.ts      # 19 tests
│           ├── shortlist.test.ts   # 16 tests
│           ├── iso.test.ts        # 22 tests
│           └── validation.test.ts  # 49 tests
│
├── client/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx                 # Router + AuthProvider
│       ├── index.css               # Tailwind v4 @theme (brand colors, dark mode)
│       ├── lib/
│       │   ├── api.ts              # Axios client + all API functions
│       │   ├── AuthContext.tsx     # Auth context (login, register, logout, auto-refresh, 401 retry)
│       │   ├── sentry.ts           # Frontend Sentry init (env-gated)
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
│       │   ├── SpotSaleCard.tsx    # Spot sale card with countdown timer + discount badge
│       │   ├── ProductImage.tsx    # Smart image (S3 presigned URL cache, legacy path fallback)
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
│           ├── BuyerMatchesPage.tsx    # Buyer-facing matches
│           ├── IsoBoard.tsx           # ISO board — browse/my tabs, create/respond modals
│           ├── SpotSales.tsx          # Buyer spot sales view (countdown timers)
│           └── SpotSalesAdmin.tsx     # Admin spot sale management (CRUD + record sale)
```

---

## Data Model (Prisma)

22 models in `server/prisma/schema.prisma`:

| Model | Purpose |
|-------|---------|
| **User** | Marketplace user (buyer/seller/admin), optionally linked to Zoho Contact. `reminderSentAt` tracks last admin-sent onboarding reminder |
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
| **ProductView** | Browsing behavior tracking (5-min dedup, feeds propensity scoring) |
| **Notification** | In-app notifications (15 types, user preferences) |
| **SyncLog** | Zoho sync audit trail |
| **CoaSyncRecord** | CoA email → product pipeline tracking |
| **CuratedShare** | Token-based public product catalog links |
| **ShortlistItem** | Buyer-saved products (unique buyer+product, feeds intelligence) |
| **AuditLog** | Admin action audit trail |
| **SpotSale** | Admin-curated limited-time deals with countdown timers |
| **IsoRequest** | Buyer "In Search Of" demand posts (auto-expires 30 days) |
| **IsoResponse** | Seller responses to ISO requests ("I have this") |
| **PasswordResetToken** | Time-limited password reset tokens (SHA-256 hashed, 1h expiry) |

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
| GET | `/metrics` | Prometheus metrics (gated by `ENABLE_METRICS`) |
| POST | `/api/auth/register` | Create new user account |
| POST | `/api/auth/login` | Sign in with email + password |
| POST | `/api/auth/refresh` | Rotate refresh token, get new access token |
| POST | `/api/auth/logout` | Clear refresh token cookie |
| POST | `/api/auth/forgot-password` | Send password reset email (user-enumeration safe) |
| POST | `/api/auth/reset-password` | Reset password via token |
| POST | `/api/webhooks/zoho` | Zoho webhook (secret header verification) |
| GET | `/api/shares/public/:token` | Public share catalog |
| GET | `/api/shares/public/:token/:productId` | Public product detail |

### Authenticated (JWT + marketplace approval)
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
| GET/PATCH | `/api/notifications/email-preferences` | Email notification preferences |
| GET | `/api/matches` | Buyer's match suggestions |
| POST | `/api/matches/:id/dismiss` | Dismiss a match |
| POST | `/api/shortlist/toggle` | Add/remove product from shortlist |
| GET | `/api/shortlist` | Paginated shortlist (sort/filter) |
| GET | `/api/shortlist/check?productIds=a,b,c` | Bulk check shortlist state (max 50) |
| GET | `/api/shortlist/count` | Total shortlist count |
| POST | `/api/iso` | Create ISO request (auto-expires 30 days) |
| GET | `/api/iso` | Browse ISO board (anonymized, OPEN only by default) |
| GET | `/api/iso/my` | Buyer's own ISOs (full detail, paginated) |
| GET | `/api/iso/matches` | Buyer's auto-matched ISOs (status=MATCHED) |
| GET | `/api/iso/:id` | ISO detail (anonymized for non-owners) |
| PATCH | `/api/iso/:id` | Close or renew own ISO |
| POST | `/api/iso/:id/respond` | Seller "I have this" response |
| GET | `/api/spot-sales` | Active spot sales (soonest-expiring first) |

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
| POST | `/api/admin/users/:id/send-reminder` | Send onboarding reminder email |
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
| GET | `/api/iso/admin` | All ISOs (non-anonymized, includes buyer/seller info) |
| POST | `/api/spot-sales/admin` | Create spot sale |
| GET | `/api/spot-sales/admin` | List all spot sales (paginated, filterable) |
| PATCH | `/api/spot-sales/admin/:id` | Update spot sale (price, expiry, qty, active) |
| DELETE | `/api/spot-sales/admin/:id` | Delete spot sale |
| POST | `/api/spot-sales/admin/:id/record-sale` | Record completed sale → Transaction + decrement inventory |

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

1. **Self-hosted auth** — bcrypt passwords + JWT access/refresh tokens
2. **`requireAuth()`** — Extracts Bearer token, verifies JWT, sets `authUserId`
3. **`marketplaceAuth`** — Looks up user by ID, checks `approved: true`, EULA, doc upload
4. **`requireSeller`** — Checks `contactType` includes "Seller"
5. **`requireAdmin`** — Checks email is in `ADMIN_EMAILS` env var

### Token Strategy
- **Access token**: 15min expiry, signed with `JWT_SECRET`, sent as Bearer header, stored in memory
- **Refresh token**: 7 days, signed with `JWT_REFRESH_SECRET`, httpOnly cookie (`sameSite: strict`, `path: /api/auth`)
- **Token rotation**: Each refresh issues a new refresh token and invalidates the old one
- **Reuse detection**: If a used refresh token is presented again, all sessions for that user are revoked
- **DB storage**: SHA-256 hash of refresh token (not the raw token)

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
| ISO Expiry | Daily 3am | 100007 | Mark expired OPEN ISOs as EXPIRED |

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
- **Enhanced features** (Prompt 17): viewsLast30d, uniqueProductsViewed30d, viewToShortlistRate, bidRejectionRate, totalBidsPlaced, bidConversionRate

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

30+ schemas in `server/src/utils/validation.ts` covering auth, marketplace, notifications, intelligence, bids, CoA, admin, ISO, and spot sales routes.

### Other Measures
- **Helmet** + **CORS** (configurable origin)
- **Rate limiting**: 200/min general (reads), 30/min writes (route-level on POST/PATCH/DELETE for bids + listings), 30/min auth, 60/min public
- **JWT** verification on all protected routes (self-hosted, `jsonwebtoken`)
- **Zoho file proxy** requires auth + validates product exists in DB
- **PDF magic byte** validation (`%PDF-`) on CoA upload
- **`$queryRaw` tagged templates** (not `$queryRawUnsafe`) for SQL
- **Admin audit log** — all admin actions logged with actor, action, target, IP

### Public Routes (no auth required)
- `/api/health` — Health check
- `/metrics` — Prometheus metrics (gated by `ENABLE_METRICS`)
- `/uploads/*` — Static file serving
- `/api/auth/*` — Register, login, refresh, logout
- `/api/webhooks/zoho` — Zoho webhook (secret header verification)
- `/api/shares/public/*` — Token-based share access

---

## Audit Log

Actions logged: `user.approve`, `user.reject`, `user.send_reminder`, `sync.trigger`, `coa.confirm`, `coa.dismiss`, `bid.accept`, `bid.reject`, `bid.outcome`, `notification.broadcast`, `spot-sale.create`, `spot-sale.update`, `spot-sale.delete`, `spot-sale.record`

`GET /api/admin/audit-log` — Paginated, filterable by action, actorId, targetType, date range.

---

## Notification System

15 notification types: `BID_RECEIVED`, `BID_ACCEPTED`, `BID_REJECTED`, `BID_COUNTERED`, `BID_OUTCOME`, `PRODUCT_NEW`, `PRODUCT_PRICE`, `PRODUCT_STOCK`, `MATCH_SUGGESTION`, `COA_PROCESSED`, `PREDICTION_DUE`, `SHORTLIST_PRICE_DROP`, `ISO_MATCH_FOUND`, `ISO_SELLER_RESPONSE`, `SYSTEM_ANNOUNCEMENT`

- Fire-and-forget `createNotification()` respects per-user preferences
- `SYSTEM_ANNOUNCEMENT` always delivered (cannot be disabled)
- Frontend: 30-second polling via `useNotifications` hook + `NotificationBell` dropdown

---

## Monitoring

All monitoring is **env-gated** — without `SENTRY_DSN` / `ENABLE_METRICS`, behavior is unchanged.

### Sentry (Error Tracking)
- **Backend**: `server/src/utils/sentry.ts` — `initSentry()` called at Express startup, `setUserContext()` tags events with authenticated user
- **Frontend**: `client/src/lib/sentry.ts` — `initSentry()` called before React render, browser tracing integration
- **Pino transport**: `pino-sentry-transport` automatically forwards all `error`/`fatal` log messages to Sentry (zero code changes to existing 115+ logger calls)
- **Error boundary**: `ErrorBoundary.tsx` calls `Sentry.captureException()` for uncaught React errors
- **Express error handler**: `Sentry.setupExpressErrorHandler(app)` captures unhandled route errors
- **Vite plugin**: `@sentry/vite-plugin` uploads sourcemaps when `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` are set (CI/CD only)

### Prometheus Metrics
- **Endpoint**: `GET /metrics` (unauthenticated, for Prometheus scraping, gated by `ENABLE_METRICS=true`)
- **HTTP metrics**: `http_requests_total` (counter), `http_request_duration_seconds` (histogram), `http_requests_in_flight` (gauge)
- **Cron metrics**: `cron_job_duration_seconds` (histogram), `cron_job_last_success_timestamp` (gauge), `cron_job_errors_total` (counter)
- **Process metrics**: Default Node.js process metrics (CPU, memory, event loop, GC) via `collectDefaultMetrics()`
- **Route normalization**: UUIDs and numeric IDs replaced with `:id` to prevent label cardinality explosion
- All 7 cron jobs automatically instrumented via `withCronLock()` in `cronLock.ts`

### Key Files
| File | Purpose |
|------|---------|
| `server/src/utils/sentry.ts` | Sentry SDK init + user context helpers |
| `server/src/utils/metrics.ts` | Prometheus registry, metrics, middleware |
| `server/src/utils/logger.ts` | Pino multi-target transport (stdout + Sentry) |
| `client/src/lib/sentry.ts` | Frontend Sentry init |

---

## Testing

```bash
cd server
npm test              # Run all 404 tests
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
| auth.test.ts | 20 | Unit — auth middleware chain |
| myListings.test.ts | 20 | Integration — seller listings/shares |
| authRoutes.test.ts | 19 | Integration — register/login/refresh/logout |
| shares.test.ts | 19 | Integration — curated share CRUD |
| notifications.test.ts | 18 | Integration + Unit — routes + service logic |
| admin.test.ts | 18 | Integration — user management + sync + queue |
| sellerDetection.test.ts | 16 | Unit — email/company/producer matching |
| shortlist.test.ts | 16 | Integration — toggle, list, check, count |
| iso.test.ts | 22 | Integration — ISO board CRUD, respond, anonymization |
| authUtils.test.ts | 13 | Unit — JWT/bcrypt round-trip tests |
| marketplaceVisibility.test.ts | 11 | Unit — visibility mode switching |
| cronLock.test.ts | 11 | Unit — PostgreSQL advisory lock behavior |
| matchingEngine.test.ts | 9 | Unit — 10-factor scoring algorithm |
| e2e/*.test.ts | 46 | E2E — signup, bidding, admin ops, shortlist |

### Test Patterns
- Global mock setup in `__tests__/setup.ts` (Prisma + logger + metrics + sentry)
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
# ⚠️  MUST run on the production server, not locally!
ssh root@159.203.20.213
cd ~/gcis-marketplace-plan
sudo bash scripts/init-letsencrypt.sh   # First time only
bash scripts/deploy.sh                  # Standard deploy (always --no-cache)
```

### Production Deploy Steps (`scripts/deploy.sh`)

The deploy script automates these steps — **always use it** instead of manual `docker compose` commands:

1. **Hostname guard** — warns if run on a local dev machine (detects "desktop", "laptop", "wsl" in hostname)
2. `git pull --ff-only` — Pull latest code
3. **Self-update** — re-execs itself after git pull so the latest script version runs the build
4. `docker compose build --no-cache server client` — Always rebuilds from scratch
5. `docker compose up -d server client` — Recreate containers (postgres untouched)
6. Verify containers are running + health check
7. Verify build artifacts (CSS/JS hashes) + cache headers

### Cache Strategy (Nginx)

Nginx sends `Cache-Control: no-cache, no-store, must-revalidate` at the **server level** (applies to all responses including `index.html` and SPA routes). This ensures browsers always fetch the latest `index.html` which references content-hashed asset filenames.

Vite's content-hashed `/assets/*` filenames (`index-CMlDj-EM.js`) naturally cache-bust on each build. Browsers do conditional 304 requests for cached assets.

**Note**: Location-block `add_header` directives were unreliable (silently dropped due to Nginx header inheritance), so all cache headers live at the server block level.

### Container Details
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
| 1 | 2 | Auth flow — middleware chain, webhook sync (originally Clerk, replaced in Phase 17) |
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
| 12 | 16 | Spot Sales — admin-curated limited-time deals with countdown timers |
| 13 | 17 | Intelligence enhancements — ProductView tracking, match conversion, bid elasticity, propensity features |
| 14 | 18 | S3-compatible file uploads — DigitalOcean Spaces with presigned URLs, ProductImage component |
| 15 | 19 | HTTPS/SSL — Nginx TLS termination, Let's Encrypt, HSTS, HTTPS redirect |
| 16 | 20 | Monitoring — Sentry error tracking, Prometheus metrics, pino-sentry transport |
| 17 | 21 | Marketplace visibility decoupling — independent marketplaceVisible flag, MARKETPLACE_COUPLED env |
| 18 | 22 | Self-hosted auth — Replace Clerk with bcrypt + JWT, multi-step sign-up wizard |
| 19 | 23 | ISO feature — buyer demand posts, seller responses, 7-factor auto-matching, expiry cron |
| 20 | 25 | Resend email integration — password reset, notification emails, per-type email preferences |
| 21 | 26 | Admin onboarding reminder email — contextual reminder for incomplete EULA/doc upload, `reminderSentAt` tracking, UI indicator |

### Production Hardening (cross-cutting)
- Structured logging (pino) — replaced 130+ console.log/error calls
- Global error handling — Express catch-all, process.on handlers, React ErrorBoundary
- Database indexes on all foreign keys
- PostgreSQL advisory lock cron locking (7 jobs)
- Docker startup with `prisma migrate deploy`
- Health check with detailed mode (DB, Zoho, CoA)
- Rate limiting (4 tiers)
- 404 tests across 23 files
- Dark mode support across all pages
- Email notifications via Resend (env-gated, fire-and-forget)
- Sentry error tracking (backend + frontend) with pino log transport
- Prometheus metrics (HTTP + cron) with `/metrics` endpoint

---

## Production Readiness — Remaining Items

### P0 — Must fix before launch
- [x] **Rotate credentials** — Verified: no real credentials in git history (.env.example uses placeholders only, .env is gitignored)

### P1 — High risk
- [x] **File uploads → S3/GCS** — DigitalOcean Spaces with presigned URLs (Phase 14)
- [x] **HTTPS/SSL** — Nginx TLS termination + Let's Encrypt + HSTS + redirect (Phase 15)

### P2 — Medium risk
- [x] **Monitoring** — Sentry + Prometheus metrics + pino-sentry transport (Phase 16)

### P3 — Nice to have
- [x] **CSRF protection** — Origin/Referer validation on mutating requests
- [ ] **E2E tests** — Full signup → onboarding → marketplace → bid flow

---

## Security Scan Results (2026-02-19)

### Static Security Audit (`security-audit.sh`)

| Check | Result |
|-------|--------|
| Dependency Vulnerabilities (npm audit) | PASS |
| Secrets & Credentials (.env gitignored, no hardcoded secrets) | PASS |
| API Route Authentication | PASS |
| CORS Configuration (no wildcard origins) | PASS |
| SQL Injection Risk (no string concatenation) | PASS |
| XSS Risk (no raw HTML injection) | PASS |
| Debug & Dev Mode | PASS |
| Security Headers | WARN (false positive — Helmet is configured in `server/src/index.ts`) |
| File Upload Safety (validation present) | PASS |
| Environment Variables (no sensitive NEXT_PUBLIC_ exposure) | PASS |

**Result: 11 PASS, 1 WARN, 0 FAIL**

### OWASP ZAP Baseline Scan

Scanned with [ZAP](https://www.zaproxy.org/) (ghcr.io/zaproxy/zaproxy:stable) against `http://localhost:3001`.

| Category | Count |
|----------|-------|
| Rules Passed | 65 |
| Warnings | 2 |
| Failures | 0 |

**Warnings (both non-issues):**

1. **Storable and Cacheable Content [10049]** — Fired on 404 responses for `/robots.txt` and `/sitemap.xml` (files don't exist). Authenticated API routes use proper cache-control headers.
2. **CSP: Failure to Define Directive with No Fallback [10055]** — Helmet's CSP sets `default-src 'none'` but doesn't explicitly set `frame-ancestors` and `form-action`. These are handled by Helmet's `frameguard` and are non-exploitable on an API server.

Full ZAP report: [`zap-reports/zap-report.md`](zap-reports/zap-report.md)

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