# GCIS Marketplace — Project Plan & Claude Code Handoff

## Project Overview

Build a B2B cannabis marketplace for GCIS (Green Consulting International Services) that connects licensed producers (sellers) with international buyers. The marketplace pulls product and contact data from Zoho CRM, uses Clerk for authentication, and syncs all transactional activity back to Zoho.

This replaces the existing Harvex marketplace with a faster, more polished, and better-integrated platform.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (React)                      │
│  Landing / Login / Marketplace / My Listings / Profile   │
│  Clerk handles auth UI components                        │
└──────────────────────┬──────────────────────────────────┘
                       │ API calls (JWT from Clerk)
                       ▼
┌─────────────────────────────────────────────────────────┐
│                 BACKEND (Node.js + Express)               │
│                                                           │
│  ┌──────────┐  ┌───────────┐  ┌───────────────────────┐ │
│  │ Auth      │  │ Products  │  │ Bids / Orders         │ │
│  │ Middleware│  │ Service   │  │ Service               │ │
│  │ (Clerk +  │  │           │  │                       │ │
│  │  Zoho     │  │ CRUD +    │  │ Create bid → Zoho     │ │
│  │  check)   │  │ filtering │  │ Task + notification   │ │
│  └──────────┘  └───────────┘  └───────────────────────┘ │
│                                                           │
│  ┌──────────────────────────────────────────────────────┐│
│  │              Zoho Sync Service (node-cron)            ││
│  │  Every 15 min: sync products, contacts, inventory     ││
│  │  Webhook listener: instant updates on CRM changes     ││
│  └──────────────────────────────────────────────────────┘│
└──────────────────────┬──────────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
   ┌───────────┐ ┌─────────┐ ┌──────────┐
   │ PostgreSQL│ │  Clerk  │ │ Zoho CRM │
   │ (Prisma)  │ │  (Auth) │ │  (API)   │
   └───────────┘ └─────────┘ └──────────┘
```

---

## Tech Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| Frontend | React + Tailwind CSS | Vite for build tooling |
| Backend | Node.js + Express | TypeScript |
| Database | PostgreSQL + Prisma ORM | Local cache of Zoho data + app-specific data |
| Auth | Clerk | Free tier (10K MAU), handles passwords + 2FA |
| CRM | Zoho CRM API v7 | Source of truth for contacts, products, deals |
| Sync | node-cron | Every 15–30 min pull from Zoho |
| Hosting | TBD (Railway, Hetzner, or Vercel+Railway) | Docker-ready |

---

## Data Model (Prisma Schema)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── Users (links Clerk ↔ Zoho) ───

model User {
  id              String    @id @default(cuid())
  clerkUserId     String    @unique
  zohoContactId   String    @unique
  email           String    @unique
  firstName       String?
  lastName        String?
  companyName     String?
  title           String?
  contactType     String?            // From Zoho Contact_Type multi-select ("Buyer; Seller")
  approved        Boolean   @default(false)  // From Zoho Account_Confirmed
  eulaAcceptedAt  DateTime?
  docUploaded     Boolean   @default(false)
  mailingCountry  String?
  phone           String?
  lastSyncedAt    DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  bids            Bid[]
  products        Product[] @relation("SellerProducts")
}

// ─── Products (synced from Zoho) ───

model Product {
  id                  String    @id @default(cuid())
  zohoProductId       String    @unique
  productCode         String?

  // Basic info
  name                String
  description         String?
  category            String?         // From Product_Category picklist
  type                String?         // Sativa / Indica / Hybrid
  licensedProducer    String?
  growthMedium        String?
  lineage             String?
  harvestDate         DateTime?

  // Status (from Zoho checkboxes)
  isActive            Boolean   @default(false)  // Product_Active
  requestPending      Boolean   @default(false)  // Request_pending

  // Seller link
  sellerId            String
  seller              User      @relation("SellerProducts", fields: [sellerId], references: [id])

  // Pricing & inventory (seller-editable)
  pricePerUnit        Float?          // Unit_Price — seller's asking price
  minQtyRequest       Float?          // Min_QTY_Request — MOQ
  gramsAvailable      Float?          // Grams_Available — current stock
  upcomingQty         Float?          // Upcoming_QTY — future stock

  // Cannabinoids (percentages)
  thcMin              Float?
  thcMax              Float?
  cbdMin              Float?
  cbdMax              Float?

  // Terpenes & aromas
  dominantTerpene     String?         // Terpen field — top 5 terpenes (multi-value autocomplete, parse as array)
  highestTerpenes     String?         // Multi-line breakdown
  aromas              String?         // Multi-line scent profile

  // Certification
  certification       String?         // GACP, GMP1, GMP2, GPP

  // Bud size distribution (percentages, should sum to ~100%)
  budSizePopcorn      Float?          // 0-1 cm
  budSizeSmall        Float?          // 1-2 cm
  budSizeMedium       Float?          // 2-3 cm
  budSizeLarge        Float?          // 3-5 cm
  budSizeXLarge       Float?          // 5 cm+

  // Media URLs (fetched from Zoho file uploads)
  imageUrls           String[]
  coaUrls             String[]

  // Sync tracking
  lastSyncedAt        DateTime?
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  bids                Bid[]
}

// ─── Bids ───

model Bid {
  id              String    @id @default(cuid())
  zohoTaskId      String?   @unique   // Created when bid is placed
  productId       String
  product         Product   @relation(fields: [productId], references: [id])
  buyerId         String
  buyer           User      @relation(fields: [buyerId], references: [id])

  pricePerUnit    Float             // Buyer's offered price per unit
  quantity        Float
  totalValue      Float
  proximityScore  Float?            // How close to seller's asking price (0-100%)
  status          BidStatus @default(PENDING)
  notes           String?

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

enum BidStatus {
  PENDING
  UNDER_REVIEW    // GCIS team reviewing
  ACCEPTED        // Seller agreed
  REJECTED        // Seller declined
  COUNTERED       // Seller counter-offered
  EXPIRED
}

// ─── Sync Log (audit trail) ───

model SyncLog {
  id          String    @id @default(cuid())
  type        String    // "products", "contacts", "inventory"
  status      String    // "success", "error"
  recordCount Int?
  details     Json?
  createdAt   DateTime  @default(now())
}
```

---

## Phase 1: Foundation (Week 1–2)

### 1.1 Project Scaffolding

```bash
# Initialize project
mkdir gcis-marketplace && cd gcis-marketplace
npm init -y

# Backend dependencies
npm install express cors helmet jsonwebtoken @clerk/express
npm install @prisma/client node-cron axios
npm install -D typescript @types/node @types/express ts-node nodemon prisma

# Frontend (separate directory or monorepo)
npm create vite@latest client -- --template react-ts
cd client && npm install @clerk/clerk-react tailwindcss axios react-router-dom
```

### 1.2 Clerk Setup

1. Create account at clerk.com
2. Create application → get `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`
3. Configure sign-up: email + password only (no social logins needed for B2B)
4. Enable 2FA in Clerk dashboard (optional per user)
5. Set up webhook endpoint for `user.created` events

**Frontend (React):**
```tsx
// main.tsx
import { ClerkProvider } from '@clerk/clerk-react';

<ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
  <App />
</ClerkProvider>
```

**Backend webhook handler:**
```typescript
// POST /api/webhooks/clerk
// Triggered when a new user signs up via Clerk
//
// IMPORTANT: Not all Zoho Contacts should auto-get marketplace access.
// The user must:
//   1. Sign up with their work email (which should match a Contact in Zoho)
//   2. Have Account_Confirmed = true in Zoho (set manually by GCIS team)
//   3. Accept EULA and upload agreement document
//
// If a user signs up with an email not in Zoho, they see a message
// to contact GCIS. No auto-creation of Contacts.

async function handleClerkWebhook(req, res) {
  const { type, data } = req.body;

  if (type === 'user.created') {
    const email = data.email_addresses[0].email_address;

    // Look up in Zoho CRM by email
    const zohoContact = await zohoApi.searchContacts({ email });

    if (!zohoContact) {
      // Email not found in Zoho — unknown person
      await prisma.user.create({
        data: {
          clerkUserId: data.id,
          zohoContactId: '',            // No Zoho link yet
          email: email,
          approved: false,
        }
      });
      // Frontend shows: "Thanks for your interest in our marketplace!
      // To get started, please reach out to our team at team@gciscan.com
      // and we'll get you set up."
      return res.status(200).send('OK');
    }

    if (zohoContact.Account_Confirmed) {
      // Known contact, confirmed — create linked user, proceed to onboarding
      const contactType = zohoContact.Contact_Type || 'Buyer';

      await prisma.user.create({
        data: {
          clerkUserId: data.id,
          zohoContactId: zohoContact.id,
          email: email,
          firstName: zohoContact.First_Name,
          lastName: zohoContact.Last_Name,
          companyName: zohoContact.Company,
          contactType: contactType,
          approved: true,
        }
      });

      // Store Clerk user ID in Zoho's User_UID field (replaces old Firebase UID)
      await zohoRequest('PUT', `/Contacts/${zohoContact.id}`, {
        data: [{ User_UID: data.id }]
      });
    } else {
      // Contact exists in Zoho but Account_Confirmed is false.
      // This person might be a trade show lead, a cold contact, etc.
      // They may not have been invited to the marketplace at all.
      await prisma.user.create({
        data: {
          clerkUserId: data.id,
          zohoContactId: zohoContact.id,
          email: email,
          firstName: zohoContact.First_Name,
          lastName: zohoContact.Last_Name,
          companyName: zohoContact.Company,
          approved: false,
        }
      });

      // Notify GCIS team that a known contact just signed up
      await zohoRequest('POST', '/Tasks', {
        data: [{
          Subject: `Marketplace Signup — ${zohoContact.First_Name} ${zohoContact.Last_Name} (${zohoContact.Company || 'No company'})`,
          Status: 'Not Started',
          Priority: 'Normal',
          Who_Id: zohoContact.id,
          Description: `This contact just created a marketplace account.\n\nEmail: ${email}\nAccount_Confirmed is currently FALSE.\n\nTo grant access: set Account_Confirmed = true in their Contact record.`,
        }]
      });

      // Frontend shows: "Thanks for signing up! Your account is being set up.
      // We'll notify you when it's ready."
      // Neutral — no mention of "approval" or "pending review"
    }
  }
}

// Helper: check if user can list products
function canListProducts(contactType: string): boolean {
  return contactType?.includes('Seller') || false;
}

// Helper: check if user can bid (all contact types can bid, since sellers are also buyers)
function canBid(contactType: string): boolean {
  return contactType?.includes('Buyer') || contactType?.includes('Seller') || false;
}
```

