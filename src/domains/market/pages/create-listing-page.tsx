import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, Loader2, Check, Image as ImageIcon } from 'lucide-react';
import { Layout } from '@/shared/components/layout';
import { cn } from '@/shared/cn';
import { useAuth } from '@/domains/identity/auth-context';
import { createListing, fetchMemberCityInfo, type ListingCategory } from '@/domains/market/services';

const CATEGORIES: { key: ListingCategory; label: string }[] = [
  { key: 'products', label: 'Products' },
  { key: 'services', label: 'Services' },
];

export function CreateListingPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';

  const [cityId, setCityId] = useState<string | null>(null);
  const [cityName, setCityName] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ListingCategory>('services');
  const [description, setDescription] = useState('');
  const [productsServices, setProductsServices] = useState('');
  const [priceDisplay, setPriceDisplay] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (!userId) return;
    fetchMemberCityInfo(userId).then((info) => {
      setCityId(info.cityId);
      setCityName(info.cityName);
    }).catch(() => {});
  }, [userId]);

  const handleSubmit = useCallback(async () => {
    if (!cityId || !name.trim()) {
      setError('Business name and city are required.');
      return;
    }
    if (submittedRef.current || submitting) return;
    submittedRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await createListing({
        city_id: cityId,
        name: name.trim(),
        category,
        description: description.trim(),
        products_services: productsServices.trim(),
        price_display: priceDisplay.trim(),
        external_url: externalUrl.trim(),
        contact_info: contactInfo.trim(),
        image_url: imageUrl.trim() || null,
      });
      navigate('/market');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create listing.');
      submittedRef.current = false;
    } finally {
      setSubmitting(false);
    }
  }, [cityId, name, category, description, productsServices, priceDisplay, externalUrl, contactInfo, imageUrl, navigate]);

  if (!cityId) {
    return (
      <Layout fullWidth>
        <div className="max-w-[600px] mx-auto px-4 py-8">
          <BackButton onClick={() => navigate('/market')} />
          <div className="frame-utility p-8 text-center">
            <p className="text-sm text-empire-text-secondary">You need to select a city before listing a business.</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout fullWidth>
      <div className="max-w-[600px] mx-auto px-4 py-4 space-y-4">
        <BackButton onClick={() => navigate('/market')} />

        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-empire-gold" />
          <h1 className="font-display text-lg font-bold text-empire-ivory">List a Business</h1>
        </div>

        {error && (
          <div className="frame-utility p-3 border-empire-danger/20 bg-empire-danger/5">
            <p className="text-sm text-empire-danger">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          {/* Business name */}
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

          {/* Category */}
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

          {/* Description */}
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

          {/* Products & Services */}
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

          {/* Price display */}
          <div>
            <label className="label-field">Price Display</label>
            <input
              type="text"
              value={priceDisplay}
              onChange={(e) => setPriceDisplay(e.target.value)}
              className="input-field text-sm"
              placeholder="e.g. $5-$20, From $50, Free consultation"
            />
            <p className="text-[10px] text-empire-text-muted mt-1">
              Show price ranges or starting prices. All purchases happen through your external link.
            </p>
          </div>

          {/* External URL */}
          <div>
            <label className="label-field">Website / Shop / Booking Link</label>
            <input
              type="url"
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              className="input-field text-sm"
              placeholder="https://your-shop.com"
            />
            <p className="text-[10px] text-empire-text-muted mt-1">
              This is where customers will go to purchase, book, or contact you directly.
            </p>
          </div>

          {/* Contact info */}
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

          {/* Image URL */}
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

          {/* City info */}
          <div className="frame-utility p-3">
            <p className="text-xs text-empire-text-muted">
              Listing will be published immediately in <span className="font-medium text-empire-ivory">{cityName}</span>
              with an "In Review" badge until an admin verifies it.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="btn-secondary flex-1 text-sm py-2.5"
            >
              {showPreview ? 'Hide Preview' : 'Preview'}
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !name.trim()}
              className="btn-primary flex-1 text-sm py-2.5 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Submit for Review
            </button>
          </div>
        </div>

        {/* Preview */}
        {showPreview && (
          <div className="animate-fade-up">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-empire-text-muted mb-2">Preview</p>
            <div className="frame-intel p-0 overflow-hidden">
              <div className="relative h-32 overflow-hidden bg-ink-800/10">
                {imageUrl ? (
                  <img src={imageUrl} alt={name} className="w-full h-full object-cover" />
                ) : (
                  <div className="flex items-center justify-center w-full h-full">
                    <ImageIcon className="w-8 h-8 text-empire-text-muted/30" />
                  </div>
                )}
                <div className="absolute bottom-2 left-2">
                  <span className="badge-gold text-[9px] py-0.5 px-1.5 capitalize">{category}</span>
                </div>
              </div>
              <div className="p-3 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-sm font-semibold text-empire-ivory">{name || 'Business Name'}</h3>
                  {priceDisplay && (
                    <span className="text-xs font-semibold text-empire-gold">{priceDisplay}</span>
                  )}
                </div>
                <p className="text-xs text-empire-text-muted line-clamp-2">{description || 'No description yet.'}</p>
                <div className="flex items-center gap-1 text-[10px] text-empire-text-muted">
                  <MapPin className="w-2.5 h-2.5" />
                  {cityName}
                </div>
              </div>
            </div>
          </div>
        )}
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

function MapPin({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

export default CreateListingPage;
