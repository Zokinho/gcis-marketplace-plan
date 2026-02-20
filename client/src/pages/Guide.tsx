import { useState, useRef } from 'react';
import Layout from '../components/Layout';
import { useUserStatus } from '../lib/useUserStatus';

const SECTIONS = [
  {
    id: 'browsing-marketplace',
    title: 'Browsing the Marketplace',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614m-16.5 0a3.004 3.004 0 0 1-.621-4.72l1.189-1.19A1.5 1.5 0 0 1 5.378 3h13.243a1.5 1.5 0 0 1 1.06.44l1.19 1.189a3 3 0 0 1-.621 4.72M6.75 18h3.75a.75.75 0 0 0 .75-.75V13.5a.75.75 0 0 0-.75-.75H6.75a.75.75 0 0 0-.75.75v3.75c0 .414.336.75.75.75Z" />
      </svg>
    ),
    sellerOnly: false,
    defaultOpen: true,
    steps: [
      { title: 'Open the Marketplace', description: 'Click "Marketplace" in the top navigation bar to see all available products.' },
      { title: 'Search for products', description: 'Use the search bar at the top to find products by name, strain, or producer. Results update as you type.' },
      { title: 'Use filters', description: 'Open the filter sidebar to narrow results by category, price range, THC/CBD content, certification, and more.' },
      { title: 'Switch between views', description: 'Toggle between grid view (cards) and list view (compact rows) using the view buttons above the product list.' },
      { title: 'View product details', description: 'Click any product to see full details including test results, pricing, availability, and producer information.' },
    ],
  },
  {
    id: 'placing-bids',
    title: 'Placing Bids',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
      </svg>
    ),
    sellerOnly: false,
    defaultOpen: false,
    steps: [
      { title: 'Find a product you want', description: 'Browse or search the marketplace to find a product you\'re interested in purchasing.' },
      { title: 'Fill out the bid form', description: 'On the product detail page, enter your desired quantity (in grams) and your offer price per gram.' },
      { title: 'Check the proximity indicator', description: 'The proximity gauge shows how close your bid is to the asking price. Green means you\'re close; red means your offer is far below.' },
      { title: 'Submit your bid', description: 'Click "Submit Bid" to send your offer to the seller. You\'ll see a confirmation once it\'s submitted.' },
      { title: 'Track in Orders', description: 'Go to the "Orders" page to see all your bids and their current status (Pending, Accepted, or Rejected).' },
      { title: 'Record delivery outcomes', description: 'After a bid is accepted and you receive the product, record the delivery outcome (on time, quality as expected, actual quantity received).' },
    ],
  },
  {
    id: 'notifications-matches',
    title: 'Notifications & Matches',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
      </svg>
    ),
    sellerOnly: false,
    defaultOpen: false,
    steps: [
      { title: 'Check the bell icon', description: 'The notification bell in the top-right corner shows a badge when you have unread notifications. Click it for a quick preview.' },
      { title: 'View all notifications', description: 'Click "View all" in the bell dropdown or go to the Notifications page for a full list of all your alerts.' },
      { title: 'Set your preferences', description: 'On the Notifications page, click "Preferences" to choose which notification types you want to receive.' },
      { title: 'View match suggestions', description: 'Go to "My Matches" in the navigation to see AI-powered product recommendations tailored to your buying history.' },
      { title: 'Dismiss matches', description: 'Not interested in a suggestion? Click the dismiss button to remove it. The system will learn from your preferences over time.' },
    ],
  },
  {
    id: 'managing-listings',
    title: 'Managing Your Listings',
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
      </svg>
    ),
    sellerOnly: true,
    defaultOpen: false,
    steps: [
      { title: 'View your listings', description: 'Click "My Listings" in the navigation to see all your products currently listed on the marketplace.' },
      { title: 'Edit listing details', description: 'Click the edit button on any listing to update the price, available quantity, or description.' },
      { title: 'Pause or activate listings', description: 'Use the toggle switch to temporarily pause a listing (hides it from buyers) or reactivate it when ready.' },
      { title: 'Create a new listing', description: 'Click "Create Listing" to add a new product. You can upload a CoA (Certificate of Analysis) to auto-fill product details.' },
      { title: 'Share your products', description: 'Create shareable links to send your product catalog to specific buyers or partners without requiring them to log in.' },
      { title: 'Review incoming bids', description: 'Check the "Orders" page for the Seller view to see bids from buyers. You can accept or reject each bid.' },
    ],
  },
] as const;

