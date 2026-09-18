import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, HeartHandshake, Loader2, Check, Image as ImageIcon } from 'lucide-react';
import { Layout } from '@/shared/components/layout';
import { cn } from '@/shared/cn';
import { useAuth } from '@/domains/identity/auth-context';
import {
  createOrganization,
  fetchMemberCityInfo,
  type OrgType,
} from '@/domains/market/services';
import { ORG_TYPE_LABELS } from '@/domains/market/types';

const ORG_TYPES: { key: OrgType; label: string }[] = [
  { key: 'nonprofit', label: 'Nonprofit' },
  { key: 'community_organization', label: 'Community Organization' },
  { key: 'mission_based', label: 'Mission-Based Organization' },
  { key: 'initiative', label: 'Initiative' },
  { key: 'foundation', label: 'Foundation' },
  { key: 'other', label: 'Other' },
];

export function CreateOrganizationPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const userId = session?.user.id ?? '';

  const [cityId, setCityId] = useState<string | null>(null);
  const [cityName, setCityName] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [orgType, setOrgType] = useState<OrgType>('initiative');
  const [description, setDescription] = useState('');
  const [fundingGoal, setFundingGoal] = useState('');
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
      setError('Organization name and city are required.');
      return;
    }
    if (!description.trim()) {
      setError('Please describe your organization\'s mission.');
      return;
    }
    const goal = parseFloat(fundingGoal);
    if (isNaN(goal) || goal <= 0) {
      setError('Please enter a valid fundraising goal amount.');
      return;
    }
    if (!externalUrl.trim() && !contactInfo.trim()) {
      setError('Please provide either a website link or contact info.');
      return;
    }
    if (submittedRef.current || submitting) return;
    submittedRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const org = await createOrganization({
        city_id: cityId,
        name: name.trim(),
        org_type: orgType,
        description: description.trim(),
        funding_goal: goal,
        external_url: externalUrl.trim(),
        contact_info: contactInfo.trim(),
        image_url: imageUrl.trim() || null,
      });
      navigate(`/market/organization/${org.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create organization.');
      submittedRef.current = false;
    } finally {
      setSubmitting(false);
    }
  }, [cityId, name, orgType, description, fundingGoal, externalUrl, contactInfo, imageUrl, navigate, submitting]);

  if (!cityId) {
    return (
      <Layout fullWidth>
        <div className="max-w-[600px] mx-auto px-4 py-8">
          <BackButton onClick={() => navigate('/market')} />
          <div className="frame-utility p-8 text-center">
            <p className="text-sm text-empire-text-secondary">You need to select a city before listing an organization.</p>
          </div>
        </div>
      </Layout>
    );
  }

  const goalNum = parseFloat(fundingGoal) || 0;

  return (
    <Layout fullWidth>
      <div className="max-w-[600px] mx-auto px-4 py-4 space-y-4">
        <BackButton onClick={() => navigate('/market')} />

        <div className="flex items-center gap-2">
          <HeartHandshake className="w-5 h-5 text-empire-gold" />
          <h1 className="font-display text-lg font-bold text-empire-ivory">List an Organization</h1>
        </div>

        {error && (
          <div className="frame-utility p-3 border-empire-danger/20 bg-empire-danger/5">
            <p className="text-sm text-empire-danger">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          {/* Organization name */}
          <div>
            <label className="label-field">Organization Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field text-sm"
              placeholder="e.g. Community Youth Initiative"
            />
          </div>

          {/* Organization type */}
          <div>
            <label className="label-field">Organization Type *</label>
            <div className="grid grid-cols-2 gap-2">
              {ORG_TYPES.map((type) => (
                <button
                  key={type.key}
                  onClick={() => setOrgType(type.key)}
                  className={cn(
                    'px-3 py-2.5 rounded-lg text-sm font-medium border transition-all text-left',
                    orgType === type.key
                      ? 'bg-plum-500/10 border-plum-500/25 text-plum-400'
                      : 'frame-utility text-empire-text-muted'
                  )}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          {/* Mission description */}
          <div>
            <label className="label-field">Mission / Description *</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="input-field text-sm resize-none"
              placeholder="Describe your organization's mission, who it serves, and what it aims to achieve..."
            />
          </div>

          {/* Funding goal */}
          <div>
            <label className="label-field">Fundraising Goal (USD) *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-empire-text-muted">$</span>
              <input
                type="number"
                min="0"
                step="100"
                value={fundingGoal}
                onChange={(e) => setFundingGoal(e.target.value)}
                className="input-field text-sm pl-7"
                placeholder="10000"
              />
            </div>
            <p className="text-[10px] text-empire-text-muted mt-1">
              Set a projected target. Organizations can raise more through community voting and can appear in multiple voting rounds.
            </p>
          </div>

          {/* External URL */}
          <div>
            <label className="label-field">Website / Donation Link</label>
            <input
              type="url"
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              className="input-field text-sm"
              placeholder="https://your-organization.org"
            />
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
            <p className="text-[10px] text-empire-text-muted mt-1">
              Provide either a website link or contact info so members can reach you.
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

          {/* City info */}
          <div className="frame-utility p-3">
            <p className="text-xs text-empire-text-muted">
              Organization will be published immediately in <span className="font-medium text-empire-ivory">{cityName}</span>
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
              disabled={submitting || !name.trim() || !description.trim()}
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
                  <span className="badge-gold text-[9px] py-0.5 px-1.5">{ORG_TYPE_LABELS[orgType]}</span>
                </div>
              </div>
              <div className="p-3 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-sm font-semibold text-empire-ivory">{name || 'Organization Name'}</h3>
                  {goalNum > 0 && (
                    <span className="text-xs font-semibold text-empire-gold">${goalNum.toLocaleString()}</span>
                  )}
                </div>
                <p className="text-xs text-empire-text-muted line-clamp-2">{description || 'No description yet.'}</p>
                <div className="pt-1.5">
                  <div className="flex items-center justify-between text-[10px] text-empire-text-muted mb-1">
                    <span>Raised</span>
                    <span>$0 of ${goalNum.toLocaleString()}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-ink-700/30 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400" style={{ width: '0%' }} />
                  </div>
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

export default CreateOrganizationPage;
