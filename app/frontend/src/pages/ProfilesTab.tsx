import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProfiles, type Gender, type ActivityLevel, type Goal, type PartnerProfile } from '../hooks/useProfiles';
import { useDietList } from '../hooks/useDietInfo';
import { DIET_CATEGORIES, type DietCatalogEntry } from '../types/diet';
import { useAuthStore } from '../stores/authStore';
import { linkWithPartner } from '../hooks/useAuth';
import UpgradeSection from '../components/UpgradeSection';
import DietBrowser from '../components/DietBrowser';
import { ActivityLogSection } from '../components/ActivityLogSection';

const GENDERS: readonly Gender[] = ['male', 'female', 'other'] as const;
const ACTIVITY_LEVELS: readonly ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active', 'very_active'] as const;
const GOALS: readonly Goal[] = ['lose', 'maintain', 'gain'] as const;

const GENDER_LABELS: Record<Gender, string> = { male: 'Male', female: 'Female', other: 'Other' };
const ACTIVITY_LABELS: Record<ActivityLevel, string> = { sedentary: 'Sedentary', light: 'Light exercise', moderate: 'Moderate exercise', active: 'Active', very_active: 'Very active' };
const GOAL_LABELS: Record<Goal, string> = { lose: 'Lose weight', maintain: 'Maintain weight', gain: 'Gain muscle', none: 'Just eat well' } as Record<Goal, string>;

const FASTING_PROTOCOLS: Array<{ value: string | null; label: string }> = [
  { value: null, label: 'No fasting schedule' },
  { value: '16-8', label: '16:8 — 16h fast, 8h eating window' },
  { value: '18-6', label: '18:6 — 18h fast, 6h eating window' },
  { value: '20-4', label: '20:4 — Warrior Diet (4h window)' },
  { value: '5-2', label: '5:2 — 2 fasting days per week' },
  { value: 'eat-stop-eat', label: 'Eat-Stop-Eat — 24h fasts' },
  { value: 'adf', label: 'Alternate Day Fasting' },
  { value: 'omad', label: 'OMAD — One Meal A Day' },
];

const FASTING_LABELS: Record<string, string> = {
  '16-8': '16:8', '18-6': '18:6', '20-4': '20:4', '5-2': '5:2',
  'eat-stop-eat': 'Eat-Stop-Eat', 'adf': 'Alternate Day', 'omad': 'OMAD',
};

