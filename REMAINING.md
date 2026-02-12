# Remaining Work

## Production Blockers (P0-P1)
- [ ] **Rotate credentials** — .env keys are in git history. Revoke & regenerate Clerk/Zoho tokens.
- [ ] **File uploads to S3/GCS** — currently serving from local disk with no auth on download URLs. Won't scale and anyone with a URL can access files.
- [ ] **HTTPS/SSL** — Nginx on port 80 only, needs Let's Encrypt + HSTS + redirect.

## Infrastructure (P2)
- [ ] **Prisma migrations** — switch from `db push` to `prisma migrate` for proper versioned rollbacks
- [ ] **Cron locking** — no distributed lock, so running multiple server instances would duplicate cron work
- [ ] **Monitoring** — no Sentry/APM/log aggregation yet
- [ ] **Docker startup** — prisma db push at boot → move to separate migration step

## Feature Ideas
- [ ] **Notifications** — email or in-app alerts when a bid is received, accepted, rejected, or countered
- [ ] **Bid counter-offers** — sellers can propose a different price instead of just accept/reject
- [ ] **Saved searches / watchlists** — buyers save filter presets or favorite products
- [ ] **Product comparison** — select 2-3 products and view specs side-by-side
- [ ] **Analytics dashboard** — seller views for bid conversion rates, views per product, popular categories
- [x] **Search improvements** — Postgres full-text search with weighted relevance ranking (completed: FTS with tsvector/tsquery + GIN index + DB trigger)
- [ ] **Image optimization** — resize/compress uploads, serve via CDN with responsive srcsets
- [ ] **Dark mode polish** — audit all components for dark mode consistency (some shared views use hardcoded light colors)
- [ ] **E2E tests** — signup → onboarding → marketplace → bid flow with Playwright

## Already Completed
- [x] Input validation (zod) on all POST/PATCH endpoints
- [x] Global error handling (Express catch-all + React ErrorBoundary)
- [x] Webhook secret enforcement
- [x] Database indexes on FKs
- [x] Structured logging (pino)
- [x] Frontend 404 page
- [x] Health check expansion (detailed mode)
- [x] Admin emails caching
