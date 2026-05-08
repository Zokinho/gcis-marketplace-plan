export interface TourStep {
  target: string;
  title: string;
  content: string;
  route?: string;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
  spotlightClicks?: boolean;
  disableBeacon?: boolean;
  skipScroll?: boolean;
  requiresSeller?: boolean;
}

export interface TourDefinition {
  id: string;
  title: string;
  description: string;
  steps: TourStep[];
  icon: string; // SVG path d attribute
  sellerOnly?: boolean;
  stepCount: number;
}

export const TOURS: TourDefinition[] = [
  // ── Buyer Tours ──────────────────────────────────────────────────

  {
    id: 'marketplace-browsing',
    title: 'Marketplace Browsing',
    description: 'Learn to search, filter, and browse cannabis products from licensed producers.',
    icon: 'M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z',
    stepCount: 7,
    steps: [
      {
        target: '[data-tour="nav-marketplace"]',
        title: 'Marketplace',
        content: 'Click "Marketplace" in the navigation to browse all available products.',
        placement: 'bottom',
        disableBeacon: true,
      },
      {
        target: '[data-tour="filter-search"]',
        title: 'Search Products',
        content: 'Use the search bar to find products by name, strain, or producer. Results update as you type.',
        route: '/marketplace',
        placement: 'bottom',
      },
      {
        target: '[data-tour="filter-sidebar"]',
        title: 'Filter Results',
        content: 'Use filters to narrow results by category, THC/CBD range, certification, and more.',
        route: '/marketplace',
        placement: 'left',
      },
      {
        target: '[data-tour="view-toggle"]',
        title: 'Switch Views',
        content: 'Toggle between large grid, compact grid, and list views to browse products your preferred way.',
        route: '/marketplace',
        placement: 'bottom',
      },
      {
        target: '[data-tour="sort-dropdown"]',
        title: 'Sort Products',
        content: 'Sort products by name, THC content, availability, or newest first.',
        route: '/marketplace',
        placement: 'bottom',
      },
      {
        target: '[data-tour="marketplace-tabs"]',
        title: 'Marketplace Sections',
        content: 'Switch between Products, Clearance deals, and Wanted (ISO) requests using these tabs.',
        route: '/marketplace',
        placement: 'bottom',
      },
      {
        target: '[data-tour="first-product"]',
        title: 'Product Cards',
        content: 'Click any product card to see full details including test results, pricing, and availability.',
        route: '/marketplace',
        placement: 'bottom',
      },
    ],
  },

  {
    id: 'placing-bid',
    title: 'Placing a Bid',
    description: 'Walk through placing a bid on a product, from browsing to submission.',
    icon: 'M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z',
    stepCount: 5,
    steps: [
      {
        target: '[data-tour="first-product"]',
        title: 'Select a Product',
        content: 'Click "Next" to open this product and see the bid form, or click the card directly.',
        route: '/marketplace',
        placement: 'bottom',
        spotlightClicks: true,
      },
      {
        target: '[data-tour="bid-form"]',
        title: 'Bid Form',
        content: 'Use this form to place your bid. Enter your desired price and quantity.',
        placement: 'left',
      },
      {
        target: '[data-tour="bid-price"]',
        title: 'Set Your Price',
        content: 'Enter your offer price per gram. The proximity indicator below will show how close your bid is to the asking price.',
        placement: 'left',
      },
      {
        target: '[data-tour="bid-proximity"]',
        title: 'Proximity Indicator',
        content: 'This gauge shows how close your bid is to the seller\'s price. Green means close, red means far below.',
        placement: 'left',
      },
      {
        target: '[data-tour="bid-submit"]',
        title: 'Submit Your Bid',
        content: 'Click "Submit Bid" to send your offer. Track it on the Orders page.',
        placement: 'left',
      },
    ],
  },

  {
    id: 'orders-tracking',
    title: 'Orders & Tracking',
    description: 'View your bid history and track order status.',
    icon: 'M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z',
    stepCount: 3,
    steps: [
      {
        target: '[data-tour="nav-orders"]',
        title: 'Orders Page',
        content: 'Click "Orders" in the navigation to see all your bids and their status.',
        placement: 'bottom',
        disableBeacon: true,
      },
      {
        target: '[data-tour="orders-tabs"]',
        title: 'Buyer & Seller Views',
        content: 'If you\'re both a buyer and seller, a tab switcher appears here to switch between your bids and incoming bids.',
        route: '/orders',
        placement: 'bottom',
        requiresSeller: true,
      },
      {
        target: '[data-tour="orders-content"]',
        title: 'Your Bids',
        content: 'Your bids appear here with status badges (Pending, Accepted, Rejected). Use the status filters to narrow results, and click any product name to view it in the marketplace.',
        route: '/orders',
        placement: 'top',
      },
    ],
  },

  {
    id: 'shortlist',
    title: 'Shortlist',
    description: 'Save products for later and get notified of price drops.',
    icon: 'M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z',
    stepCount: 3,
    steps: [
      {
        target: '[data-tour="shortlist-button"]',
        title: 'Bookmark Products',
        content: 'Click the bookmark icon on any product to save it to your shortlist. Shortlisted products also help our suggestion engine recommend better matches for you.',
        route: '/marketplace',
        placement: 'bottom',
        disableBeacon: true,
        skipScroll: true,
      },
      {
        target: '[data-tour="nav-shortlist"]',
        title: 'View Shortlist',
        content: 'Click "Shortlist" in the navigation to see all your saved products in one place.',
        placement: 'bottom',
      },
      {
        target: '[data-tour="shortlist-sort"]',
        title: 'Your Shortlist',
        content: 'Sort by date saved, name, or price to quickly find what you need. When a shortlisted product drops in price, you\'ll receive a notification automatically.',
        route: '/shortlist',
        placement: 'bottom',
      },
    ],
  },

  {
    id: 'iso-board',
    title: 'ISO Board (Wanted)',
    description: 'Post what you\'re looking for and get matched with sellers.',
    icon: 'm21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z',
    stepCount: 4,
    steps: [
      {
        target: '[data-tour="tab-wanted"]',
        title: 'Wanted Tab',
        content: 'Click "Wanted" to access the ISO Board where buyers post procurement requests.',
        route: '/marketplace',
        placement: 'bottom',
        disableBeacon: true,
        spotlightClicks: true,
      },
      {
        target: '[data-tour="iso-create"]',
        title: 'Post an ISO',
        content: 'Click "Post ISO" to describe what you\'re looking for — category, THC/CBD range, quantity, and budget.',
        route: '/iso',
        placement: 'bottom',
      },
      {
        target: '[data-tour="iso-browse-tab"]',
        title: 'Browse Requests',
        content: 'The Browse tab shows all open ISO requests. Use this to understand market demand.',
        route: '/iso',
        placement: 'bottom',
      },
      {
        target: '[data-tour="iso-my-tab"]',
        title: 'Your ISOs',
        content: 'Switch to "My ISOs" to track your requests, see responses, and manage status. The system automatically matches new products against your open ISOs and notifies you of matches.',
        route: '/iso',
        placement: 'bottom',
      },
    ],
  },

  {
    id: 'clearance',
    title: 'Clearance / Spot Sales',
    description: 'Find limited-time deals with countdown timers.',
    icon: 'M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
    stepCount: 2,
    steps: [
      {
        target: '[data-tour="tab-clearance"]',
        title: 'Clearance Tab',
        content: 'Click "Clearance" to see limited-time deals curated by the admin team.',
        route: '/marketplace',
        placement: 'bottom',
        disableBeacon: true,
        spotlightClicks: true,
      },
      {
        target: '[data-tour="spot-sales-content"]',
        title: 'Clearance Deals',
        content: 'Clearance deals appear here with discounted prices, discount percentages, and countdown timers. When the timer hits zero, the deal expires — act fast on ones you like!',
        route: '/spot-sales',
        placement: 'top',
      },
    ],
  },

  // ── Seller Tours ─────────────────────────────────────────────────

  {
    id: 'managing-listings',
    title: 'Managing Listings',
    description: 'View, edit, and control your product listings.',
    icon: 'M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z',
    sellerOnly: true,
    stepCount: 7,
    steps: [
      {
        target: '[data-tour="nav-my-listings"]',
        title: 'My Listings',
        content: 'Click "My Listings" to see all your products currently listed on the marketplace.',
        placement: 'bottom',
        disableBeacon: true,
      },
      {
        target: '[data-tour="listings-content"]',
        title: 'Your Listings',
        content: 'Your product listings appear here. Each card shows the product name, status, pricing, and available quantity. Click the expand arrow to edit price, quantity, or description, and use the toggle switch to pause or reactivate a listing.',
        route: '/my-listings',
        placement: 'top',
      },
      {
        target: '[data-tour="create-listing"]',
        title: 'Create New Listing',
        content: 'Click "Create Listing" to add a new product. Let\'s walk through the form.',
        route: '/my-listings',
        placement: 'bottom',
        spotlightClicks: true,
      },
      {
        target: '[data-tour="coa-scan"]',
        title: 'CoA Auto-Fill',
        content: 'Have a Certificate of Analysis? Upload it here and AI will extract product name, potency, terpenes, and lab info to auto-fill the form. You can review and edit everything before submitting.',
        route: '/create-listing',
        placement: 'bottom',
      },
      {
        target: '[data-tour="listing-category"]',
        title: 'Choose a Category',
        content: 'Start by selecting a product category. This determines which fields are shown — for example, flower categories include bud sizes and terpenes, while edibles show different options.',
        route: '/create-listing',
        placement: 'bottom',
      },
      {
        target: '[data-tour="listing-media"]',
        title: 'Upload Media',
        content: 'Add a cover photo, product images, and Certificate of Analysis PDFs. The cover photo is what buyers see first in the marketplace.',
        route: '/create-listing',
        placement: 'top',
      },
      {
        target: '[data-tour="listing-submit"]',
        title: 'Submit for Review',
        content: 'When you\'re done, click "Submit Listing." An admin will review your listing before it goes live on the marketplace.',
        route: '/create-listing',
        placement: 'top',
      },
    ],
  },

  {
    id: 'reviewing-bids',
    title: 'Reviewing Bids',
    description: 'Manage incoming bids from buyers on your products.',
    icon: 'M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
    sellerOnly: true,
    stepCount: 3,
    steps: [
      {
        target: '[data-tour="nav-orders"]',
        title: 'Orders Page',
        content: 'Go to the Orders page to see incoming bids on your products.',
        placement: 'bottom',
        disableBeacon: true,
      },
      {
        target: '[data-tour="orders-tabs"]',
        title: 'Incoming Bids Tab',
        content: 'Switch to the "Incoming Bids" tab to see bids placed by buyers.',
        route: '/orders',
        placement: 'bottom',
      },
      {
        target: '[data-tour="orders-content"]',
        title: 'Manage Bids & Outcomes',
        content: 'Incoming bids appear here. Accept bids to create a transaction, or reject them — the buyer is notified either way. After a sale, record the delivery outcome (quality, on-time, actual quantity) to build your seller score.',
        route: '/orders',
        placement: 'top',
      },
    ],
  },

  {
    id: 'sharing-products',
    title: 'Sharing Products',
    description: 'Create shareable links for your product catalog.',
    icon: 'M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z',
    sellerOnly: true,
    stepCount: 2,
    steps: [
      {
        target: '[data-tour="nav-my-listings"]',
        title: 'My Listings',
        content: 'Go to My Listings to access sharing features.',
        placement: 'bottom',
        disableBeacon: true,
      },
      {
        target: '[data-tour="listings-content"]',
        title: 'Share Your Products',
        content: 'From this page, use the "Share Products" button to create a shareable link with selected products from your inventory. Share links let partners browse your products without needing a marketplace account.',
        route: '/my-listings',
        placement: 'top',
      },
    ],
  },
];

export function getTourById(id: string): TourDefinition | undefined {
  return TOURS.find((t) => t.id === id);
}

export function getBuyerTours(): TourDefinition[] {
  return TOURS.filter((t) => !t.sellerOnly);
}

export function getSellerTours(): TourDefinition[] {
  return TOURS.filter((t) => t.sellerOnly);
}
