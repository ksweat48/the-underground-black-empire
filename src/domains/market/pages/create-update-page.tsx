import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MessageSquarePlus, Loader2, Check, AlertCircle } from 'lucide-react';
import { Layout } from '@/shared/components/layout';
import { cn } from '@/shared/cn';
import { useAuth } from '@/domains/identity/auth-context';
import {
  fetchApprovedListingsByOwner,
  createListingUpdate,
  type MarketListing,
} from '@/domains/market/services';

export function CreateUpdatePage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';

  const [approvedListings, setApprovedListings] = useState<MarketListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedListing, setSelectedListing] = useState<string>('');
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    fetchApprovedListingsByOwner(userId)
      .then((listings) => {
        setApprovedListings(listings);
        if (listings.length > 0) setSelectedListing(listings[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  const handleSubmit = useCallback(async () => {
    if (!selectedListing || !body.trim()) {
      setError('Please select a listing and write your update.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createListingUpdate({
        listing_id: selectedListing,
        body: body.trim(),
        image_url: imageUrl.trim() || null,
      });
      navigate('/market');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post update.');
    } finally {
      setSubmitting(false);
    }
  }, [selectedListing, body, imageUrl, navigate]);

  if (loading) {
    return (
      <Layout fullWidth>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-empire-text-muted animate-spin" />
        </div>
      </Layout>
    );
  }

  if (approvedListings.length === 0) {
    return (
      <Layout fullWidth>
        <div className="max-w-[600px] mx-auto px-4 py-8 space-y-4">
          <BackButton onClick={() => navigate('/market')} />
          <div className="frame-utility p-8 text-center">
            <AlertCircle className="w-8 h-8 text-empire-text-muted mx-auto mb-3" />
            <p className="text-sm font-medium text-empire-text-secondary mb-1">
              You need an approved listing before posting an update.
            </p>
            <p className="text-xs text-empire-text-muted mb-4">
              Create a business listing and get it approved first.
            </p>
            <button onClick={() => navigate('/market/create/listing')} className="btn-secondary text-sm">
              List a Business
            </button>
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
          <MessageSquarePlus className="w-5 h-5 text-empire-gold" />
          <h1 className="font-display text-lg font-bold text-empire-ivory">Post an Update</h1>
        </div>

        {error && (
          <div className="frame-utility p-3 border-empire-danger/20 bg-empire-danger/5">
            <p className="text-sm text-empire-danger">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          {/* Select listing */}
          <div>
            <label className="label-field">Select Your Approved Business *</label>
            <div className="space-y-2">
              {approvedListings.map((listing) => (
                <button
                  key={listing.id}
                  onClick={() => setSelectedListing(listing.id)}
                  className={cn(
                    'w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm border transition-all',
                    selectedListing === listing.id
                      ? 'bg-empire-gold/10 border-empire-gold/25 text-empire-gold'
                      : 'frame-utility text-empire-text-secondary'
                  )}
                >
                  <span className="font-medium">{listing.name}</span>
                  <span className="text-[10px] uppercase tracking-wider capitalize">{listing.category}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Update body */}
          <div>
            <label className="label-field">Your Update *</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              className="input-field text-sm resize-none"
              placeholder="Share an announcement, special offer, or news from your business..."
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

          <div className="frame-utility p-3">
            <p className="text-xs text-empire-text-muted">
              Your update will be submitted for review and linked to your business listing.
            </p>
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={submitting || !body.trim() || !selectedListing}
            className="btn-primary w-full text-sm py-2.5 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Submit for Review
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

export default CreateUpdatePage;
