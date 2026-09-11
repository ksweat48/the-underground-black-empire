import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, MessageSquarePlus, Loader2, Check, AlertCircle, Tag, TrendingUp, Megaphone } from 'lucide-react';
import { Layout } from '@/shared/components/layout';
import { ListingImageUploader } from '@/shared/components/listing-image-uploader';
import { cn } from '@/shared/cn';
import { useAuth } from '@/domains/identity/auth-context';
import { supabase } from '@/shared/supabase-client';
import {
  fetchApprovedListingsByOwner,
  createListingUpdate,
  type MarketListing,
  type UpdateType,
} from '@/domains/market/services';

const MIN_CHARS = 50;
const MAX_CHARS = 280;

const UPDATE_TYPES: { key: UpdateType; label: string; description: string; icon: typeof Tag }[] = [
  { key: 'offer', label: 'Special Offer', description: 'Promotion, discount, or deal', icon: Tag },
  { key: 'update', label: 'Business Update', description: '', icon: Megaphone },
  { key: 'progress', label: 'Progress', description: 'Milestone or achievement', icon: TrendingUp },
];

export function CreateUpdatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preselectedListing = searchParams.get('listing');
  const { session } = useAuth();
  const userId = session?.user.id ?? '';

  const [approvedListings, setApprovedListings] = useState<MarketListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedListing, setSelectedListing] = useState<string>('');
  const [updateType, setUpdateType] = useState<UpdateType>('update');
  const [body, setBody] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (!userId) return;
    fetchApprovedListingsByOwner(userId)
      .then((listings) => {
        setApprovedListings(listings);
        if (listings.length > 0) {
          if (preselectedListing && listings.some((l) => l.id === preselectedListing)) {
            setSelectedListing(preselectedListing);
          } else {
            setSelectedListing(listings[0].id);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId, preselectedListing]);

  const charCount = body.length;
  const charColor = charCount < MIN_CHARS ? 'text-empire-text-muted' : charCount > MAX_CHARS ? 'text-empire-danger' : charCount > 220 ? 'text-amber-400' : 'text-emerald-400';
  const canSubmit = charCount >= MIN_CHARS && charCount <= MAX_CHARS && !!selectedListing && !submitting;

  const handleSubmit = useCallback(async () => {
    if (submittedRef.current || submitting) return;
    if (!selectedListing || !canSubmit) {
      if (charCount < MIN_CHARS) {
        setError(`Your post needs at least ${MIN_CHARS} characters. You have ${charCount}.`);
        return;
      }
      if (charCount > MAX_CHARS) {
        setError(`Your post cannot exceed ${MAX_CHARS} characters. You have ${charCount}.`);
        return;
      }
      if (!selectedListing) {
        setError('Please select a business to post for.');
        return;
      }
      return;
    }
    submittedRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      let imageUrl: string | null = null;

      if (imageDataUrl) {
        const blob = await (await fetch(imageDataUrl)).blob();
        const fileName = `${userId}/update-${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('listing-images')
          .upload(fileName, blob, { contentType: 'image/jpeg', upsert: false });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage
          .from('listing-images')
          .getPublicUrl(fileName);
        imageUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      }

      await createListingUpdate({
        listing_id: selectedListing,
        body: body.trim(),
        image_url: imageUrl,
        update_type: updateType,
      });
      navigate('/market');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post update.');
      submittedRef.current = false;
    } finally {
      setSubmitting(false);
    }
  }, [selectedListing, body, imageDataUrl, updateType, canSubmit, charCount, userId, navigate, submitting]);

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
          <h1 className="font-display text-lg font-bold text-empire-ivory">Share an Offer or Update</h1>
        </div>

        {error && (
          <div className="frame-utility p-3 border-empire-danger/20 bg-empire-danger/5">
            <p className="text-sm text-empire-danger">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          {/* Post type selector */}
          <div>
            <label className="label-field">Post Type *</label>
            <div className="grid grid-cols-3 gap-2">
              {UPDATE_TYPES.map((type) => {
                const Icon = type.icon;
                return (
                  <button
                    key={type.key}
                    onClick={() => setUpdateType(type.key)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all',
                      updateType === type.key
                        ? 'bg-empire-gold/10 border-empire-gold/25 text-empire-gold'
                        : 'frame-utility text-empire-text-muted hover:text-empire-ivory'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-[11px] font-medium text-center leading-tight">{type.label}</span>
                  </button>
                );
              })}
            </div>
            {UPDATE_TYPES.find((t) => t.key === updateType)?.description && (
              <p className="text-[10px] text-empire-text-muted mt-1.5">
                {UPDATE_TYPES.find((t) => t.key === updateType)?.description}
              </p>
            )}
          </div>

          {/* Select listing */}
          <div>
            <label className="label-field">Select Your Business *</label>
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

          {/* Update body with character counter */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="label-field mb-0">Your Post *</label>
              <span className={cn('text-xs font-semibold tabular-nums', charColor)}>
                {charCount} / {MAX_CHARS}
              </span>
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              maxLength={MAX_CHARS + 20}
              className="input-field text-sm resize-none"
              placeholder={`Write your ${UPDATE_TYPES.find((t) => t.key === updateType)?.label.toLowerCase() ?? 'post'}...`}
            />
          </div>

          {/* Image upload */}
          <div>
            <label className="label-field">Image (optional)</label>
            <ListingImageUploader onImageReady={setImageDataUrl} />
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
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
