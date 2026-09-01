import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarPlus, Loader2, Check } from 'lucide-react';
import { Layout } from '@/shared/components/layout';
import { cn } from '@/shared/cn';
import { useAuth } from '@/domains/identity/auth-context';
import {
  createMarketEvent,
  fetchMemberCityInfo,
  fetchApprovedListingsByOwner,
  type MarketListing,
} from '@/domains/market/services';

export function CreateEventPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';

  const [cityId, setCityId] = useState<string | null>(null);
  const [cityName, setCityName] = useState<string | null>(null);
  const [approvedListings, setApprovedListings] = useState<MarketListing[]>([]);
  const [selectedListing, setSelectedListing] = useState<string>('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [locationText, setLocationText] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    Promise.all([
      fetchMemberCityInfo(userId),
      fetchApprovedListingsByOwner(userId),
    ]).then(([info, listings]) => {
      setCityId(info.cityId);
      setCityName(info.cityName);
      setApprovedListings(listings);
    }).catch(() => {});
  }, [userId]);

  const handleSubmit = useCallback(async () => {
    if (!cityId || !name.trim() || !eventDate) {
      setError('Event name and date are required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createMarketEvent({
        city_id: cityId,
        listing_id: selectedListing || null,
        name: name.trim(),
        description: description.trim(),
        event_date: eventDate,
        event_time: eventTime.trim(),
        location_text: locationText.trim(),
        external_url: externalUrl.trim(),
        image_url: imageUrl.trim() || null,
      });
      navigate('/market');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create event.');
    } finally {
      setSubmitting(false);
    }
  }, [cityId, selectedListing, name, description, eventDate, eventTime, locationText, externalUrl, imageUrl, navigate]);

  if (!cityId) {
    return (
      <Layout fullWidth>
        <div className="max-w-[600px] mx-auto px-4 py-8">
          <BackButton onClick={() => navigate('/market')} />
          <div className="frame-utility p-8 text-center">
            <p className="text-sm text-empire-text-secondary">You need to select a city before creating an event.</p>
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
          <CalendarPlus className="w-5 h-5 text-empire-gold" />
          <h1 className="font-display text-lg font-bold text-empire-ivory">Create an Event</h1>
        </div>

        {error && (
          <div className="frame-utility p-3 border-empire-danger/20 bg-empire-danger/5">
            <p className="text-sm text-empire-danger">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          {/* Event name */}
          <div>
            <label className="label-field">Event Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field text-sm"
              placeholder="e.g. Community Farmers Market"
            />
          </div>

          {/* Date and time */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="label-field">Date *</label>
              <input
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="input-field text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="label-field">Time</label>
              <input
                type="time"
                value={eventTime}
                onChange={(e) => setEventTime(e.target.value)}
                className="input-field text-sm"
              />
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
              placeholder="Describe your event..."
            />
          </div>

          {/* Location */}
          <div>
            <label className="label-field">Location</label>
            <input
              type="text"
              value={locationText}
              onChange={(e) => setLocationText(e.target.value)}
              className="input-field text-sm"
              placeholder="e.g. Central Park, 123 Main St"
            />
          </div>

          {/* Link to business (optional) */}
          {approvedListings.length > 0 && (
            <div>
              <label className="label-field">Connect to Your Business (optional)</label>
              <div className="space-y-2">
                <button
                  onClick={() => setSelectedListing('')}
                  className={cn(
                    'w-full px-3 py-2.5 rounded-lg text-sm border transition-all text-left',
                    !selectedListing
                      ? 'bg-empire-gold/10 border-empire-gold/25 text-empire-gold'
                      : 'frame-utility text-empire-text-muted'
                  )}
                >
                  No connected business
                </button>
                {approvedListings.map((listing) => (
                  <button
                    key={listing.id}
                    onClick={() => setSelectedListing(listing.id)}
                    className={cn(
                      'w-full px-3 py-2.5 rounded-lg text-sm border transition-all text-left',
                      selectedListing === listing.id
                        ? 'bg-empire-gold/10 border-empire-gold/25 text-empire-gold'
                        : 'frame-utility text-empire-text-secondary'
                    )}
                  >
                    {listing.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* External URL */}
          <div>
            <label className="label-field">External Link (optional)</label>
            <input
              type="url"
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              className="input-field text-sm"
              placeholder="https://event-page.com"
            />
            <p className="text-[10px] text-empire-text-muted mt-1">
              Link to RSVP, ticket, or info page. Purchases happen externally.
            </p>
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
              Your event will be submitted for review and shown in{' '}
              <span className="font-medium text-empire-ivory">{cityName}</span>.
              Events support check-ins for verified community participation.
            </p>
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting || !name.trim() || !eventDate}
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

export default CreateEventPage;
