import { Link } from 'react-router-dom';
import { Home, AlertCircle } from 'lucide-react';
import { Layout } from '@/shared/components/layout';

export function NotFoundPage() {
  return (
    <Layout>
      <div className="max-w-md mx-auto text-center py-20">
        <AlertCircle className="w-16 h-16 text-ink-500 mx-auto mb-6" />
        <h1 className="text-4xl font-display font-bold text-ink-100 mb-3">Page Not Found</h1>
        <p className="text-ink-400 mb-8">
          The page you're looking for doesn't exist or hasn't been built yet.
        </p>
        <Link to="/" className="btn-primary">
          <Home className="w-4 h-4" />
          Back to Home
        </Link>
      </div>
    </Layout>
  );
}
