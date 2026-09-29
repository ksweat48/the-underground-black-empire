import { useState, useRef, type FormEvent, useEffect } from 'react';

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Loader2, Store, Building2 } from 'lucide-react';
import { OnboardingStep } from '@/shared/components/onboarding-step';
import { ProfilePhotoUploader } from '@/shared/components/profile-photo-uploader';
import { ListingImageUploader } from '@/shared/components/listing-image-uploader';
import { useAuth } from '@/domains/identity/auth-context';
import {
  EthnicIdentitySelector,
  type EthnicIdentityValue,
} from '@/shared/components/ethnic-identity-selector';
import {
  GenderSelector,
  type GenderValue,
} from '@/shared/components/gender-selector';
import {
  SupportRoleSelector,
  type SupportRole,
} from '@/shared/components/support-role-selector';
import { ProfessionAutocomplete } from '@/shared/components/profession-autocomplete';
import { supabase } from '@/shared/supabase-client';
import { parseSupabaseError } from '@/shared/errors';
import { createListing, createOrganization } from '@/domains/market/services';
import type { ListingCategory, OrgType } from '@/domains/market/types';

const BUSINESS_CATEGORIES: { key: ListingCategory; label: string }[] = [
  { key: 'products', label: 'Products' },
  { key: 'services', label: 'Services' },
];

const ORG_TYPE_OPTIONS: { label: string; value: OrgType }[] = [
  { label: 'Nonprofit', value: 'nonprofit' },
  { label: 'Community Organization', value: 'community_organization' },
  { label: 'Mission-Based Organization', value: 'mission_based' },
  { label: 'Initiative', value: 'initiative' },
  { label: 'Foundation', value: 'foundation' },
  { label: 'Other', value: 'other' },
];

interface ListingFormData {
  name: string;
  category: ListingCategory;
  description: string;
  price_display: string;
  external_url: string;
  contact_info: string;
}

