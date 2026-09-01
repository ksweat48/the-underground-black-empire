import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Newspaper, Loader2, Check } from 'lucide-react';
import { Layout } from '@/shared/components/layout';
import { useAuth } from '@/domains/identity/auth-context';
import { createLocalNews, fetchMemberCityInfo } from '@/domains/market/services';

export function CreateNewsPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';

  const [cityId, setCityId] = useState<string | null>(null);
  const [cityName, setCityName] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [locationText, setLocationText] = useState('');
  const [newsDate, setNewsDate] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    fetchMemberCityInfo(userId).then((info) => {
      setCityId(info.cityId);
      setCityName(info.cityName);
    }).catch(() => {});
  }, [userId]);

  const handleSubmit = useCallback(async () => {
    if (!cityId || !title.trim() || !body.trim()) {
      setError('Title and description are required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createLocalNews({
        city_id: cityId,
        title: title.trim(),
        body: body.trim(),
        location_text: locationText.trim(),
        news_date: newsDate || null,
        image_url: imageUrl.trim() || null,
      });
      navigate('/market');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit news.');
    } finally {
      setSubmitting(false);
    }
  }, [cityId, title, body, locationText, newsDate, imageUrl, navigate]);

  if (!cityId) {
    return (
      <Layout fullWidth>
        <div className="max-w-[600px] mx-auto px-4 py-8">
          <BackButton onClick={() => navigate('/market')} />
          <div className="frame-utility p-8 text-center">
            <p className="text-sm text-empire-text-secondary">You need to select a city before posting local news.</p>
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
          <Newspaper className="w-5 h-5 text-empire-gold" />
          <h1 className="font-display text-lg font-bold text-empire-ivory">Post Local News</h1>
        </div>

        {error && (
          <div className="frame-utility p-3 border-empire-danger/20 bg-empire-danger/5">
            <p className="text-sm text-empire-danger">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="label-field">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input-field text-sm"
              placeholder="e.g. New Community Garden Opening Downtown"
            />
          </div>

          <div>
            <label className="label-field">Description *</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              className="input-field text-sm resize-none"
              placeholder="Share what's happening in your city..."
            />
          </div>

          <div>
            <label className="label-field">Location (optional)</label>
            <input
              type="text"
              value={locationText}
              onChange={(e) => setLocationText(e.target.value)}
              className="input-field text-sm"
              placeholder="e.g. Downtown, Main Street area"
            />
          </div>

          <div>
            <label className="label-field">Date (optional)</label>
            <input
              type="date"
              value={newsDate}
              onChange={(e) => setNewsDate(e.target.value)}
              className="input-field text-sm"
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

          <div className="frame-utility p-3">
            <p className="text-xs text-empire-text-muted">
              Your news will be submitted for review and shared with the community in{' '}
              <span className="font-medium text-empire-ivory">{cityName}</span>.
            </p>
          </div>

          <button
            onClick={handleSubmit}
            disabled={submitting || !title.trim() || !body.trim()}
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

export default CreateNewsPage;