### 1.3 Auth Middleware

```typescript
// middleware/auth.ts
import { requireAuth } from '@clerk/express';

// Step 1: Clerk verifies the JWT
// Step 2: Our middleware checks Zoho approval + EULA + document
async function marketplaceAuth(req, res, next) {
  const clerkUserId = req.auth.userId;

  const user = await prisma.user.findUnique({
    where: { clerkUserId }
  });

  if (!user) return res.status(403).json({ error: 'Account not found', code: 'NOT_FOUND' });
  if (!user.zohoContactId) return res.status(403).json({ error: 'Your email is not in our system. Please contact GCIS to get started.', code: 'NO_ZOHO_LINK' });
  if (!user.approved) return res.status(403).json({ error: 'Account pending approval', code: 'PENDING_APPROVAL' });
  if (!user.eulaAcceptedAt) return res.status(403).json({ error: 'EULA not accepted', code: 'EULA_REQUIRED' });
  if (!user.docUploaded) return res.status(403).json({ error: 'Document upload required', code: 'DOC_REQUIRED' });

  req.user = user;
  next();
}

// Middleware for seller-only routes (My Listings, Add Product)
function requireSeller(req, res, next) {
  if (!req.user.contactType?.includes('Seller')) {
    return res.status(403).json({ error: 'Seller access required' });
  }
  next();
}

// Route protection
app.use('/api/marketplace', requireAuth(), marketplaceAuth);
app.use('/api/bids', requireAuth(), marketplaceAuth);
app.use('/api/my-listings', requireAuth(), marketplaceAuth, requireSeller);
```

### 1.4 Zoho OAuth Service

```typescript
// services/zohoAuth.ts
// Your existing credentials from the API Console setup

const ZOHO_BASE = 'https://accounts.zohocloud.ca/oauth/v2/token';
const ZOHO_API = 'https://www.zohoapis.ca/crm/v7';

let accessToken: string | null = null;
let tokenExpiry: number = 0;

async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiry) return accessToken;

  const response = await axios.post(ZOHO_BASE, null, {
    params: {
      grant_type: 'refresh_token',
      client_id: process.env.ZOHO_CLIENT_ID,
      client_secret: process.env.ZOHO_CLIENT_SECRET,
      refresh_token: process.env.ZOHO_REFRESH_TOKEN,
    }
  });

  accessToken = response.data.access_token;
  tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000; // 1 min buffer
  return accessToken!;
}

// Generic Zoho API caller
async function zohoRequest(method: string, endpoint: string, data?: any) {
  const token = await getAccessToken();
  const response = await axios({
    method,
    url: `${ZOHO_API}${endpoint}`,
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    data,
  });
  return response.data;
}
```

---

## Phase 2: Zoho Sync Engine (Week 2–3)

### 2.1 Sync Service

```typescript
// services/zohoSync.ts
import cron from 'node-cron';

// Sync products every 15 minutes
cron.schedule('*/15 * * * *', async () => {
  console.log('[SYNC] Starting product sync...');
  await syncProducts();
  await syncContacts();
  console.log('[SYNC] Complete');
});

async function syncProducts() {
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await zohoRequest('GET', '/Products', {
      params: {
        fields: 'Product_Name,Product_Code,Description,Product_Category,Type,Product_Active,Request_pending,Unit_Price,Min_QTY_Request,Grams_Available,Upcoming_QTY,THC_min,THC_max,CBD_min,CBD_max,Certification,Harvest_Date,Licensed_Producer,Lineage,Growth_Medium,Terpen,Highest_Terpenes,Aromas,X0_1_cm_Popcorn,X1_2_cm_Small,X2_3_cm_Medium,X3_5_cm_Large,X5_cm_X_Large,Contact_Name',
        page,
        per_page: 200,
        criteria: '(Product_Active:equals:true)',
      }
    });

    const products = response.data || [];

    for (const p of products) {
      await prisma.product.upsert({
        where: { zohoProductId: p.id },
        update: {
          name: p.Product_Name,
          productCode: p.Product_Code,
          description: p.Description,
          category: p.Product_Category,
          type: p.Type,
          isActive: p.Product_Active || false,
          requestPending: p.Request_pending || false,
          pricePerUnit: p.Unit_Price,
          minQtyRequest: p.Min_QTY_Request,
          gramsAvailable: p.Grams_Available,
          upcomingQty: p.Upcoming_QTY,
          thcMin: p.THC_min,
          thcMax: p.THC_max,
          cbdMin: p.CBD_min,
          cbdMax: p.CBD_max,
          certification: p.Certification,
          harvestDate: p.Harvest_Date ? new Date(p.Harvest_Date) : null,
          licensedProducer: p.Licensed_Producer,
          lineage: p.Lineage,
          growthMedium: p.Growth_Medium,
          dominantTerpene: p.Terpen,
          highestTerpenes: p.Highest_Terpenes,
          aromas: p.Aromas,
          budSizePopcorn: p.X0_1_cm_Popcorn,
          budSizeSmall: p.X1_2_cm_Small,
          budSizeMedium: p.X2_3_cm_Medium,
          budSizeLarge: p.X3_5_cm_Large,
          budSizeXLarge: p.X5_cm_X_Large,
          lastSyncedAt: new Date(),
        },
        create: {
          zohoProductId: p.id,
          name: p.Product_Name,
          productCode: p.Product_Code,
          description: p.Description,
          category: p.Product_Category,
          type: p.Type,
          isActive: p.Product_Active || false,
          requestPending: p.Request_pending || false,
          pricePerUnit: p.Unit_Price,
          minQtyRequest: p.Min_QTY_Request,
          gramsAvailable: p.Grams_Available,
          upcomingQty: p.Upcoming_QTY,
          thcMin: p.THC_min,
          thcMax: p.THC_max,
          cbdMin: p.CBD_min,
          cbdMax: p.CBD_max,
          certification: p.Certification,
          harvestDate: p.Harvest_Date ? new Date(p.Harvest_Date) : null,
          licensedProducer: p.Licensed_Producer,
          lineage: p.Lineage,
          growthMedium: p.Growth_Medium,
          dominantTerpene: p.Terpen,
          highestTerpenes: p.Highest_Terpenes,
          aromas: p.Aromas,
          budSizePopcorn: p.X0_1_cm_Popcorn,
          budSizeSmall: p.X1_2_cm_Small,
          budSizeMedium: p.X2_3_cm_Medium,
          budSizeLarge: p.X3_5_cm_Large,
          budSizeXLarge: p.X5_cm_X_Large,
          sellerId: await resolveSellerByZohoId(p.Contact_Name?.id),
          lastSyncedAt: new Date(),
        }
      });
    }

    hasMore = response.info?.more_records || false;
    page++;
  }

  await prisma.syncLog.create({
    data: { type: 'products', status: 'success', recordCount: totalSynced }
  });
}

async function syncContacts() {
  // Same pattern — pull contacts, update approval status, roles
  // This catches cases where GCIS team approves someone in Zoho
  // between sync cycles
}
```

### 2.2 Push Changes Back to Zoho