function GuideStep({ number, title, description }: { number: number; title: string; description: string }) {
  return (
    <div className="flex gap-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-teal text-sm font-bold text-white">
        {number}
      </div>
      <div className="pt-0.5">
        <h4 className="font-medium text-primary">{title}</h4>
        <p className="mt-1 text-sm text-muted leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

function GuideSection({
  id,
  title,
  icon,
  sellerOnly,
  steps,
  isOpen,
  onToggle,
}: {
  id: string;
  title: string;
  icon: React.ReactNode;
  sellerOnly: boolean;
  steps: readonly { title: string; description: string }[];
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div id={id} className="scroll-mt-20 rounded-lg border border-brand-blue/15 dark:border-slate-700 surface overflow-hidden">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-brand-blue/5 dark:hover:bg-slate-700/50 transition"
      >
        <div className="flex items-center gap-3">
          <div className="text-brand-teal dark:text-brand-yellow">{icon}</div>
          <h3 className="text-lg font-semibold text-primary">{title}</h3>
          {sellerOnly && (
            <span className="rounded-full bg-brand-sage/20 px-2.5 py-0.5 text-xs font-medium text-brand-teal dark:bg-brand-sage/15 dark:text-brand-sage">
              Sellers
            </span>
          )}
        </div>
        <svg
          className={`h-5 w-5 text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {isOpen && (
        <div className="border-t border-default px-5 py-5">
          <div className="flex flex-col gap-5">
            {steps.map((step, i) => (
              <GuideStep key={i} number={i + 1} title={step.title} description={step.description} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Guide() {
  const { data } = useUserStatus();
  const isSeller = data?.user?.contactType?.includes('Seller') ?? false;

  const visibleSections = SECTIONS.filter((s) => !s.sellerOnly || isSeller);

  const [openSections, setOpenSections] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    visibleSections.forEach((s) => {
      if (s.defaultOpen) initial.add(s.id);
    });
    return initial;
  });

  const containerRef = useRef<HTMLDivElement>(null);

  const toggleSection = (id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      setOpenSections((prev) => new Set(prev).add(id));
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <Layout>
      <div ref={containerRef} className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-primary">Platform Guide</h1>
          <p className="mt-1 text-sm text-muted">
            Step-by-step instructions for using Harvex. Click any section to expand it.
          </p>
          <div className="mt-2 h-1 w-12 rounded-full bg-gradient-to-r from-brand-yellow to-brand-teal teal:from-brand-yellow teal:to-brand-coral" />
        </div>

        {/* Quick links */}
        <div className="mb-6 flex flex-wrap gap-2">
          {visibleSections.map((s) => (
            <button
              key={s.id}
              onClick={() => scrollTo(s.id)}
              className="rounded-full border border-brand-teal/20 bg-brand-teal/5 px-3.5 py-1.5 text-sm font-medium text-brand-teal transition hover:bg-brand-teal/10 dark:border-brand-yellow/25 dark:bg-brand-yellow/10 dark:text-brand-yellow dark:hover:bg-brand-yellow/20"
            >
              {s.title}
            </button>
          ))}
        </div>

        {/* Accordion sections */}
        <div className="flex flex-col gap-3">
          {visibleSections.map((section) => (
            <GuideSection
              key={section.id}
              id={section.id}
              title={section.title}
              icon={section.icon}
              sellerOnly={section.sellerOnly}
              steps={section.steps}
              isOpen={openSections.has(section.id)}
              onToggle={() => toggleSection(section.id)}
            />
          ))}
        </div>

      </div>
    </Layout>
  );
}