export default function ProfilesTab() {
  const navigate = useNavigate();
  const { isLoading, myProfile, otherProfile, updateProfile } = useProfiles();
  const { data: dietList = [] } = useDietList();
  const setSession = useAuthStore((s) => s.setSession);
  const [editing, setEditing] = useState(false);
  const [editingBody, setEditingBody] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDiet, setFormDiet] = useState<string>('omnivore');
  const [formWeight, setFormWeight] = useState('');
  const [formHeight, setFormHeight] = useState('');
  const [formAge, setFormAge] = useState('');
  const [formGender, setFormGender] = useState<Gender>('male');
  const [formActivity, setFormActivity] = useState<ActivityLevel>('sedentary');
  const [formGoal, setFormGoal] = useState<Goal>('maintain');
  const [formFasting, setFormFasting] = useState<string | null>(null);
  const [allergenChips, setAllergenChips] = useState<string[]>([]);
  const [newAllergen, setNewAllergen] = useState('');
  const [saving, setSaving] = useState(false);
  const [linkDigits, setLinkDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [browsingDiet, setBrowsingDiet] = useState<string | null>(null);

  const dietLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const d of dietList) map[d.dietKey] = d.displayLabel;
    return map;
  }, [dietList]);

  const dietsByCategory = useMemo(() => {
    const groups: Record<string, DietCatalogEntry[]> = {};
    for (const d of dietList) {
      const cat = d.category;
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(d);
    }
    return groups;
  }, [dietList]);

  function getDietLabel(key: string): string {
    return dietLabelMap[key] || key.charAt(0).toUpperCase() + key.slice(1).replace(/-/g, ' ');
  }

  function setLinkDigit(index: number, value: string) {
    const cleaned = value.replace(/\D/g, '').slice(-1);
    const next = [...linkDigits];
    next[index] = cleaned;
    setLinkDigits(next);
    if (cleaned && index < 5) {
      document.getElementById(`link-code-${index + 1}`)?.focus();
    }
  }

  function handleLinkDigitKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !linkDigits[index] && index > 0) {
      document.getElementById(`link-code-${index - 1}`)?.focus();
    }
  }

  function handleLinkPaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!text) return;
    e.preventDefault();
    const next = ['', '', '', '', '', ''];
    for (let i = 0; i < text.length; i++) next[i] = text[i] ?? '';
    setLinkDigits(next);
    document.getElementById(`link-code-${Math.min(text.length, 5)}`)?.focus();
  }

  async function handleLink() {
    const code = linkDigits.join('');
    if (!/^\d{6}$/.test(code)) {
      setLinkError('Enter a 6-digit code.');
      return;
    }
    setLinkError(null);
    setLinking(true);
    try {
      const currentToken = useAuthStore.getState().session?.token;
      if (!currentToken) {
        setLinkError('Not signed in. Please restart the app.');
        return;
      }
      const result = await linkWithPartner(code, currentToken);
      setSession(result);
      navigate('/', { replace: true });
    } catch (err) {
      setLinkError(err instanceof Error && 'message' in err ? err.message : 'Could not link. Check the code and try again.');
    } finally {
      setLinking(false);
    }
  }

  function startEdit(profile: PartnerProfile) {
    setFormName(profile.name);
    setFormDiet(profile.diet);
    setAllergenChips(profile.allergens ?? []);
    setNewAllergen('');
    setFormWeight(profile.weightKg?.toString() ?? '');
    setFormHeight(profile.heightCm?.toString() ?? '');
    setFormAge(profile.age?.toString() ?? '');
    setFormGender(profile.gender ?? 'male');
    setFormActivity(profile.activityLevel ?? 'sedentary');
    setFormGoal(profile.goal ?? 'maintain');
    setFormFasting(profile.fastingMode ?? null);
    setEditing(true);
    setEditingBody(false);
  }

  async function handleSave() {
    if (!myProfile) return;
    setSaving(true);
    try {
      const dedupedAllergens = [...new Set(allergenChips.map((a) => a.trim().toLowerCase()).filter(Boolean))];
      await updateProfile(myProfile.id, {
        name: formName.trim() || myProfile.name,
        diet: formDiet,
        fastingMode: formFasting,
        allergies: dedupedAllergens.join(', '),
        allergens: dedupedAllergens,
        weightKg: formWeight ? parseFloat(formWeight) : null,
        heightCm: formHeight ? parseFloat(formHeight) : null,
        age: formAge ? parseInt(formAge) : null,
        gender: formGender,
        activityLevel: formActivity,
        goal: formGoal,
      });
      setEditing(false);
      setEditingBody(false);
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-text-secondary text-sm">Loading profiles…</p>
      </div>
    );
  }

  if (!myProfile) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-text-secondary text-sm">No profile found. Try refreshing.</p>
      </div>
    );
  }

  return (
    <div className="px-6 py-4 space-y-8">
      <UpgradeSection />

      <div>
        <h1 className="text-text-primary text-3xl font-semibold tracking-tight">
          Who are we cooking for?
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Set your preferences and body stats so meals work for both of you.
        </p>
      </div>

      <ProfileCard
        profile={myProfile}
        isYou
        onEdit={() => startEdit(myProfile)}
        editing={editing}
        editingBody={editingBody}
        saving={saving}
        formName={formName}
        formDiet={formDiet}
        formAllergens={allergenChips}
        formWeight={formWeight}
        formHeight={formHeight}
        formAge={formAge}
        formGender={formGender}
        formActivity={formActivity}
        formGoal={formGoal}
        formFasting={formFasting}
        dietsByCategory={dietsByCategory}
        getDietLabel={getDietLabel}
        onBrowseDiet={setBrowsingDiet}
        onFormNameChange={setFormName}
        onFormDietChange={setFormDiet}
        onFormAllergensChange={setAllergenChips}
        onFormWeightChange={setFormWeight}
        onFormHeightChange={setFormHeight}
        onFormAgeChange={setFormAge}
        onFormGenderChange={setFormGender}
        onFormActivityChange={setFormActivity}
        onFormGoalChange={setFormGoal}
        onFormFastingChange={setFormFasting}
        newAllergenInput={newAllergen}
        setNewAllergenInput={setNewAllergen}
        onToggleBody={() => setEditingBody(!editingBody)}
        onSave={handleSave}
        onCancel={() => { setEditing(false); setEditingBody(false); }}
      />

      {otherProfile && (
        <ProfileCard profile={otherProfile} isYou={false} />
      )}

      {!otherProfile && (
        <details className="bg-white border border-border rounded-2xl group">
          <summary className="p-6 cursor-pointer list-none flex items-center justify-between hover:bg-cream/30 transition-colors rounded-2xl">
            <div>
              <h3 className="text-text-primary text-lg font-semibold">Cooking with someone?</h3>
              <p className="text-text-secondary text-sm mt-0.5">Link your kitchen to a partner.</p>
            </div>
            <span className="text-text-secondary text-xs group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <div className="px-6 pb-6 border-t border-border pt-4">
            <p className="text-text-secondary text-sm leading-relaxed mb-6">
              Enter their 6-digit invite code to join their kitchen.
            </p>
            <div className="space-y-4">
              <div className="flex gap-2 justify-center" onPaste={handleLinkPaste}>
                {linkDigits.map((d, i) => (
                  <input
                    key={i}
                    id={`link-code-${i}`}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={1}
                    value={d}
                    onChange={(e) => {
                      setLinkDigit(i, e.target.value);
                      if (linkError) setLinkError(null);
                    }}
                    onKeyDown={(e) => handleLinkDigitKeyDown(i, e)}
                    className="w-full aspect-square bg-cream border border-border rounded-xl text-center text-text-primary text-2xl font-semibold focus:outline-none focus:border-sage focus:ring-2 focus:ring-sage/20 transition-colors"
                  />
                ))}
              </div>

              {linkError && (
                <p className="text-error text-sm text-center" role="alert">
                  {linkError}
                </p>
              )}

              <button
                type="button"
                onClick={handleLink}
                disabled={linking}
                className="w-full bg-sage text-white font-medium py-3 px-6 rounded-xl hover:bg-sage-dark active:scale-[0.99] transition-all disabled:opacity-50"
              >
                {linking ? 'Linking…' : 'Link kitchens'}
              </button>
            </div>
          </div>
        </details>
      )}

      <ActivityLogSection />

      {browsingDiet && (
        <DietBrowser dietKey={browsingDiet} onClose={() => setBrowsingDiet(null)} />
      )}
    </div>
  );
}