```typescript
// When a seller updates price or quantity
async function pushProductUpdate(productId: string, updates: Partial<Product>) {
  const product = await prisma.product.findUnique({ where: { id: productId } });

  // Update local DB
  await prisma.product.update({
    where: { id: productId },
    data: updates,
  });

  // Push to Zoho — only seller-editable fields
  await zohoRequest('PUT', `/Products/${product.zohoProductId}`, {
    data: [{
      Unit_Price: updates.pricePerUnit,
      Grams_Available: updates.gramsAvailable,
      Upcoming_QTY: updates.upcomingQty,
    }]
  });
}

// When a buyer places a bid → create Zoho Task
async function createBidTask(bid: Bid, product: Product, buyer: User) {
  const proximityScore = calculateProximity(bid.pricePerUnit, product.pricePerUnit);

  const taskData = {
    data: [{
      Subject: `New Bid — ${product.name} — ${buyer.companyName}`,
      Status: 'Not Started',
      Priority: proximityScore > 80 ? 'High' : 'Normal',
      What_Id: product.zohoProductId,      // Link to Product
      Who_Id: buyer.zohoContactId,          // Link to Buyer Contact
      Description: [
        `Product: ${product.name}`,
        `Bid: $${bid.pricePerUnit}/unit × ${bid.quantity}g = $${bid.totalValue}`,
        `Seller Asking: $${product.pricePerUnit}/unit`,
        `Proximity: ${proximityScore}%`,
        bid.notes ? `Buyer Notes: ${bid.notes}` : '',
      ].filter(Boolean).join('\n'),
      // Custom fields (add these to Tasks module in Zoho)
      Bid_Amount: bid.pricePerUnit,
      Bid_Quantity: bid.quantity,
      Bid_Status: 'Pending',
      Proximity_Score: proximityScore,
    }]
  };

  const response = await zohoRequest('POST', '/Tasks', taskData);
  const zohoTaskId = response.data[0].details.id;

  // Save Zoho Task ID back to local bid record
  await prisma.bid.update({
    where: { id: bid.id },
    data: { zohoTaskId, proximityScore }
  });
}
```

### 2.3 Proximity Score Calculator

```typescript
// The visual indicator for how close a bid is to the seller's price
function calculateProximity(bidPrice: number, sellerIdealPrice: number): number {
  if (!sellerIdealPrice || sellerIdealPrice === 0) return 50; // No reference

  const ratio = bidPrice / sellerIdealPrice;

  if (ratio >= 1.0) return 100;        // At or above asking — green
  if (ratio >= 0.90) return 90;         // Within 10% — green
  if (ratio >= 0.80) return 75;         // Within 20% — yellow
  if (ratio >= 0.70) return 60;         // Within 30% — orange
  return Math.max(10, ratio * 100);     // Below 30% — red
}

// Frontend displays:
// 90-100%: 🟢 "Strong offer"
// 75-89%:  🟡 "Competitive"
// 60-74%:  🟠 "Below market"
// < 60%:   🔴 "Significantly below asking"
```

---

## Phase 3: Marketplace Frontend (Week 3–4)

### 3.1 Page Structure

```
/                     → Landing page (public)
/sign-in              → Clerk sign-in (public)
/sign-up              → Clerk sign-up (public)
/onboarding           → EULA + document upload (authenticated, pre-approval)
/dashboard            → User dashboard (approved only)
/marketplace          → Browse products (approved buyers)
/marketplace/:id      → Product detail + bid form
/my-listings          → Seller product management (sellers only)
/my-listings/:id/edit → Edit price/quantity
/orders               → Bid history and status
/profile              → Account settings
/support              → Get in touch / FAQ
```

### 3.2 Key Frontend Components

**Product Card (marketplace grid)**
- Product name, category badge, type (Sativa/Indica/Hybrid)
- THC/CBD range display
- Certification badge (GACP, GMP1, GMP2, GPP)
- Price per gram
- Grams available with visual indicator
- "View Details" CTA

**Product Detail Page**
- Full product info (everything from the card + terpene profile, harvest date, lineage, manufacturer)
- CoA download link (redacted version)
- Bid form: quantity input, price per gram input, proximity indicator (updates live as they type), optional notes, submit
- Seller info (company name only — no direct contact, GCIS mediates)

**My Listings (seller view)**
- Table/card view of their products
- Status badges (Active, Pending, Paused)
- Quick-edit for: price per gram, grams available, upcoming quantity
- Pause/unpause toggle
- Bid notifications: "3 new bids on Blue Pavé 7"

**Onboarding Flow**
- Step 1: Accept EULA (scrollable agreement, checkbox, sign)
- Step 2: Upload required document (drag-and-drop, stored to Zoho Contact attachments)
- Step 3: Pending approval screen ("Your account is under review")

### 3.3 Filtering & Search

Products should be filterable by:
- Category (Dried Flower, Concentrate, etc.)
- Type (Sativa, Indica, Hybrid)
- THC range (slider)
- CBD range (slider)
- Certification level
- Price range
- Availability (in stock / upcoming)
- Free text search (name, manufacturer, lineage)

---

## Phase 4: Polish & CoA Integration (Week 5+)

### 4.1 Webhook Listener (Real-time Zoho Updates)

Set up a Zoho workflow rule that hits your webhook endpoint when:
- A product is created or updated
- A contact's approval status changes
- A task (bid) status changes

```typescript
// POST /api/webhooks/zoho
app.post('/api/webhooks/zoho', async (req, res) => {
  const { module, record_id, action } = req.body;

  switch (module) {
    case 'Products':
      await syncSingleProduct(record_id);
      break;
    case 'Contacts':
      await syncSingleContact(record_id);
      break;
    case 'Tasks':
      await updateBidStatus(record_id);
      break;
  }

  res.status(200).send('OK');
});
```

### 4.2 CoA Auto-Populate (Future)

When the CoA processing system is ready:
1. Upload CoA → Claude Vision extracts product data
2. GCIS team reviews extracted data in the CoA dashboard
3. On "Publish," the system creates a Product record in Zoho CRM with all extracted fields
4. Next sync cycle picks it up → appears on marketplace
5. Seller gets notified: "Your product Blue Pavé 7 is now listed"

### 4.3 Notifications

- Email (via Zoho or SendGrid): new bids, bid status updates, product approvals
- In-app notification bell: pull from Zoho Tasks assigned to the user's Contact
- Optional: Slack webhook to GCIS internal channel for bid alerts

---

## Environment Variables

```env
# Clerk
CLERK_SECRET_KEY=sk_live_xxx
VITE_CLERK_PUBLISHABLE_KEY=pk_live_xxx
CLERK_WEBHOOK_SECRET=whsec_xxx

# Zoho CRM (zohocloud.ca — Canada region)
ZOHO_CLIENT_ID=1000.xxx
ZOHO_CLIENT_SECRET=xxx
ZOHO_REFRESH_TOKEN=1000.xxx
ZOHO_ACCOUNTS_URL=https://accounts.zohocloud.ca
ZOHO_API_URL=https://www.zohoapis.ca/crm/v7

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/gcis_marketplace

# App
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:5173
```

---

## Zoho CRM Field Mapping (Verified from CRM Screenshots)

**Note:** Zoho API field names follow the pattern: display label with spaces → underscores, parentheses removed or converted. Some custom fields may have numeric suffixes. Confirm exact API names with `GET /crm/v7/settings/fields?module=Products` if any sync calls fail.

### Products Module

**Product Information section:**

| Marketplace Field | Zoho Display Label | Likely API Name | Type | Notes |
|---|---|---|---|---|
| name | Product Name | `Product_Name` | Single Line (Unique) | Required, unique |
| seller | Contact Name | `Contact_Name` | Lookup → Contacts | **This is the seller link** |
| productCode | Product Code | `Product_Code` | Single Line (Unique) | Internal reference |
| productOwner | Product Owner | `Product_Owner` | User | GCIS team member managing this |
| vendorName | Vendor Name | `Vendor_Name` | Lookup | |
| requestPending | Request pending | `Request_pending` | Checkbox | Used for approval workflow |
| isActive | Product Active | `Product_Active` | Checkbox | Active on marketplace |
| salesStartDate | Sales Start Date | `Sales_Start_Date` | Date | |
| supportStartDate | Support Start Date | `Support_Start_Date` | Date | |
| category | Product Category | `Product_Category` | Picklist | Options TBD — confirm values |
| type | Type | `Type` | Picklist | Likely: Sativa, Indica, Hybrid |
| harvestDate | Harvest Date | `Harvest_Date` | Date | |
| licensedProducer | Licensed Producer | `Licensed_Producer` | Single Line | Manufacturer/LP name |
| description | Description | `Description` | Multi-Line | |
| growthMedium | Growth Medium | `Growth_Medium` | Single Line | Indoor/outdoor/greenhouse |
| lineage | Lineage | `Lineage` | Single Line | Genetics/strain parentage |
| terpenes | Terpen | `Terpen` | Single Line | **Multi-value with autocomplete — stores top 5 dominant terpenes, displayed as tags** |
| thcMin | THC (min) | `THC_min` | Percent | |
| thcMax | THC (max) | `THC_max` | Percent | |
| cbdMin | CBD (min) | `CBD_min` | Percent | |
| cbdMax | CBD (max) | `CBD_max` | Percent | |
| certification | Certification | `Certification` | Picklist | Likely: GACP, GMP1, GMP2, GPP |
| highestTerpenes | Highest Terpenes | `Highest_Terpenes` | Multi-Line | Detailed terpene breakdown |
| aromas | Aromas | `Aromas` | Multi-Line | Scent/flavor profile |

