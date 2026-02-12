import { useParams, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import ProductDetailContent from '../components/ProductDetailContent';

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();

  if (!id) {
    return (
      <Layout>
        <div className="rounded-lg border border-default surface p-12 text-center">
          <h3 className="mb-2 text-lg font-semibold text-secondary">Product not found</h3>
          <Link to="/marketplace" className="text-sm font-medium text-brand-teal underline hover:text-brand-teal/80">
            Back to Marketplace
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Breadcrumb */}
      <nav className="mb-4 text-sm text-muted">
        <Link to="/marketplace" className="hover:text-brand-teal">Marketplace</Link>
        <span className="mx-2">/</span>
        <span className="text-primary">Product Detail</span>
      </nav>

      <ProductDetailContent productId={id} />
    </Layout>
  );
}