function ProfileCard({
  profile,
  isYou,
  onEdit,
  editing,
  editingBody,
  saving,
  formName,
  formDiet,
  formAllergens,
  formWeight,
  formHeight,
  formAge,
  formGender,
  formActivity,
  formGoal,
  formFasting,
  dietsByCategory,
  getDietLabel,
  onBrowseDiet,
  onFormNameChange,
  onFormDietChange,
  onFormAllergensChange,
  onFormWeightChange,
  onFormHeightChange,
  onFormAgeChange,
  onFormGenderChange,
  onFormActivityChange,
  onFormGoalChange,
  onFormFastingChange,
  newAllergenInput,
  setNewAllergenInput,
  onToggleBody,
  onSave,
  onCancel,
}: {
  profile: PartnerProfile;
  isYou: boolean;
  onEdit?: () => void;
  editing?: boolean;
  editingBody?: boolean;
  saving?: boolean;
  formName?: string;
  formDiet?: string;
  formAllergens?: string[];
  formWeight?: string;
  formHeight?: string;
  formAge?: string;
  formGender?: Gender;
  formActivity?: ActivityLevel;
  formGoal?: Goal;
  formFasting?: string | null;
  dietsByCategory?: Record<string, DietCatalogEntry[]>;
  getDietLabel?: (key: string) => string;
  onBrowseDiet?: (dietKey: string) => void;
  onFormNameChange?: (v: string) => void;
  onFormDietChange?: (v: string) => void;
  onFormAllergensChange?: (v: string[]) => void;
  onFormWeightChange?: (v: string) => void;
  onFormHeightChange?: (v: string) => void;
  onFormAgeChange?: (v: string) => void;
  onFormGenderChange?: (v: Gender) => void;
  onFormActivityChange?: (v: ActivityLevel) => void;
  onFormGoalChange?: (v: Goal) => void;
  onFormFastingChange?: (v: string | null) => void;
  newAllergenInput?: string;
  setNewAllergenInput?: (v: string) => void;
  onToggleBody?: () => void;
  onSave?: () => void;
  onCancel?: () => void;
}) {
  const dotColor = profile.slot === 1 ? 'bg-sage' : 'bg-terracotta';

  return (
    <section className="bg-white border border-border rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className={`w-3 h-3 rounded-full ${dotColor}`} aria-hidden />
          <h2 className="text-text-primary text-lg font-semibold">
            {isYou ? 'You' : profile.name}
          </h2>
        </div>
        {isYou && !editing && onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="text-sage text-sm font-medium hover:text-sage-dark transition-colors"
          >
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-4">
          <div>
            <label htmlFor="profile-name" className="text-text-secondary text-xs font-medium tracking-wide block mb-2">
              Name
            </label>
            <input
              id="profile-name"
              type="text"
              value={formName}
              onChange={(e) => onFormNameChange?.(e.target.value)}
              className="w-full bg-cream border border-border rounded-xl px-4 py-3 text-text-primary focus:outline-none focus:border-sage focus:ring-2 focus:ring-sage/20 transition-colors"
            />
          </div>

          <div>
            <label htmlFor="profile-diet" className="text-text-secondary text-xs font-medium tracking-wide block mb-2">
              Dietary preference
            </label>
            <select
              id="profile-diet"
              value={formDiet}
              onChange={(e) => onFormDietChange?.(e.target.value)}
              className="w-full bg-cream border border-border rounded-xl px-4 py-3 text-text-primary focus:outline-none focus:border-sage focus:ring-2 focus:ring-sage/20 transition-colors appearance-none"
            >
              {dietsByCategory && Object.entries(dietsByCategory).map(([cat, diets]) => (
                <optgroup key={cat} label={DIET_CATEGORIES[cat] || cat}>
                  {diets.map((d) => (
                    <option key={d.dietKey} value={d.dietKey}>
                      {d.emoji ? `${d.emoji} ` : ''}{d.displayLabel}
                    </option>
                  ))}
                </optgroup>
              ))}
              {(!dietsByCategory || Object.keys(dietsByCategory).length === 0) && (
                <option value={formDiet}>{getDietLabel?.(formDiet || 'omnivore') || formDiet}</option>
              )}
            </select>
            {onBrowseDiet && formDiet && (
              <button
                type="button"
                onClick={() => onBrowseDiet(formDiet)}
                className="text-sage text-xs font-medium mt-1.5 hover:text-sage-dark transition-colors"
              >
                Learn more about {getDietLabel?.(formDiet) || 'this diet'} →
              </button>
            )}
          </div>

          <div>
            <label htmlFor="profile-fasting" className="text-text-secondary text-xs font-medium tracking-wide block mb-2">
              Eating schedule
            </label>
            <select
              id="profile-fasting"
              value={formFasting ?? ''}
              onChange={(e) => onFormFastingChange?.(e.target.value || null)}
              className="w-full bg-cream border border-border rounded-xl px-4 py-3 text-text-primary focus:outline-none focus:border-sage focus:ring-2 focus:ring-sage/20 transition-colors appearance-none"
            >
              {FASTING_PROTOCOLS.map((p) => (
                <option key={p.value ?? 'none'} value={p.value ?? ''}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-text-secondary text-xs font-medium tracking-wide block mb-2">
              Allergies
            </label>
            {formAllergens && formAllergens.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {formAllergens.map((a, i) => (
                  <span key={i} className="inline-flex items-center gap-1 bg-terracotta/10 text-terracotta text-xs font-medium px-2.5 py-1 rounded-lg">
                    {a}
                    {onFormAllergensChange && (
                      <button
                        type="button"
                        onClick={() => onFormAllergensChange(formAllergens.filter((_, j) => j !== i))}
                        className="hover:text-terracotta-dark ml-0.5"
                      >
                        ×
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={newAllergenInput ?? ''}
                onChange={(e) => setNewAllergenInput?.(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    const cleaned = e.currentTarget.value.trim().toLowerCase();
                    if (cleaned && formAllergens && !formAllergens.includes(cleaned)) {
                      onFormAllergensChange?.([...formAllergens, cleaned]);
                    }
                    setNewAllergenInput?.('');
                  }
                }}
                placeholder="peanuts, shellfish…"
                className="flex-1 bg-cream border border-border rounded-xl px-4 py-3 text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-sage focus:ring-2 focus:ring-sage/20 transition-colors text-sm"
              />
              <button
                type="button"
                onClick={() => {
                  const cleaned = (newAllergenInput ?? '').trim().toLowerCase();
                  if (cleaned && formAllergens && !formAllergens.includes(cleaned)) {
                    onFormAllergensChange?.([...formAllergens, cleaned]);
                  }
                  setNewAllergenInput?.('');
                }}
                disabled={!(newAllergenInput ?? '').trim()}
                className="bg-sage text-white text-sm font-medium px-4 rounded-xl hover:bg-sage-dark disabled:opacity-40 transition-colors"
              >
                +
              </button>
            </div>
          </div>

          {!editingBody ? (
            <button
              type="button"
              onClick={onToggleBody}
              className="text-sage text-sm font-medium hover:text-sage-dark transition-colors"
            >
              + Set body profile for adaptive cooking
            </button>
          ) : (
            <div className="space-y-4 pt-2 border-t border-border">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="profile-weight" className="text-text-secondary text-xs font-medium tracking-wide block mb-2">
                    Weight (kg)
                  </label>
                  <input
                    id="profile-weight"
                    type="number"
                    value={formWeight}
                    onChange={(e) => onFormWeightChange?.(e.target.value)}
                    placeholder="70"
                    className="w-full bg-cream border border-border rounded-xl px-4 py-3 text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-sage focus:ring-2 focus:ring-sage/20 transition-colors"
                  />
                </div>
                <div>
                  <label htmlFor="profile-height" className="text-text-secondary text-xs font-medium tracking-wide block mb-2">
                    Height (cm)
                  </label>
                  <input
                    id="profile-height"
                    type="number"
                    value={formHeight}
                    onChange={(e) => onFormHeightChange?.(e.target.value)}
                    placeholder="170"
                    className="w-full bg-cream border border-border rounded-xl px-4 py-3 text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-sage focus:ring-2 focus:ring-sage/20 transition-colors"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="profile-age" className="text-text-secondary text-xs font-medium tracking-wide block mb-2">
                    Age
                  </label>
                  <input
                    id="profile-age"
                    type="number"
                    value={formAge}
                    onChange={(e) => onFormAgeChange?.(e.target.value)}
                    placeholder="30"
                    className="w-full bg-cream border border-border rounded-xl px-4 py-3 text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-sage focus:ring-2 focus:ring-sage/20 transition-colors"
                  />
                </div>
                <div>
                  <label htmlFor="profile-gender" className="text-text-secondary text-xs font-medium tracking-wide block mb-2">
                    Gender
                  </label>
                  <select
                    id="profile-gender"
                    value={formGender}
                    onChange={(e) => onFormGenderChange?.(e.target.value as Gender)}
                    className="w-full bg-cream border border-border rounded-xl px-4 py-3 text-text-primary focus:outline-none focus:border-sage focus:ring-2 focus:ring-sage/20 transition-colors appearance-none"
                  >
                    {GENDERS.map((g) => (
                      <option key={g} value={g}>{GENDER_LABELS[g]}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="profile-activity" className="text-text-secondary text-xs font-medium tracking-wide block mb-2">
                  Activity level
                </label>
                <select
                  id="profile-activity"
                  value={formActivity}
                  onChange={(e) => onFormActivityChange?.(e.target.value as ActivityLevel)}
                  className="w-full bg-cream border border-border rounded-xl px-4 py-3 text-text-primary focus:outline-none focus:border-sage focus:ring-2 focus:ring-sage/20 transition-colors appearance-none"
                >
                  {ACTIVITY_LEVELS.map((a) => (
                    <option key={a} value={a}>{ACTIVITY_LABELS[a]}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="profile-goal" className="text-text-secondary text-xs font-medium tracking-wide block mb-2">
                  Goal
                </label>
                <select
                  id="profile-goal"
                  value={formGoal}
                  onChange={(e) => onFormGoalChange?.(e.target.value as Goal)}
                  className="w-full bg-cream border border-border rounded-xl px-4 py-3 text-text-primary focus:outline-none focus:border-sage focus:ring-2 focus:ring-sage/20 transition-colors appearance-none"
                >
                  {GOALS.map((g) => (
                    <option key={g} value={g}>{GOAL_LABELS[g]}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="flex-1 bg-sage text-white font-medium py-3 px-6 rounded-xl hover:bg-sage-dark active:scale-[0.99] transition-all disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 bg-cream text-text-secondary font-medium py-3 px-6 rounded-xl border border-border hover:bg-cream-dark transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <p className="text-text-secondary text-xs tracking-wide uppercase">Diet</p>
            <p className="text-text-primary text-base font-medium">
              {getDietLabel?.(profile.diet) || profile.diet}
            </p>
            {profile.fastingMode && (
              <p className="text-text-secondary text-sm mt-0.5">
                ⏰ {FASTING_LABELS[profile.fastingMode] || profile.fastingMode}
              </p>
            )}
          </div>
          <div>
            <p className="text-text-secondary text-xs tracking-wide uppercase">Allergies</p>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {profile.allergens && profile.allergens.length > 0
                ? profile.allergens.map((a, i) => (
                    <span key={i} className="inline-flex items-center bg-terracotta/10 text-terracotta text-xs font-medium px-2 py-0.5 rounded-lg">
                      {a}
                    </span>
                  ))
                : <p className="text-text-primary text-base">{profile.allergies || 'None'}</p>
              }
            </div>
          </div>
          {profile.tdee && (
            <>
              <div className="pt-3 border-t border-border">
                <p className="text-text-secondary text-xs tracking-wide uppercase">Body profile</p>
                <p className="text-text-primary text-sm mt-1">
                  {profile.weightKg}kg · {profile.heightCm}cm · {profile.age}y · {profile.gender} · {ACTIVITY_LABELS[profile.activityLevel!]}
                </p>
                <p className="text-sage text-sm font-medium mt-1">
                  Goal: {GOAL_LABELS[profile.goal!]} · Target: {profile.tdee.targetCalories} cal/day
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