**Bud Size Distribution (percentages, must equal 100%):**

| Marketplace Field | Zoho Display Label | Likely API Name | Type |
|---|---|---|---|
| budSizePopcorn | 0-1 cm (Popcorn) | `X0_1_cm_Popcorn` | Percent |
| budSizeSmall | 1-2 cm (Small) | `X1_2_cm_Small` | Percent |
| budSizeMedium | 2-3 cm (Medium) | `X2_3_cm_Medium` | Percent |
| budSizeLarge | 3-5 cm (Large) | `X3_5_cm_Large` | Percent |
| budSizeXLarge | 5 cm + (X-Large) | `X5_cm_X_Large` | Percent |

**Media & Documents:**

| Marketplace Field | Zoho Display Label | Likely API Name | Type |
|---|---|---|---|
| image1 | Image-1 | `Image_1` | File Upload |
| image2 | Image-2 | `Image_2` | File Upload |
| image3 | Image-3 | `Image_3` | File Upload |
| image4 | Image-4 | `Image_4` | File Upload |
| coa1 | CoAs | `CoAs` | File Upload |
| coa2 | CoAs 2 | `CoAs_2` | File Upload |

**Price Information section:**

| Marketplace Field | Zoho Display Label | Likely API Name | Type | Notes |
|---|---|---|---|---|
| pricePerUnit | Price per Unit | `Unit_Price` | Currency | Seller's asking price (used as ideal price for proximity calc) |
| minQtyRequest | Min QTY Request | `Min_QTY_Request` | Number | Minimum order quantity |
| gramsAvailable | Grams Available | `Grams_Available` | Number | Current inventory |
| upcomingQty | Upcoming QTY | `Upcoming_QTY` | Number | Future inventory expected |

**Seller-editable fields:** `Unit_Price`, `Grams_Available`, `Upcoming_QTY`

---

### Contacts Module

**Contact Information section:**

| Marketplace Field | Zoho Display Label | Likely API Name | Type | Notes |
|---|---|---|---|---|
| firstName | First Name | `First_Name` | Single Line | With salutation (Mr./Mrs./etc.) |
| lastName | Last Name | `Last_Name` | Single Line | Required |
| companyName | Company | `Company` | Single Line | |
| title | Title | `Title` | Single Line | Job title |
| linkedIn | Linked In | `Linked_In` | URL | |
| accountName | Account Name | `Account_Name` | Lookup | |
| email | Email | `Email` | Email (Unique) | **Primary key for Clerk ↔ Zoho matching** |
| contactType | Contact Type | `Contact_Type` | Multi-select | **"Buyer; Seller" — semicolon-separated. Parse to determine capabilities** |
| accountConfirmed | Account Confirmed | `Account_Confirmed` | Checkbox | **Approval flag for marketplace access — manually set by GCIS team** |
| emailOptOut | Email Opt Out | `Email_Opt_Out` | Checkbox | |
| mailingCountry | Mailing Country | `Mailing_Country` | Single Line | |
| note | Note | `Note` | Single Line | |
| userUID | User UID | `User_UID` | Single Line | **Currently stores Firebase UID from old Harvex. Will store Clerk user ID for new platform. Also serves as indicator: "this contact has a marketplace account"** |
| isSeller | Seller | `Seller` | Checkbox | **IGNORE — used for a different Zoho feature, not relevant to marketplace** |

**Address Information section:**

| Marketplace Field | Zoho Display Label | Likely API Name | Type |
|---|---|---|---|
| mailingStreet | Mailing Street | `Mailing_Street` | Single Line |
| mailingCity | Mailing City | `Mailing_City` | Single Line |
| mailingState | Mailing State | `Mailing_State` | Single Line |
| mailingZip | Mailing Zip | `Mailing_Zip` | Single Line |
| phone | Phone | `Phone` | Phone |
| otherPhone | Other Phone | `Other_Phone` | Phone |
| website | Website | `Website` | URL |
| department | Department | `Department` | Single Line |

**Visit Summary section (auto-populated by Zoho SalesIQ, read-only):**

| Zoho Display Label | Likely API Name | Type |
|---|---|---|
| Most Recent Visit | `Most_Recent_Visit` | Date/Time |
| Average Time Spent | `Average_Time_Spent` | Decimal |
| Referrer | `Referrer` | URL |
| First Visit | `First_Visit` | Date/Time |
| First Page Visited | `First_Page_Visited` | URL |
| Number Of Chats | `Number_Of_Chats` | Number |
| Visitor Score | `Visitor_Score` | Long Integer |
| Days Visited | `Days_Visited` | Number |

---

### Fields to ADD to Zoho (not currently present)

| Module | Field Name | Type | Purpose |
|---|---|---|---|
| Contacts | EULA Accepted | Date | When user accepted marketplace EULA |
| Contacts | Agreement Uploaded | Checkbox | Tracks whether seller agreement was uploaded (actual file stored as Contact attachment) |
| Products | Marketplace Status | Picklist (Active/Paused/Sold Out/Archived) | Optional improvement: replaces Product_Active + Request_pending combo with a single field. If you prefer to keep using the two checkboxes, skip this. |

**Note:** The `Seller` checkbox on Contacts is NOT used for the marketplace — ignore it. Marketplace seller capability is determined by `Contact_Type` containing "Seller".

---

## Claude Code Prompts (Suggested Sequence)

### Prompt 1: Project Init
```
Read this entire document. Initialize the project:
1. Create monorepo structure: /server (Express + TypeScript) and /client (React + Vite)
2. Install all dependencies listed in the Tech Stack section
3. Set up Prisma with the schema provided
4. Create .env.example with all variables
5. Set up basic Express server with health check
6. Set up Vite React app with Clerk provider and React Router
7. Create folder structure: server/src/{routes,services,middleware,utils}
8. Verify both dev servers start
```

### Prompt 2: Auth Flow
```
Implement the full authentication flow:
1. Clerk sign-up/sign-in pages (React)
2. Clerk webhook handler (user.created)
3. Auth middleware that checks: Clerk JWT → local user → approved → EULA → doc
4. Onboarding page: EULA acceptance + document upload
5. Protected route wrapper component
6. Test: unapproved user sees pending screen, approved user reaches dashboard
```

### Prompt 3: Zoho Sync
```
Build the Zoho sync engine:
1. zohoAuth.ts — OAuth token refresh using refresh_token
2. zohoApi.ts — generic request wrapper for Zoho CRM API v7
3. zohoSync.ts — syncProducts() and syncContacts() with upsert logic
4. Cron job running every 15 minutes
5. SyncLog entries for audit trail
6. GET /api/admin/sync-status endpoint
7. POST /api/admin/sync-now endpoint (manual trigger)
```

### Prompt 4: Marketplace UI
```
Build the marketplace browsing experience:
1. Product grid with cards (name, THC/CBD, price, certification, availability)
2. Filtering sidebar (category, type, THC range, CBD range, certification, price)
3. Product detail page with full info
4. Bid form with live proximity score indicator
5. Responsive design (Tailwind)
6. Loading states and empty states
```

### Prompt 5: Seller Features
```
Build seller-facing features:
1. My Listings page — shows seller's products with status badges
2. Inline edit for: price per gram, grams available, upcoming quantity
3. Pause/unpause toggle
4. Changes sync back to Zoho via pushProductUpdate()
5. Bid notification indicators on each listing
```

### Prompt 6: Bid System
```
Implement the bidding system:
1. POST /api/bids — create bid, calculate proximity, create Zoho Task
2. GET /api/bids — buyer's bid history with status
3. Proximity score calculator with visual indicator
4. Orders/bids page showing all user's bids and statuses
5. Webhook handler for Zoho Task status updates → update local bid status
```

---

## Migration Plan (10 Existing Users)

1. Create Clerk accounts manually for all 10 users
2. Send password reset links via Clerk dashboard
3. Ensure all 10 have matching Contacts in Zoho with `Marketplace_Approved = true`
4. Verify Zoho Products module has all required custom fields
5. Run initial sync to populate local database
6. Have users log in and complete onboarding (EULA + doc if not done)
7. Decommission old Harvex marketplace access

---

## Estimated Timeline

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Phase 1: Foundation | Week 1–2 | Auth working, Zoho connected, DB schema live |
| Phase 2: Sync Engine | Week 2–3 | Products syncing, push-back working |
| Phase 3: Marketplace UI | Week 3–4 | Browse, filter, bid — full buyer flow |
| Phase 4: Seller Features | Week 4–5 | My Listings, edit, pause |
| Phase 5: Polish + CoA | Week 5+ | Webhooks, notifications, CoA auto-populate |

