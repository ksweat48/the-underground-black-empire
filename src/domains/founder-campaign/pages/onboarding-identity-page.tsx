import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Loader2 } from 'lucide-react';
import { OnboardingStep } from '@/shared/components/onboarding-step';
import { ProfilePhotoUploader } from '@/shared/components/profile-photo-uploader';
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

export function OnboardingIdentityPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const cityId = searchParams.get('city');
  const founderNumber = searchParams.get('number');

  const [ethnicSelected, setEthnicSelected] = useState<EthnicIdentityValue | null>('black_african_american');
  const [ethnicDetail, setEthnicDetail] = useState('');
  const [gender, setGender] = useState<GenderValue | null>(null);
  const [genderDetail, setGenderDetail] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [supportRole, setSupportRole] = useState<SupportRole | null>('supporter');
  const [supportRoleDetail, setSupportRoleDetail] = useState('');
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!avatarDataUrl) {
      setError('Please add a profile photo to continue.');
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

    if (supportRole && supportRole !== 'supporter' && !supportRoleDetail.trim()) {
      setError(`Please provide your ${supportRole === 'business_owner' ? 'business name' : supportRole === 'professional' ? 'profession' : 'organization or initiative name'}.`);
      return;
    }

    setSubmitting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setError('Your session has expired. Please sign in again.');
        navigate('/auth/sign-in');
        return;
      }

      // Upload avatar to storage
      const userId = sessionData.session.user.id;
      const blob = await (await fetch(avatarDataUrl)).blob();
      const { error: uploadError } = await supabase.storage
        .from('member-avatars')
        .upload(`${userId}/avatar.jpg`, blob, {
          contentType: 'image/jpeg',
          upsert: true,
        });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('member-avatars')
        .getPublicUrl(`${userId}/avatar.jpg`);
      const avatarUrl = `${urlData.publicUrl}?t=${Date.now()}`;

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
        p_support_role_detail: supportRole !== 'supporter' ? supportRoleDetail.trim() : null,
        p_avatar_url: avatarUrl,
      });
      if (profileError) throw profileError;

      navigate(`/onboarding/welcome?number=${founderNumber}&city=${cityId}`);
    } catch (err) {
      setError(parseSupabaseError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <OnboardingStep
      step={3}
      totalSteps={4}
      title="Who You Are"
      subtitle="Tell us about yourself and how you'll contribute to the Empire."
      onBack={() => navigate(`/onboarding/account?city=${cityId}`)}
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

        <SupportRoleSelector
          selected={supportRole}
          detail={supportRoleDetail}
          onSelect={(value) => {
            setSupportRole(value);
            setSupportRoleDetail('');
            setError(null);
          }}
          onDetailChange={setSupportRoleDetail}
          error={null}
        />

        {/* Profession autocomplete replaces the detail input when role is professional */}
        {supportRole === 'professional' && (
          <div className="animate-fade-up">
            <label htmlFor="profession" className="label-field">
              Profession <span className="text-crimson-400">*</span>
            </label>
            <ProfessionAutocomplete
              value={supportRoleDetail}
              onChange={setSupportRoleDetail}
              placeholder="Start typing your profession"
            />
          </div>
        )}

        {error && <p className="text-sm text-crimson-300 px-1">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              Continue
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>
    </OnboardingStep>
  );
}

export default OnboardingIdentityPage;
