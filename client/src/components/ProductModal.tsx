import { useEffect } from 'react';
import ProductDetailContent from './ProductDetailContent';

interface ProductModalProps {
  productId: string | null;
  onClose: () => void;
}

export default function ProductModal({ productId, onClose }: ProductModalProps) {
  useEffect(() => {
    if (!productId) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [productId, onClose]);

  if (!productId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-6 lg:p-8" onClick={onClose}>
      <div
        className="relative my-4 w-full max-w-4xl rounded-xl border border-brand-blue/15 bg-white shadow-2xl dark:bg-brand-dark"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-muted transition hover:bg-gray-100 hover:text-primary dark:hover:bg-slate-700"
          aria-label="Close"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Content */}
        <div className="max-h-[85vh] overflow-y-auto p-6">
          <ProductDetailContent productId={productId} />
        </div>
      </div>
    </div>
  );
}