**With Claude Code doing the heavy lifting, Phases 1–4 could compress to 3–4 weeks.**






Context

 The GCIS Marketplace (8 prompts complete) has a working product catalog, bid system, CoA integration, and curated shares. The deal-intelligence project at /home/okinho1/deal-intelligence/ is a standalone B2B
  matching platform with a sophisticated 12-factor scoring engine, seller reliability scorecards, reorder prediction, churn detection, buyer propensity scoring, and market intelligence.

 Why integrate? The marketplace currently has only a simple proximity score (bid price vs asking price). By porting deal-intelligence's services into the marketplace, we get:

 - Smart matching — Auto-suggest products to buyers based on purchase history, preferences, timing, and 12 weighted factors
 - Seller reliability — Score sellers on fill rate, quality, delivery, and pricing competitiveness
 - Reorder prediction — Forecast when buyers will need to reorder, enabling proactive outreach
 - Churn detection — Identify at-risk buyers before they leave
 - Buyer propensity — RFM-based scoring to prioritize high-value buyers
 - Market intelligence — Price trends, supply/demand analysis, competitive positioning

 Approach: Copy and adapt deal-intelligence services into the marketplace codebase. Strip multi-tenancy (marketplace is single-tenant), remap data models (PartyA/B → User, Listing → Product), and add new
 Prisma models for intelligence data.

 ---
 Prompt 9: Intelligence Engine Backend

 Goal: Schema changes, 6 adapted services, Transaction model, cron jobs, API routes. All server-side — testable via curl before building UI.

 9.1 Prisma Schema Changes

 Modify: server/prisma/schema.prisma

 New Category model (enables market price tracking by category):

 model Category {
   id          String   @id @default(cuid())
   name        String   @unique    // Maps from Product.category
   description String?
   createdAt   DateTime @default(now())
   updatedAt   DateTime @updatedAt
 }

 New Transaction model (created when bid is accepted):

 model Transaction {
   id                      String    @id @default(cuid())
   buyerId                 String
   buyer                   User      @relation("BuyerTransactions", fields: [buyerId], references: [id])
   sellerId                String
   seller                  User      @relation("SellerTransactions", fields: [sellerId], references: [id])
   productId               String
   product                 Product   @relation(fields: [productId], references: [id])
   bidId                   String?   @unique
   bid                     Bid?      @relation(fields: [bidId], references: [id])
   quantity                Float
   pricePerUnit            Float
   totalValue              Float
   transactionDate         DateTime  @default(now())
   status                  String    @default("pending")  // pending, completed, cancelled
   // Outcome fields (filled after delivery)
   actualQuantityDelivered Float?
   deliveryOnTime          Boolean?
   qualityAsExpected       Boolean?
   outcomeNotes            String?
   outcomeRecordedAt       DateTime?
   // Tracking
   zohoTaskId              String?   @unique
   createdAt               DateTime  @default(now())
   updatedAt               DateTime  @updatedAt
 }

 New Match model (auto-generated buyer-product suggestions):

 model Match {
   id            String    @id @default(cuid())
   buyerId       String
   buyer         User      @relation("BuyerMatches", fields: [buyerId], references: [id])
   productId     String
   product       Product   @relation(fields: [productId], references: [id])
   score         Float     // 0-100 composite score
   breakdown     Json      // {category, priceFit, location, relationship, reorderTiming, ...}
   insights      Json?     // Human-readable insight strings
   status        String    @default("pending")  // pending, viewed, converted, rejected, expired
   convertedBidId String?
   expiresAt     DateTime?
   createdAt     DateTime  @default(now())
   updatedAt     DateTime  @updatedAt

   @@unique([buyerId, productId])
 }

 New SellerScore model:

 model SellerScore {
   id                  String   @id @default(cuid())
   sellerId            String   @unique
   seller              User     @relation(fields: [sellerId], references: [id])
   fillRate            Float    @default(0)     // 0-100, weight 30%
   qualityScore        Float    @default(0)     // 0-100, weight 30%
   deliveryScore       Float    @default(0)     // 0-100, weight 25%
   pricingScore        Float    @default(0)     // 0-100, weight 15%
   overallScore        Float    @default(0)     // Weighted composite
   transactionsScored  Int      @default(0)
   lastCalculatedAt    DateTime @default(now())
   createdAt           DateTime @default(now())
   updatedAt           DateTime @updatedAt
 }

 New Prediction model:

 model Prediction {
   id                    String    @id @default(cuid())
   buyerId               String
   buyer                 User      @relation(fields: [buyerId], references: [id])
   categoryName          String    // Product category string
   predictedDate         DateTime
   confidenceScore       Float     // 0-100
   avgIntervalDays       Float
   basedOnTransactions   Int
   lastTransactionId     String?
   notifiedAt            DateTime?
   createdAt             DateTime  @default(now())
   updatedAt             DateTime  @updatedAt

   @@unique([buyerId, categoryName])
 }

 New ChurnSignal model:

 model ChurnSignal {
   id                String    @id @default(cuid())
   buyerId           String
   buyer             User      @relation(fields: [buyerId], references: [id])
   categoryName      String?
   riskLevel         String    // low, medium, high, critical
   riskScore         Float     // 0-100
   daysSincePurchase Int
   avgIntervalDays   Float
   isActive          Boolean   @default(true)
   resolvedAt        DateTime?
   resolvedReason    String?
   createdAt         DateTime  @default(now())
   updatedAt         DateTime  @updatedAt
 }

 New PropensityScore model:

 model PropensityScore {
   id                String    @id @default(cuid())
   buyerId           String
   buyer             User      @relation(fields: [buyerId], references: [id])
   categoryName      String?
   overallScore      Float     // 0-100 composite
   recencyScore      Float     // 0-100, weight 25%
   frequencyScore    Float     // 0-100, weight 20%
   monetaryScore     Float     // 0-100, weight 15%
   categoryAffinity  Float     // 0-100, weight 15%
   engagementScore   Float     // 0-100, weight 25%
   features          Json?     // Input features for explainability
   expiresAt         DateTime  // Cache expiration (24hr)
   createdAt         DateTime  @default(now())
   updatedAt         DateTime  @updatedAt

   @@unique([buyerId, categoryName])
 }

 New MarketPrice model:

 model MarketPrice {
   id                  String    @id @default(cuid())
   categoryName        String    // Product category string
   avgPrice            Float
   minPrice            Float
   maxPrice            Float
   transactionCount    Int
   totalVolume         Float
   rollingAvg7d        Float?
   rollingAvg30d       Float?
   priceChange7d       Float?    // Percentage
   priceChange30d      Float?    // Percentage
   periodStart         DateTime
   periodEnd           DateTime
   createdAt           DateTime  @default(now())
   updatedAt           DateTime  @updatedAt

   @@unique([categoryName, periodStart])
 }

 Add fields to User model:

 // Add to User model
 lastTransactionDate    DateTime?
 transactionCount       Int       @default(0)
 totalTransactionValue  Float     @default(0)
 avgFulfillmentScore    Float?    // From SellerScore

 Add fields to Product model:

 // Add to Product model
 matchCount             Int       @default(0)

 Add relation to Bid model:

 // Add to Bid model
 transaction            Transaction?

 9.2 Matching Engine Service

 Create: server/src/services/matchingEngine.ts

 Adapted from deal-intelligence matchingEngine.ts (783 lines). Key changes:
 - Remove tenantId constructor parameter and all tenant-scoped queries
 - Replace PartyA → User (buyers), PartyB → User (sellers), Listing → Product
 - Replace categoryId → categoryName (string-based categories)
 - Use marketplace Prisma client from ../index
 - Simplify from 12 to 10 initial factors (exclude deal velocity, custom attributes for v1)

 Reference: /home/okinho1/deal-intelligence/server/src/services/matchingEngine.ts

 Scoring Factors (10 total, weights sum to 100%):
 ┌──────────────────────┬────────┬──────────────────────────────────────────────────────┐
 │        Factor        │ Weight │                        Source                        │
 ├──────────────────────┼────────┼──────────────────────────────────────────────────────┤
 │ Category match       │ 15%    │ Buyer's bid/transaction history by category          │
 ├──────────────────────┼────────┼──────────────────────────────────────────────────────┤
 │ Price fit            │ 12%    │ Product price vs buyer's typical spend               │
 ├──────────────────────┼────────┼──────────────────────────────────────────────────────┤
 │ Location match       │ 5%     │ buyer.mailingCountry vs seller.mailingCountry        │
 ├──────────────────────┼────────┼──────────────────────────────────────────────────────┤
 │ Relationship history │ 10%    │ Prior transactions with this seller                  │
 ├──────────────────────┼────────┼──────────────────────────────────────────────────────┤
 │ Reorder timing       │ 10%    │ From Prediction model                                │
 ├──────────────────────┼────────┼──────────────────────────────────────────────────────┤
 │ Quantity fit         │ 8%     │ Product.gramsAvailable vs buyer's typical order size │
 ├──────────────────────┼────────┼──────────────────────────────────────────────────────┤
 │ Seller reliability   │ 10%    │ From SellerScore model                               │
 ├──────────────────────┼────────┼──────────────────────────────────────────────────────┤
 │ Price vs market      │ 10%    │ Product price vs MarketPrice.rollingAvg30d           │
 ├──────────────────────┼────────┼──────────────────────────────────────────────────────┤
 │ Supply/demand        │ 5%     │ Active buyers predicted to reorder / active products │
 ├──────────────────────┼────────┼──────────────────────────────────────────────────────┤
 │ Buyer propensity     │ 15%    │ From PropensityScore model                           │
 └──────────────────────┴────────┴──────────────────────────────────────────────────────┘
 Key Functions:
 - scoreMatch(buyer, product): Promise<MatchResult> — Score single buyer-product pair
 - generateMatchesForProduct(productId): Promise<number> — Generate matches for a product
 - regenerateAllMatches(): Promise<{products, matches}> — Full regeneration

 9.3 Seller Score Service

 Create: server/src/services/sellerScoreService.ts

 Adapted from deal-intelligence sellerScoreService.ts (277 lines). Key changes:
 - Remove tenantId; query Transactions directly
 - Replace PartyB → User (sellers)
 - Use marketplace's Transaction model with outcome fields

 Key Functions:
 - calculateSellerScores(sellerId): Promise<ScoreResult>
 - updateSellerScore(sellerId): Promise<void>
 - recalculateAllSellerScores(): Promise<{sellersUpdated}>
 - getTopRatedSellers(limit): Promise<Array>

 Score Components (same as deal-intel):
 - Fill Rate (30%) — actualQuantityDelivered / ordered
 - Quality (30%) — % where qualityAsExpected = true
 - Delivery (25%) — % where deliveryOnTime = true
 - Pricing (15%) — Competitiveness vs category average

 9.4 Prediction Engine

 Create: server/src/services/predictionEngine.ts

 Adapted from deal-intelligence predictionEngine.ts (427 lines). Key changes:
 - Remove tenantId
 - Replace PartyA → User (buyers)
 - Use categoryName string instead of categoryId foreign key
 - Use marketplace's Transaction model

 Key Functions:
 - generatePredictionsForBuyer(buyerId): Promise<number>
 - generatePredictions(): Promise<{buyersProcessed, predictionsCreated}>
 - getOverduePredictions(limit): Promise<Array>
 - getUpcomingPredictions(days, limit): Promise<Array>
 - cleanupStalePredictions(): Promise<number>

 Algorithm (same as deal-intel):
 1. Find buyer's transactions by category (min 2 required)
 2. Calculate intervals between consecutive purchases
 3. Filter outliers (< 3 days or > 365 days)
 4. Average interval + standard deviation for confidence
 5. Predicted date = lastTransaction + avgDays

 9.5 Churn Detection Service

 Create: server/src/services/churnDetectionService.ts

 Adapted from deal-intelligence churnDetectionService.ts. Key changes:
 - Remove tenantId
 - Replace PartyA → User (buyers with bids/transactions)
 - Use categoryName instead of categoryId

 Key Functions:
 - analyzeChurnRisk(buyerId, categoryName?): Promise<ChurnRisk[]>
 - detectAllChurnSignals(): Promise<{signalsCreated, signalsUpdated}>
 - getAtRiskBuyers(options): Promise<AtRiskBuyer[]>
 - getChurnStats(): Promise<{...}>
 - resolveChurnSignal(signalId, reason): Promise<void>
 - resolveOnPurchase(buyerId, categoryName?): Promise<number>

 Risk Levels (same as deal-intel):
 - daysSince / avgInterval >= 3 → critical (80-100)
 - ratio 2-3 → high (60-80)
 - ratio 1.5-2 → medium (40-60)
 - ratio 1-1.5 → low (0-40)

 9.6 Propensity Service

 Create: server/src/services/propensityService.ts

 Adapted from deal-intelligence propensityService.ts. Key changes:
 - Remove tenantId
 - Replace PartyA → User
 - Use marketplace's Match, Transaction, ChurnSignal, Prediction models
 - categoryName instead of categoryId

 Score Components (same as deal-intel):
 - Recency (25%) — Days since last purchase (inverse scale)
 - Frequency (20%) — Transaction count + recent activity
 - Monetary (15%) — Total spend + avg order value
 - Category Affinity (15%) — Multi-category engagement
 - Engagement (25%) — Match interaction rate (viewed/converted)

 9.7 Market Context Service

 Create: server/src/services/marketContextService.ts

 Adapted from deal-intelligence marketContextService.ts. Key changes:
 - Remove tenantId
 - Use categoryName string keys
 - Price normalization: use pricePerUnit directly (all prices are per-gram in marketplace)
 - No UnitService needed (marketplace uses grams exclusively)

 Key Functions:
 - updateMarketPrice(categoryName, price, quantity): Promise<void>
 - calculateRollingAverages(categoryName): Promise<void>
 - scorePriceVsMarket(productId): Promise<PriceComparison>
 - scoreSupplyDemand(productId): Promise<SupplyDemandAnalysis>
 - getMarketContext(categoryName): Promise<MarketContext>
 - getMarketTrends(): Promise<MarketTrend[]>
 - getMarketInsights(): Promise<{trends, topCategories, supplyDemandOverview}>

 9.8 Transaction Lifecycle

 Modify: server/src/routes/bids.ts

 Add bid acceptance flow that creates a Transaction:
 ┌─────────────────────────────┬──────────────────────────────────────────────────────┐
 │          Endpoint           │                       Purpose                        │
 ├─────────────────────────────┼──────────────────────────────────────────────────────┤
 │ PATCH /api/bids/:id/accept  │ Seller accepts bid → creates Transaction             │
 ├─────────────────────────────┼──────────────────────────────────────────────────────┤
 │ PATCH /api/bids/:id/reject  │ Seller rejects bid                                   │
 ├─────────────────────────────┼──────────────────────────────────────────────────────┤
 │ PATCH /api/bids/:id/outcome │ Record delivery outcome (quantity, on-time, quality) │
 └─────────────────────────────┴──────────────────────────────────────────────────────┘
 When a bid is accepted:
 1. Create Transaction linking buyer, seller, product, bid
 2. Update bid status to ACCEPTED
 3. Update buyer's lastTransactionDate, transactionCount, totalTransactionValue
 4. Call churnDetectionService.resolveOnPurchase() — auto-resolve churn signals
 5. Call marketContextService.updateMarketPrice() — record price for market tracking
 6. Optionally trigger match regeneration for that buyer

 9.9 Intelligence API Routes

 Create: server/src/routes/intelligence.ts

 All behind requireAuth + marketplaceAuth + requireAdmin:
 ┌─────────────────────────────────────────────┬────────┬──────────────────────────────────────────────────────────┐
 │                  Endpoint                   │ Method │                         Purpose                          │
 ├─────────────────────────────────────────────┼────────┼──────────────────────────────────────────────────────────┤
 │ /api/intelligence/dashboard                 │ GET    │ Consolidated stats (matches, predictions, churn, market) │
 ├─────────────────────────────────────────────┼────────┼──────────────────────────────────────────────────────────┤
 │ /api/intelligence/matches                   │ GET    │ Pending matches (sorted by score, filterable)            │
 ├─────────────────────────────────────────────┼────────┼──────────────────────────────────────────────────────────┤
 │ /api/intelligence/matches/:id               │ GET    │ Match detail with score breakdown                        │
 ├─────────────────────────────────────────────┼────────┼──────────────────────────────────────────────────────────┤
 │ /api/intelligence/matches/generate          │ POST   │ Trigger match generation for all/specific products       │
 ├─────────────────────────────────────────────┼────────┼──────────────────────────────────────────────────────────┤
 │ /api/intelligence/predictions               │ GET    │ Upcoming reorder predictions                             │
 ├─────────────────────────────────────────────┼────────┼──────────────────────────────────────────────────────────┤
 │ /api/intelligence/predictions/calendar      │ GET    │ Calendar view (grouped by week)                          │
 ├─────────────────────────────────────────────┼────────┼──────────────────────────────────────────────────────────┤
 │ /api/intelligence/churn/at-risk             │ GET    │ At-risk buyers with risk levels                          │
 ├─────────────────────────────────────────────┼────────┼──────────────────────────────────────────────────────────┤
 │ /api/intelligence/churn/stats               │ GET    │ Churn statistics                                         │
 ├─────────────────────────────────────────────┼────────┼──────────────────────────────────────────────────────────┤
 │ /api/intelligence/churn/detect              │ POST   │ Run churn detection                                      │
 ├─────────────────────────────────────────────┼────────┼──────────────────────────────────────────────────────────┤
 │ /api/intelligence/market/trends             │ GET    │ Market trends across categories                          │
 ├─────────────────────────────────────────────┼────────┼──────────────────────────────────────────────────────────┤
 │ /api/intelligence/market/insights           │ GET    │ Market insights for dashboard                            │
 ├─────────────────────────────────────────────┼────────┼──────────────────────────────────────────────────────────┤
 │ /api/intelligence/market/:categoryName      │ GET    │ Category market context                                  │
 ├─────────────────────────────────────────────┼────────┼──────────────────────────────────────────────────────────┤
 │ /api/intelligence/propensity/top            │ GET    │ Top buyers by propensity                                 │
 ├─────────────────────────────────────────────┼────────┼──────────────────────────────────────────────────────────┤
 │ /api/intelligence/seller-scores             │ GET    │ All seller scores                                        │
 ├─────────────────────────────────────────────┼────────┼──────────────────────────────────────────────────────────┤
 │ /api/intelligence/seller-scores/:sellerId   │ GET    │ Single seller scorecard                                  │
 ├─────────────────────────────────────────────┼────────┼──────────────────────────────────────────────────────────┤
 │ /api/intelligence/seller-scores/recalculate │ POST   │ Trigger recalculation                                    │
 ├─────────────────────────────────────────────┼────────┼──────────────────────────────────────────────────────────┤
 │ /api/intelligence/transactions              │ GET    │ Transaction history (paginated)                          │
 ├─────────────────────────────────────────────┼────────┼──────────────────────────────────────────────────────────┤
 │ /api/intelligence/transactions/:id          │ GET    │ Transaction detail                                       │
 └─────────────────────────────────────────────┴────────┴──────────────────────────────────────────────────────────┘
 Buyer-facing matches (behind requireAuth + marketplaceAuth):
 ┌──────────────────────────┬────────┬─────────────────────────┐
 │         Endpoint         │ Method │         Purpose         │
 ├──────────────────────────┼────────┼─────────────────────────┤
 │ /api/matches             │ GET    │ Buyer's pending matches │
 ├──────────────────────────┼────────┼─────────────────────────┤
 │ /api/matches/:id         │ GET    │ Match detail            │
 ├──────────────────────────┼────────┼─────────────────────────┤
 │ /api/matches/:id/dismiss │ POST   │ Dismiss/reject match    │
 └──────────────────────────┴────────┴─────────────────────────┘
 9.10 Cron Jobs

 Modify: server/src/index.ts

 Add intelligence cron jobs (alongside existing Zoho 15-min + CoA 5-min):
 ┌──────────────────┬──────────────────────────────┬──────────────────────────────────────────────────┐
 │       Job        │           Schedule           │                     Service                      │
 ├──────────────────┼──────────────────────────────┼──────────────────────────────────────────────────┤
 │ Match generation │ After each Zoho product sync │ matchingEngine.regenerateAllMatches()            │
 ├──────────────────┼──────────────────────────────┼──────────────────────────────────────────────────┤
 │ Predictions      │ Daily 00:00                  │ predictionEngine.generatePredictions() + cleanup │
 ├──────────────────┼──────────────────────────────┼──────────────────────────────────────────────────┤
 │ Seller scores    │ Daily 02:00                  │ sellerScoreService.recalculateAllSellerScores()  │
 ├──────────────────┼──────────────────────────────┼──────────────────────────────────────────────────┤
 │ Propensity       │ Daily 01:00                  │ propensityService.calculateAllPropensities()     │
 ├──────────────────┼──────────────────────────────┼──────────────────────────────────────────────────┤
 │ Churn detection  │ Daily 00:30                  │ churnDetectionService.detectAllChurnSignals()    │
 └──────────────────┴──────────────────────────────┴──────────────────────────────────────────────────┘
 All conditional on having Transaction data (skip if zero transactions).

 9.11 Wire Up

 Modify: server/src/index.ts
 - Mount /api/intelligence routes (admin)
 - Mount /api/matches routes (buyer-facing)
 - Add bid accept/reject/outcome routes
 - Start intelligence cron jobs

 Modify: server/src/routes/marketplace.ts
 - Include matchCount in product listings
 - Include seller's avgFulfillmentScore in product detail

 ---
 Prompt 10: Intelligence Frontend

 Goal: Intelligence dashboard, match explorer, predictions, churn, market trends, seller scorecards. Enhanced existing pages with intelligence data.

 10.1 Client API Extensions

 Modify: client/src/lib/api.ts

 New types:
 interface MatchRecord {
   id, buyerId, productId, score, breakdown, insights, status, createdAt
   buyer: { id, email, companyName, firstName, lastName }
   product: { id, name, category, type, pricePerUnit, gramsAvailable, imageUrls }
 }

 interface PredictionRecord {
   id, buyerId, categoryName, predictedDate, confidenceScore, avgIntervalDays
   buyer: { id, email, companyName, firstName, lastName }
 }

 interface ChurnRecord {
   id, buyerId, categoryName, riskLevel, riskScore, daysSincePurchase, avgIntervalDays, isActive
   buyer: { id, email, companyName }
 }

 interface SellerScoreRecord {
   id, sellerId, fillRate, qualityScore, deliveryScore, pricingScore, overallScore, transactionsScored
   seller: { id, email, companyName }
 }

 interface MarketTrend {
   categoryName, currentAvgPrice, previousAvgPrice, percentChange, trend, volume
 }

 interface MarketContext {
   categoryName, avgPrice30d, minPrice30d, maxPrice30d
   priceChange7d, priceChange30d, transactionCount30d, totalVolume30d
   activeBuyers, activeListings, supplyDemandRatio
 }

 interface IntelDashboard {
   pendingMatches, totalMatches, avgMatchScore
   upcomingPredictions, overduePredictions
   atRiskBuyers: { critical, high, medium, low }
   marketTrends: MarketTrend[]
   topSellers: SellerScoreRecord[]
   topBuyers: { id, companyName, propensityScore }[]
 }

 interface TransactionRecord {
   id, buyerId, sellerId, productId, bidId, quantity, pricePerUnit, totalValue
   status, transactionDate, actualQuantityDelivered, deliveryOnTime, qualityAsExpected
   buyer, seller, product
 }

 New functions: fetchIntelDashboard(), fetchMatches(), fetchMatchById(), generateMatches(), fetchPredictions(), fetchPredictionCalendar(), fetchAtRiskBuyers(), fetchChurnStats(), runChurnDetection(),
 fetchMarketTrends(), fetchMarketInsights(), fetchMarketContext(), fetchSellerScores(), fetchSellerScore(), recalculateSellerScores(), fetchBuyerMatches(), dismissMatch(), fetchTransactions(), acceptBid(),
 rejectBid(), recordOutcome(), fetchTopPropensityBuyers()

 10.2 New Pages
 ┌──────────────────────┬────────────────────────────┬───────┬──────────────────────────────────────────┐
 │         Page         │           Route            │ Auth  │                 Purpose                  │
 ├──────────────────────┼────────────────────────────┼───────┼──────────────────────────────────────────┤
 │ IntelDashboard       │ /intelligence              │ Admin │ Hub with KPIs, charts, quick actions     │
 ├──────────────────────┼────────────────────────────┼───────┼──────────────────────────────────────────┤
 │ MatchExplorer        │ /intelligence/matches      │ Admin │ Browse all matches with score breakdown  │
 ├──────────────────────┼────────────────────────────┼───────┼──────────────────────────────────────────┤
 │ PredictionsPage      │ /intelligence/predictions  │ Admin │ Calendar + list of reorder predictions   │
 ├──────────────────────┼────────────────────────────┼───────┼──────────────────────────────────────────┤
 │ ChurnPage            │ /intelligence/churn        │ Admin │ At-risk buyers with risk levels, actions │
 ├──────────────────────┼────────────────────────────┼───────┼──────────────────────────────────────────┤
 │ MarketIntelPage      │ /intelligence/market       │ Admin │ Price trends, supply/demand by category  │
 ├──────────────────────┼────────────────────────────┼───────┼──────────────────────────────────────────┤
 │ SellerScorecardsPage │ /intelligence/sellers      │ Admin │ Seller reliability rankings              │
 ├──────────────────────┼────────────────────────────┼───────┼──────────────────────────────────────────┤
 │ TransactionsPage     │ /intelligence/transactions │ Admin │ Transaction history + outcome recording  │
 ├──────────────────────┼────────────────────────────┼───────┼──────────────────────────────────────────┤
 │ BuyerMatchesPage     │ /my-matches                │ Buyer │ Personalized product recommendations     │
 └──────────────────────┴────────────────────────────┴───────┴──────────────────────────────────────────┘
 10.3 Intelligence Dashboard (/intelligence)

 Top-level hub page showing:
 - KPI Cards: Active matches, predictions due this week, at-risk buyers, avg seller score
 - Match Activity: Recent high-score matches (top 10)
 - Predictions Timeline: Next 7 days of predicted reorders
 - Churn Alerts: Critical/high-risk buyers requiring attention
 - Market Snapshot: Category price trends (sparklines or mini bar chart)
 - Quick Actions: Generate matches, run churn detection, recalculate scores

 10.4 Match Explorer (/intelligence/matches)

 - Sortable table of matches (score, buyer, product, status, date)
 - Score breakdown visualization (horizontal bar chart per factor)
 - Insight chips (e.g., "Buyer purchases this category monthly", "Price 15% below market")
 - Filters: min score, category, status, buyer, date range
 - Click-through to product detail and buyer info

 10.5 Buyer Matches Page (/my-matches)

 - Card grid of recommended products (sorted by match score)
 - Each card shows: product image, name, match score badge, price, key insights
 - "View Product" → ProductDetail page
 - "Not Interested" → dismiss match
 - "Place Bid" → opens BidForm

 10.6 New Components
 ┌────────────────────┬──────────────────────────────────────────────┬──────────────────────────────────────────────────────────────┐
 │     Component      │                     File                     │                           Purpose                            │
 ├────────────────────┼──────────────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
 │ ScoreBreakdown     │ client/src/components/ScoreBreakdown.tsx     │ Horizontal bar chart of scoring factors                      │
 ├────────────────────┼──────────────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
 │ RiskBadge          │ client/src/components/RiskBadge.tsx          │ Color-coded risk level chip (low/med/high/critical)          │
 ├────────────────────┼──────────────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
 │ SellerScoreCard    │ client/src/components/SellerScoreCard.tsx    │ 4-metric visual card (fill rate, quality, delivery, pricing) │
 ├────────────────────┼──────────────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
 │ MarketTrendChart   │ client/src/components/MarketTrendChart.tsx   │ Simple category price trend visualization                    │
 ├────────────────────┼──────────────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
 │ PredictionCalendar │ client/src/components/PredictionCalendar.tsx │ Weekly view of predicted reorders                            │
 ├────────────────────┼──────────────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
 │ MatchCard          │ client/src/components/MatchCard.tsx          │ Product recommendation card with match score                 │
 ├────────────────────┼──────────────────────────────────────────────┼──────────────────────────────────────────────────────────────┤
 │ OutcomeForm        │ client/src/components/OutcomeForm.tsx        │ Record delivery outcome (quantity, on-time, quality)         │
 └────────────────────┴──────────────────────────────────────────────┴──────────────────────────────────────────────────────────────┘
 10.7 Enhanced Existing Pages

 Modify: client/src/pages/ProductDetail.tsx
 - Add "Match Score" badge when buyer has a match for this product
 - Add seller reliability score display (from SellerScore)
 - Add "Market Position" indicator (price vs category average)

 Modify: client/src/pages/MyListings.tsx
 - Add seller score summary at top (4 metrics)
 - Add match count per product
 - Add "Buyer Interest" indicator (how many matches exist)

 Modify: client/src/pages/Orders.tsx
 - Add accept/reject actions for sellers viewing bids on their products
 - Add outcome recording for completed transactions

 Modify: client/src/components/Layout.tsx
 - Add "Intelligence" nav link for admin users (with sub-items)
 - Add "My Matches" nav link for all buyers

 Modify: client/src/App.tsx
 - Add routes for all new intelligence pages
 - Add /my-matches buyer-facing route

 ---
 Prompt 11 (Future): Zoho Deep Sync

 Not in current scope but planned:
 - Sync Transactions → Zoho Deals module
 - Sync Matches as Zoho Notes or Activities
 - Sync Predictions as Zoho Tasks (reorder reminders)
 - Push seller scores to Zoho Contact custom fields
 - Push churn signals as Zoho alerts
 - Two-way deal status sync

 ---
 Data Model Mapping (deal-intel → marketplace)
 ┌──────────────────────────────┬──────────────────────────────────────┬──────────────────────────────┐
 │          Deal-Intel          │             Marketplace              │            Notes             │
 ├──────────────────────────────┼──────────────────────────────────────┼──────────────────────────────┤
 │ PartyA                       │ User (contactType contains "Buyer")  │ Single model, role-based     │
 ├──────────────────────────────┼──────────────────────────────────────┼──────────────────────────────┤
 │ PartyB                       │ User (contactType contains "Seller") │ Same User model              │
 ├──────────────────────────────┼──────────────────────────────────────┼──────────────────────────────┤
 │ Listing                      │ Product (isActive=true)              │ Already exists               │
 ├──────────────────────────────┼──────────────────────────────────────┼──────────────────────────────┤
 │ Transaction (deal-intel)     │ Transaction (new model)              │ Created on bid acceptance    │
 ├──────────────────────────────┼──────────────────────────────────────┼──────────────────────────────┤
 │ Match (deal-intel)           │ Match (new model)                    │ Buyer × Product pairs        │
 ├──────────────────────────────┼──────────────────────────────────────┼──────────────────────────────┤
 │ SellerScore (deal-intel)     │ SellerScore (new model)              │ 1:1 with seller User         │
 ├──────────────────────────────┼──────────────────────────────────────┼──────────────────────────────┤
 │ Prediction (deal-intel)      │ Prediction (new model)               │ Buyer × Category             │
 ├──────────────────────────────┼──────────────────────────────────────┼──────────────────────────────┤
 │ ChurnSignal (deal-intel)     │ ChurnSignal (new model)              │ Per buyer                    │
 ├──────────────────────────────┼──────────────────────────────────────┼──────────────────────────────┤
 │ PropensityScore (deal-intel) │ PropensityScore (new model)          │ Buyer × Category             │
 ├──────────────────────────────┼──────────────────────────────────────┼──────────────────────────────┤
 │ MarketPrice (deal-intel)     │ MarketPrice (new model)              │ Per category period          │
 ├──────────────────────────────┼──────────────────────────────────────┼──────────────────────────────┤
 │ Category (deal-intel)        │ Category (new model)                 │ Auto-populated from products │
 ├──────────────────────────────┼──────────────────────────────────────┼──────────────────────────────┤
 │ Tenant                       │ N/A (single tenant)                  │ Removed                      │
 ├──────────────────────────────┼──────────────────────────────────────┼──────────────────────────────┤
 │ CustomAttribute              │ N/A (v1)                             │ Future enhancement           │
 ├──────────────────────────────┼──────────────────────────────────────┼──────────────────────────────┤
 │ DealVelocity                 │ N/A (v1)                             │ Future enhancement           │
 └──────────────────────────────┴──────────────────────────────────────┴──────────────────────────────┘
 ---
 Files Summary

 Prompt 9 — Create:

 - server/src/services/matchingEngine.ts
 - server/src/services/sellerScoreService.ts
 - server/src/services/predictionEngine.ts
 - server/src/services/churnDetectionService.ts
 - server/src/services/propensityService.ts
 - server/src/services/marketContextService.ts
 - server/src/routes/intelligence.ts

 Prompt 9 — Modify:

 - server/prisma/schema.prisma (7 new models + field additions to User, Product, Bid)
 - server/src/index.ts (mount routes, start cron jobs)
 - server/src/routes/bids.ts (add accept/reject/outcome endpoints)
 - server/src/routes/marketplace.ts (include matchCount, seller score)

 Prompt 10 — Create:

 - client/src/pages/IntelDashboard.tsx
 - client/src/pages/MatchExplorer.tsx
 - client/src/pages/PredictionsPage.tsx
 - client/src/pages/ChurnPage.tsx
 - client/src/pages/MarketIntelPage.tsx
 - client/src/pages/SellerScorecardsPage.tsx
 - client/src/pages/TransactionsPage.tsx
 - client/src/pages/BuyerMatchesPage.tsx
 - client/src/components/ScoreBreakdown.tsx
 - client/src/components/RiskBadge.tsx
 - client/src/components/SellerScoreCard.tsx
 - client/src/components/MarketTrendChart.tsx
 - client/src/components/PredictionCalendar.tsx
 - client/src/components/MatchCard.tsx
 - client/src/components/OutcomeForm.tsx

 Prompt 10 — Modify:

 - client/src/lib/api.ts (new types + ~20 API functions)
 - client/src/App.tsx (new routes)
 - client/src/components/Layout.tsx (nav links)
 - client/src/pages/ProductDetail.tsx (match score, seller reliability, market position)
 - client/src/pages/MyListings.tsx (seller score, match counts)
 - client/src/pages/Orders.tsx (accept/reject bids, record outcomes)

 ---
 Verification

 After Prompt 9:

 1. Run prisma db push to apply schema changes
 2. Verify TypeScript compiles: cd server && npx tsc --noEmit
 3. Start server: npx ts-node src/index.ts
 4. Test match generation: curl -X POST http://localhost:3001/api/intelligence/matches/generate (with admin auth)
 5. Test predictions: curl http://localhost:3001/api/intelligence/predictions (with admin auth)
 6. Test bid acceptance: curl -X PATCH http://localhost:3001/api/bids/:id/accept (with seller auth)
 7. Verify cron jobs log on schedule

 After Prompt 10:

 1. Start Vite dev server
 2. Navigate to /intelligence — dashboard loads with KPIs
 3. Navigate to /intelligence/matches — match explorer shows scored matches
 4. Navigate to /my-matches as buyer — personalized recommendations appear
 5. Accept a bid as seller → Transaction created → outcome form available
 6. Verify TypeScript compiles: cd client && npx tsc --noEmit