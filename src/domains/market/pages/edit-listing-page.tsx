import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, Loader2, Check, AlertCircle } from 'lucide-react';
import { Layout } from '@/shared/components/layout';
import { cn } from '@/shared/cn';
import { useAuth } from '@/domains/identity/auth-context';
import {
  fetchListingById,
  updateListing,
  type MarketListing,
  type ListingCategory,
} from '@/domains/market/services';

const CATEGORIES: { key: ListingCategory; label: string }[] = [
  { key: 'products', label: 'Products' },
  { key: 'services', label: 'Services' },
];

export function EditListingPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';

  const [listing, setListing] = useState<MarketListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ListingCategory>('services');
  const [description, setDescription] = useState('');
  const [productsServices, setProductsServices] = useState('');
  const [priceDisplay, setPriceDisplay] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!id || !userId) return;
    fetchListingById(id, userId)
      .then((data) => {
        if (!data || data.owner_id !== userId) {
          setListing(null);
          return;
        }
        setListing(data);
        setName(data.name);
        setCategory(data.category);
        setDescription(data.description);
        setProductsServices(data.products_services);
        setPriceDisplay(data.price_display);
        setExternalUrl(data.external_url);
        setContactInfo(data.contact_info);
        setImageUrl(data.image_url ?? '');
      })
      .catch(() => setListing(null))
      .finally(() => setLoading(false));
  }, [id, userId]);

  const handleSubmit = useCallback(async () => {
    if (!id || !name.trim()) {
      setError('Business name is required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await updateListing({
        listing_id: id,
        name: name.trim(),
        category,
        description: description.trim(),
        products_services: productsServices.trim(),
        price_display: priceDisplay.trim(),
        external_url: externalUrl.trim(),
        contact_info: contactInfo.trim(),
        image_url: imageUrl.trim() || null,
      });
      setSuccess(true);
      setTimeout(() => navigate(`/market/listing/${id}`), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update listing.');
    } finally {
      setSubmitting(false);
    }
  }, [id, name, category, description, productsServices, priceDisplay, externalUrl, contactInfo, imageUrl, navigate]);

  if (loading) {
    return (
      <Layout fullWidth>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-empire-text-muted animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!listing) {
    return (
      <Layout fullWidth>
        <div className="max-w-[600px] mx-auto px-4 py-8 space-y-4">
          <BackButton onClick={() => navigate('/profile')} />
          <div className="frame-utility p-8 text-center">
            <AlertCircle className="w-8 h-8 text-empire-text-muted mx-auto mb-3" />
            <p className="text-sm font-medium text-empire-text-secondary mb-1">
              You can only edit your own listings.
            </p>
            <button onClick={() => navigate('/profile')} className="btn-secondary text-sm mt-4">
              Back to Profile
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout fullWidth>
      <div className="max-w-[600px] mx-auto px-4 py-4 space-y-4">
        <BackButton onClick={() => navigate(`/market/listing/${id}`)} />

        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-empire-gold" />
          <h1 className="font-display text-lg font-bold text-empire-ivory">Edit Listing</h1>
        </div>

        {success && (
          <div className="frame-utility p-3 border-empire-success/20 bg-empire-success/5 flex items-center gap-2">
            <Check className="w-4 h-4 text-empire-success shrink-0" />
            <p className="text-sm text-empire-success">Listing updated. Redirecting...</p>
          </div>
        )}

        {error && (
          <div className="frame-utility p-3 border-empire-danger/20 bg-empire-danger/5">
            <p className="text-sm text-empire-danger">{error}</p>
          </div>
        )}

        {listing.status === 'approved' && (
          <div className="frame-utility p-3 border-empire-gold/20 bg-empire-gold/5">
            <p className="text-xs text-empire-text-secondary">
              Editing an approved listing will reset it to <span className="text-empire-gold font-medium">In Review</span> status so an admin can verify the changes.
            </p>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="label-field">Business Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field text-sm"
              placeholder="e.g. Empire Coffee Roasters"
            />
          </div>

          <div>
            <label className="label-field">Category *</label>
            <div className="flex gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.key}
                  onClick={() => setCategory(cat.key)}
                  className={cn(
                    'flex-1 px-3 py-2.5 rounded-lg text-sm font-medium border transition-all',
                    category === cat.key
                      ? 'bg-empire-gold/10 border-empire-gold/25 text-empire-gold'
                      : 'frame-utility text-empire-text-muted'
                  )}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label-field">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="input-field text-sm resize-none"
              placeholder="Tell the community about your business..."
            />
          </div>

          <div>
            <label className="label-field">Products & Services</label>
            <textarea
              value={productsServices}
              onChange={(e) => setProductsServices(e.target.value)}
              rows={3}
              className="input-field text-sm resize-none"
              placeholder="What do you offer? List your key products or services..."
            />
          </div>

          <div>
            <label className="label-field">Price Display</label>
            <input
              type="text"
              value={priceDisplay}
              onChange={(e) => setPriceDisplay(e.target.value)}
              className="input-field text-sm"
              placeholder="e.g. $5-$20, From $50, Free consultation"
            />
          </div>

          <div>
            <label className="label-field">Website / Shop / Booking Link</label>
            <input
              type="url"
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              className="input-field text-sm"
              placeholder="https://your-shop.com"
            />
          </div>

          <div>
            <label className="label-field">Contact Information</label>
            <input
              type="text"
              value={contactInfo}
              onChange={(e) => setContactInfo(e.target.value)}
              className="input-field text-sm"
              placeholder="Phone, email, or social handle"
            />
          </div>

          <div>
            <label className="label-field">Image URL (optional)</label>
            <input
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              className="input-field text-sm"
              placeholder="https://example.com/image.jpg"
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting || !name.trim()}
            className="btn-primary w-full text-sm py-2.5 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Save Changes
          </button>
        </div>
      </div>
    </Layout>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 text-sm text-empire-text-muted hover:text-empire-ivory transition-colors"
    >
      <ArrowLeft className="w-4 h-4" />
      Back
    </button>
  );
}

export default EditListingPage;