export function OnboardingIdentityPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cityId = searchParams.get('city');
  const founderNumber = searchParams.get('number');
  const { session, memberState } = useAuth();
  const isReturning = Boolean(session && memberState?.hasMemberRecord);

  useEffect(() => {
    if (isReturning && memberState?.cityId && memberState.founderNumber && (!cityId || !founderNumber)) {
      navigate(`/onboarding/identity?number=${memberState.founderNumber}&city=${memberState.cityId}`, { replace: true });
    }
  }, [isReturning, memberState, cityId, founderNumber, navigate]);

  const [ethnicSelected, setEthnicSelected] = useState<EthnicIdentityValue | null>('black_african_american');
  const [ethnicDetail, setEthnicDetail] = useState('');
  const [gender, setGender] = useState<GenderValue | null>(null);
  const [genderDetail, setGenderDetail] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [supportRole, setSupportRole] = useState<SupportRole | null>('supporter');
  const [occupation, setOccupation] = useState('');
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);
  const [listingImageDataUrl, setListingImageDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);

  const [listingData, setListingData] = useState<ListingFormData>({
    name: '',
    category: 'services',
    description: '',
    price_display: '',
    external_url: '',
    contact_info: '',
  });
  const [orgType, setOrgType] = useState<string>('');
  const [fundingGoal, setFundingGoal] = useState('');

  const needsListing = supportRole && supportRole !== 'supporter';

  const updateListingField = (field: keyof ListingFormData, value: string) => {
    setListingData((prev) => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!avatarDataUrl) {
      setError('Please add your personal profile photo to continue.');
      return;
    }

    if (!ethnicSelected) {
      setError('Please select your race / ethnic identity.');
      return;
    }

    if (ethnicSelected === 'another' && !ethnicDetail.trim()) {
      setError('Please describe your race / ethnic identity.');
      return;
    }

    if (!gender) {
      setError('Please select your gender.');
      return;
    }

    if (!dateOfBirth) {
      setError('Please enter your date of birth.');
      return;
    }

    const dob = new Date(dateOfBirth);
    if (isNaN(dob.getTime()) || dob > new Date()) {
      setError('Please enter a valid date of birth.');
      return;
    }

    // Validate listing form for non-supporters
    if (needsListing) {
      if (!listingData.name.trim()) {
        const label = supportRole === 'business_owner'
          ? 'business name'
          : 'organization name';
        setError(`Please enter your ${label}.`);
        return;
      }
      if (supportRole === 'organization' && !listingData.description.trim()) {
        setError('Please describe your organization\'s mission.');
        return;
      }
      if (!listingData.external_url.trim() && !listingData.contact_info.trim()) {
        setError('Please provide either a website link or contact info so customers can reach you.');
        return;
      }
    }

    if (submittedRef.current || submitting) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setError('Your session has expired. Please sign in again.');
        navigate('/auth/sign-in');
        return;
      }

      const userId = sessionData.session.user.id;

      // Upload profile photo
      const avatarBlob = await (await fetch(avatarDataUrl)).blob();
      const { error: uploadError } = await supabase.storage
        .from('member-avatars')
        .upload(`${userId}/avatar.jpg`, avatarBlob, {
          contentType: 'image/jpeg',
          upsert: true,
        });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('member-avatars')
        .getPublicUrl(`${userId}/avatar.jpg`);
      const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      // Upload listing image if provided
      let listingImageUrl: string | null = null;
      if (needsListing && listingImageDataUrl) {
        const listingBlob = await (await fetch(listingImageDataUrl)).blob();
        const ext = listingBlob.type.includes('png') ? 'png' : 'jpg';
        const listingPath = `${userId}/listing-${Date.now()}.${ext}`;
        const { error: listingUploadError } = await supabase.storage
          .from('listing-images')
          .upload(listingPath, listingBlob, {
            contentType: listingBlob.type,
            upsert: false,
          });
        if (listingUploadError) throw listingUploadError;

        const { data: listingUrlData } = supabase.storage
          .from('listing-images')
          .getPublicUrl(listingPath);
        listingImageUrl = listingUrlData.publicUrl;
      }

      const { error: ethnicError } = await supabase.rpc('update_ethnic_identity', {
        p_ethnic_identity: ethnicSelected,
        p_ethnic_identity_detail: ethnicSelected === 'another' ? ethnicDetail.trim() : null,
      });
      if (ethnicError) throw ethnicError;

      const { error: genderError } = await supabase.rpc('update_gender', {
        p_gender: gender,
        p_gender_detail: gender === 'other' ? genderDetail.trim() : null,
      });
      if (genderError) throw genderError;

      const { error: profileError } = await supabase.rpc('update_member_profile', {
        p_date_of_birth: dateOfBirth,
        p_support_role: supportRole,
        p_support_role_detail: supportRole !== 'supporter' ? listingData.name.trim() : null,
        p_avatar_url: avatarUrl,
        p_occupation: occupation.trim() || null,
      });
      if (profileError) throw profileError;

      // Create marketplace listing for non-supporters
      let listingIdParam = '';
      if (needsListing && cityId) {
        try {
          if (supportRole === 'organization') {
            const fundingGoalNum = parseInt(fundingGoal.replace(/[^0-9]/g, ''), 10) || 0;
            const org = await createOrganization({
              city_id: cityId,
              name: listingData.name.trim(),
              org_type: (orgType || 'community_organization') as OrgType,
              description: listingData.description.trim(),
              funding_goal: fundingGoalNum,
              external_url: normalizeUrl(listingData.external_url),
              contact_info: listingData.contact_info.trim(),
              image_url: listingImageUrl,
            });
            listingIdParam = `&listing=${org.id}`;
          } else {
            const listing = await createListing({
              city_id: cityId,
              name: listingData.name.trim(),
              category: listingData.category,
              description: listingData.description.trim(),
              products_services: '',
              price_display: listingData.price_display.trim(),
              external_url: normalizeUrl(listingData.external_url),
              contact_info: listingData.contact_info.trim(),
              image_url: listingImageUrl,
              status: 'in_review',
            });
            listingIdParam = `&listing=${listing.id}`;
          }
        } catch {
          // Listing creation failure should not block onboarding
        }
      }

      navigate(`/onboarding/welcome?number=${founderNumber}&city=${cityId}${listingIdParam}`);
    } catch (err) {
      setError(parseSupabaseError(err));
      submittedRef.current = false;
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <OnboardingStep
      step={4}
      totalSteps={5}
      title="Who You Are"
      subtitle="Tell us about yourself and how you'll contribute to the Empire."
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Profile Photo */}
        <div className="flex flex-col items-center pt-1 pb-2">
          <label className="label-field mb-3">
            Profile Photo <span className="text-crimson-400">*</span>
          </label>
          <ProfilePhotoUploader onPhotoReady={setAvatarDataUrl} />
        </div>

        <EthnicIdentitySelector
          selected={ethnicSelected}
          detail={ethnicDetail}
          onSelect={(value) => {
            setEthnicSelected(value);
            setError(null);
          }}
          onDetailChange={setEthnicDetail}
          error={null}
        />

        <GenderSelector
          selected={gender}
          detail={genderDetail}
          onSelect={(value) => {
            setGender(value);
            setError(null);
          }}
          onDetailChange={setGenderDetail}
        />

        {/* Date of Birth */}
        <div>
          <label htmlFor="dob" className="label-field">
            Date of Birth <span className="text-crimson-400">*</span>
          </label>
          <input
            id="dob"
            type="date"
            value={dateOfBirth}
            onChange={(e) => {
              setDateOfBirth(e.target.value);
              setError(null);
            }}
            max={new Date().toISOString().split('T')[0]}
            className="input-field cursor-pointer"
          />
          <p className="text-xs text-ink-500 mt-1 px-1">This stays private — used only for age demographics.</p>
        </div>

        {/* Occupation */}
        <div>
          <label htmlFor="occupation" className="label-field">
            Occupation <span className="text-ink-500">(optional)</span>
          </label>
          <ProfessionAutocomplete
            value={occupation}
            onChange={setOccupation}
            placeholder="Start typing your occupation"
          />
          <p className="text-xs text-ink-500 mt-1 px-1">Your occupation is separate from your role in the Empire.</p>
        </div>

        <SupportRoleSelector
          selected={supportRole}
          detail=""
          onSelect={(value) => {
            setSupportRole(value);
            setError(null);
            if (value !== 'supporter') {
              setListingData((prev) => ({ ...prev, name: '' }));
            }
          }}
          onDetailChange={() => {}}
          error={null}
        />

        {/* =================== Business Owner Listing =================== */}
        {supportRole === 'business_owner' && (
          <div className="animate-fade-up space-y-4 pt-2 border-t border-ink-800/50">
            <div className="flex items-center gap-2 pt-2">
              <Store className="w-4 h-4 text-gold-400" />
              <h3 className="font-display text-sm font-semibold text-ink-100">
                Your Business Listing
              </h3>
            </div>
            <p className="text-xs text-ink-400 -mt-2">
              Your business will appear in the Marketplace immediately with an "In Review" badge until an admin verifies it.
            </p>

            <div>
              <label className="label-field">Business Name <span className="text-crimson-400">*</span></label>
              <input
                type="text"
                value={listingData.name}
                onChange={(e) => updateListingField('name', e.target.value)}
                className="input-field text-sm"
                placeholder="e.g. Big Fresh Produce"
                maxLength={100}
              />
            </div>

            <div>
              <label className="label-field">What do you provide?</label>
              <div className="flex gap-2">
                {BUSINESS_CATEGORIES.map((cat) => (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => updateListingField('category', cat.key)}
                    className={`flex-1 px-3 py-2.5 rounded-lg text-sm font-medium border transition-all ${
                      listingData.category === cat.key
                        ? 'bg-gold-500/10 border-gold-500/25 text-gold-300'
                        : 'bg-ink-900/50 border-ink-700/50 text-ink-400'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="label-field">About Your Business</label>
              <textarea
                value={listingData.description}
                onChange={(e) => updateListingField('description', e.target.value)}
                rows={2}
                className="input-field text-sm resize-none"
                placeholder="A short description of your business..."
              />
            </div>

            <div>
              <label className="label-field">Typical Price Range <span className="text-ink-500">(optional)</span></label>
              <input
                type="text"
                value={listingData.price_display}
                onChange={(e) => updateListingField('price_display', e.target.value)}
                className="input-field text-sm"
                placeholder="e.g. $99 - $299, From $50"
              />
            </div>

            <div>
              <label className="label-field">Website or Booking Link <span className="text-ink-500">(website or contact required)</span></label>
              <input
                type="text"
                value={listingData.external_url}
                onChange={(e) => updateListingField('external_url', e.target.value)}
                className="input-field text-sm"
                placeholder="www.your-website.com"
              />
              <p className="text-[10px] text-ink-500 mt-1">https:// is added automatically.</p>
            </div>

            <div>
              <label className="label-field">Contact Info <span className="text-ink-500">(website or contact required)</span></label>
              <input
                type="text"
                value={listingData.contact_info}
                onChange={(e) => updateListingField('contact_info', e.target.value)}
                className="input-field text-sm"
                placeholder="Phone, email, or social handle"
              />
            </div>

            <div>
              <label className="label-field">Business Photo / Logo <span className="text-ink-500">(optional)</span></label>
              <ListingImageUploader onImageReady={setListingImageDataUrl} />
            </div>
          </div>
        )}

        {/* =================== Organization Listing =================== */}
        {supportRole === 'organization' && (
          <div className="animate-fade-up space-y-4 pt-2 border-t border-ink-800/50">
            <div className="flex items-center gap-2 pt-2">
              <Building2 className="w-4 h-4 text-gold-400" />
              <h3 className="font-display text-sm font-semibold text-ink-100">
                Your Organization Listing
              </h3>
            </div>
            <p className="text-xs text-ink-400 -mt-2">
              Your organization will appear in the Marketplace immediately with an "In Review" badge until an admin verifies it.
            </p>

            <div>
              <label className="label-field">Organization Name <span className="text-crimson-400">*</span></label>
              <input
                type="text"
                value={listingData.name}
                onChange={(e) => updateListingField('name', e.target.value)}
                className="input-field text-sm"
                placeholder="e.g. Atlanta Farmers Alliance"
                maxLength={100}
              />
            </div>

            <div>
              <label className="label-field">Organization Type</label>
              <select
                value={orgType}
                onChange={(e) => setOrgType(e.target.value)}
                className="input-field text-sm cursor-pointer"
              >
                <option value="">Select type...</option>
                {ORG_TYPE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label-field">Mission Statement <span className="text-crimson-400">*</span></label>
              <textarea
                value={listingData.description}
                onChange={(e) => updateListingField('description', e.target.value)}
                rows={2}
                className="input-field text-sm resize-none"
                placeholder="Describe your organization's mission..."
              />
            </div>

            <div>
              <label className="label-field">Funding Goal <span className="text-ink-500">(optional)</span></label>
              <input
                type="text"
                value={fundingGoal}
                onChange={(e) => setFundingGoal(e.target.value)}
                className="input-field text-sm"
                placeholder="e.g. $5,000 - $25,000"
              />
              <p className="text-[10px] text-ink-500 mt-1">
                Let the community know your funding target, if applicable.
              </p>
            </div>

            <div>
              <label className="label-field">Website <span className="text-ink-500">(website or contact required)</span></label>
              <input
                type="text"
                value={listingData.external_url}
                onChange={(e) => updateListingField('external_url', e.target.value)}
                className="input-field text-sm"
                placeholder="www.your-organization.org"
              />
              <p className="text-[10px] text-ink-500 mt-1">https:// is added automatically.</p>
            </div>

            <div>
              <label className="label-field">Contact Info <span className="text-ink-500">(website or contact required)</span></label>
              <input
                type="text"
                value={listingData.contact_info}
                onChange={(e) => updateListingField('contact_info', e.target.value)}
                className="input-field text-sm"
                placeholder="Phone, email, or social handle"
              />
            </div>

            <div>
              <label className="label-field">Organization Photo / Logo <span className="text-ink-500">(optional)</span></label>
              <ListingImageUploader onImageReady={setListingImageDataUrl} />
            </div>
          </div>
        )}

        {error && <p className="text-sm text-crimson-300 px-1">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          onDoubleClick={(e) => e.preventDefault()}
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              {needsListing ? (
                <>
                  {supportRole === 'business_owner' && 'Create My Business Listing'}
                  {supportRole === 'organization' && 'Create Organization Listing'}
                  <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </>
          )}
        </button>
      </form>
    </OnboardingStep>
  );
}

export default OnboardingIdentityPage;
