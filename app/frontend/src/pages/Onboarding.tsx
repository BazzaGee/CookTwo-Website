import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createHousehold, joinHousehold } from '../hooks/useAuth';
import { useAuthStore } from '../stores/authStore';
import { useBilling } from '../hooks/useBilling';
import { apiFetch } from '../lib/api';
import type { Diet, Goal, Gender, ActivityLevel } from '../hooks/useProfiles';

type Step = 'welcome' | 'name' | 'preferences' | 'goals' | 'body' | 'pantry' | 'plan' | 'created' | 'join-code' | 'partner-check' | 'ready';

const DIETS: readonly Diet[] = ['omnivore', 'vegetarian', 'vegan', 'pescatarian', 'keto', 'paleo', 'gluten-free'] as const;
const GOALS: readonly Goal[] = ['lose', 'maintain', 'gain', 'none'] as const;

const DIET_LABELS: Record<Diet, string> = {
  omnivore: 'No restrictions',
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
  pescatarian: 'Pescatarian',
  keto: 'Keto',
  paleo: 'Paleo',
  'gluten-free': 'Gluten-free',
};

const GOAL_LABELS: Record<Goal, string> = {
  lose: 'Lose weight',
  maintain: 'Maintain weight',
  gain: 'Build muscle',
  none: 'Just eat well',
};

const GENDERS: readonly Gender[] = ['male', 'female', 'other'] as const;
const ACTIVITY_LEVELS: readonly ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active', 'very_active'] as const;
const GENDER_LABELS: Record<Gender, string> = { male: 'Male', female: 'Female', other: 'Other' };
const ACTIVITY_LABELS: Record<ActivityLevel, string> = { sedentary: 'Sedentary', light: 'Light exercise', moderate: 'Moderate exercise', active: 'Active', very_active: 'Very active' };

export default function Onboarding() {
  const navigate = useNavigate();
  const session = useAuthStore((s) => s.session);
  const setSession = useAuthStore((s) => s.setSession);
  const completeOnboarding = useAuthStore((s) => s.completeOnboarding);

  const initialStep = session ? 'welcome' : 'welcome';
  const [step, setStep] = useState<Step>(initialStep);
  const [displayName, setDisplayName] = useState('');
  const [inviteCodeDigits, setInviteCodeDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [createdInviteCode, setCreatedInviteCode] = useState<string | null>(null);
  const [diet, setDiet] = useState<Diet>('omnivore');
  const [allergies, setAllergies] = useState('');
  const [goal, setGoal] = useState<Goal>('none');
  const [weightKg, setWeightKg] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<Gender>('male');
  const [activityLevel, setActivityLevel] = useState<ActivityLevel>('moderate');
  const [pantryInput, setPantryInput] = useState('');
  const [isSoloMode, setIsSoloMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const joinParam = searchParams.get('join');
    if (joinParam && /^\d{6}$/.test(joinParam)) {
      setInviteCodeDigits(joinParam.split(''));
      setStep('join-code');
    }
  }, [searchParams]);

  async function handleJoin() {
    const code = inviteCodeDigits.join('');
    const name = displayName.trim();
    if (!/^\d{6}$/.test(code)) {
      setError("Your partner's code is 6 digits.");
      return;
    }
    if (!name) {
      setError('Tell us what to call you.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const allergensArray = allergies.split(/[,;]/).map((a) => a.trim().toLowerCase()).filter(Boolean);
      const result = await joinHousehold({
        inviteCode: code,
        displayName: name,
        diet: diet === 'omnivore' ? undefined : diet,
        allergies: allergies.trim() || undefined,
        allergens: allergensArray.length > 0 ? allergensArray : undefined,
        goal: goal === 'none' ? undefined : goal,
        weightKg: weightKg ? parseFloat(weightKg) : null,
        heightCm: heightCm ? parseFloat(heightCm) : null,
        age: age ? parseInt(age) : null,
        gender,
        activityLevel,
      });
      setSession(result);
      completeOnboarding();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error && 'message' in err ? err.message : 'Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function handlePantryContinue() {
    const name = displayName.trim();
    if (!name) {
      setError('Tell us what to call you.');
      return;
    }
    setError(null);
    setStep('plan');
  }

  function handlePlanContinue() {
    if (isSoloMode) {
      handleSoloCreate();
    } else {
      setStep('partner-check');
    }
  }

  async function handleCreateHousehold() {
    const name = displayName.trim();
    if (!name) {
      setError('Tell us what to call you.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const allergensArray = allergies.split(/[,;]/).map((a) => a.trim().toLowerCase()).filter(Boolean);
      const result = await createHousehold({
        displayName: name,
        diet: diet === 'omnivore' ? undefined : diet,
        allergies: allergies.trim() || undefined,
        allergens: allergensArray.length > 0 ? allergensArray : undefined,
        goal: goal === 'none' ? undefined : goal,
        weightKg: weightKg ? parseFloat(weightKg) : null,
        heightCm: heightCm ? parseFloat(heightCm) : null,
        age: age ? parseInt(age) : null,
        gender,
        activityLevel,
      });
      setSession(result);
      setCreatedInviteCode(result.inviteCode ?? null);

      if (pantryInput.trim()) {
        const parts = pantryInput.split(/[,;]/).map((p) => p.trim()).filter((p) => p.length > 0);
        if (parts.length > 0) {
          try {
            await apiFetch(`/api/household/${result.householdId}/pantry/bulk`, {
              method: 'POST',
              body: {
                items: parts.map((p) => ({ name: p, quantity: '' })),
                addedByPartnerId: result.partner.id,
                addedByPartnerSlot: result.partner.slot,
              },
              token: result.token,
            });
          } catch {
            // pantry bulk is optional, don't block onboarding
          }
        }
      }

      setStep('created');
    } catch (err) {
      setError(err instanceof Error && 'message' in err ? err.message : 'Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSoloCreate() {
    const name = displayName.trim();
    if (!name) {
      setError('Tell us what to call you.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const allergensArray = allergies.split(/[,;]/).map((a) => a.trim().toLowerCase()).filter(Boolean);
      const result = await createHousehold({
        displayName: name,
        diet: diet === 'omnivore' ? undefined : diet,
        allergies: allergies.trim() || undefined,
        allergens: allergensArray.length > 0 ? allergensArray : undefined,
        goal: goal === 'none' ? undefined : goal,
        weightKg: weightKg ? parseFloat(weightKg) : null,
        heightCm: heightCm ? parseFloat(heightCm) : null,
        age: age ? parseInt(age) : null,
        gender,
        activityLevel,
      });
      setSession(result);
      setCreatedInviteCode(result.inviteCode ?? null);

      if (pantryInput.trim()) {
        const parts = pantryInput.split(/[,;]/).map((p) => p.trim()).filter((p) => p.length > 0);
        if (parts.length > 0) {
          try {
            await apiFetch(`/api/household/${result.householdId}/pantry/bulk`, {
              method: 'POST',
              body: {
                items: parts.map((p) => ({ name: p, quantity: '' })),
                addedByPartnerId: result.partner.id,
                addedByPartnerSlot: result.partner.slot,
              },
              token: result.token,
            });
          } catch {
            // pantry bulk is optional, don't block onboarding
          }
        }
      }

      setStep('ready');
    } catch (err) {
      setError(err instanceof Error && 'message' in err ? err.message : 'Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleContinue() {
    completeOnboarding();
    navigate('/', { replace: true });
  }

  return (
    <main className="min-h-full bg-cream flex flex-col">
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          {step === 'welcome' && (
            <WelcomeStep
              onSolo={() => { setIsSoloMode(true); setStep('name'); }}
              onJoinCode={() => { setIsSoloMode(false); setStep('name'); }}
              onCreate={() => { setIsSoloMode(false); setStep('name'); }}
            />
          )}

          {step === 'name' && (
            <NameStep
              displayName={displayName}
              onDisplayNameChange={(v) => {
                setDisplayName(v);
                if (error) setError(null);
              }}
              onSubmit={() => setStep('preferences')}
              onBack={() => setStep('welcome')}
              error={error}
            />
          )}

          {step === 'preferences' && (
            <PreferencesStep
              diet={diet}
              allergies={allergies}
              onDietChange={setDiet}
              onAllergiesChange={setAllergies}
              onNext={() => setStep('goals')}
              onBack={() => setStep('name')}
            />
          )}

          {step === 'goals' && (
            <GoalsStep
              goal={goal}
              onGoalChange={setGoal}
              onNext={() => setStep('body')}
              onBack={() => setStep('preferences')}
            />
          )}

          {step === 'body' && (
            <BodyMetricsStep
              weightKg={weightKg}
              heightCm={heightCm}
              age={age}
              gender={gender}
              activityLevel={activityLevel}
              goal={goal}
              onWeightKgChange={setWeightKg}
              onHeightCmChange={setHeightCm}
              onAgeChange={setAge}
              onGenderChange={setGender}
              onActivityLevelChange={setActivityLevel}
              onNext={() => setStep('pantry')}
              onSkip={() => setStep('pantry')}
              onBack={() => setStep('goals')}
            />
          )}

          {step === 'pantry' && (
            <PantryStep
              pantryInput={pantryInput}
              onPantryInputChange={setPantryInput}
              onSubmit={handlePantryContinue}
              onSkip={handlePantryContinue}
              submitting={submitting}
              error={error}
            />
          )}

          {step === 'plan' && (
            <PlanStep
              onContinue={handlePlanContinue}
              onBack={() => setStep('pantry')}
            />
          )}

          {step === 'partner-check' && (
            <PartnerCheckStep
              onJoin={() => setStep('join-code')}
              onCreate={handleCreateHousehold}
              onBack={() => setStep('pantry')}
            />
          )}

          {step === 'join-code' && (
            <JoinCodeStep
              digits={inviteCodeDigits}
              onDigitsChange={(d) => {
                setInviteCodeDigits(d);
                if (error) setError(null);
              }}
              onSubmit={handleJoin}
              onBack={() => setStep('partner-check')}
              submitting={submitting}
              error={error}
            />
          )}

          {step === 'created' && (
            <CreatedStep
              inviteCode={createdInviteCode}
              onContinue={() => handleContinue()}
            />
          )}

          {step === 'ready' && (
            <ReadyStep
              inviteCode={createdInviteCode}
              onContinue={() => handleContinue()}
            />
          )}
        </div>
      </div>
    </main>
  );
}

function Wordmark() {
  return (
    <div className="text-center mb-12">
      <p className="text-sage text-xs font-medium tracking-[0.3em] uppercase">For one or two</p>
      <h1 className="text-text-primary text-3xl font-semibold tracking-tight mt-3">
        CookTwo
      </h1>
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
  type = 'button',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="w-full bg-sage text-white font-medium py-4 px-6 rounded-2xl hover:bg-sage-dark active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-text-secondary hover:text-text-primary text-sm font-medium py-2 transition-colors"
    >
      {children}
    </button>
  );
}

function WelcomeStep({
  onSolo,
  onJoinCode,
  onCreate,
}: {
  onSolo: () => void;
  onJoinCode: () => void;
  onCreate: () => void;
}) {
  return (
    <div className="flex flex-col">
      <Wordmark />

      <div className="text-center mb-10">
        <h2 className="text-text-primary text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05]">
          One dinner.
          <br />
          <span className="text-terracotta">Your way.</span>
          <br />
          <span className="text-sage">Zero arguments.</span>
        </h2>
        <p className="text-text-secondary text-base mt-6 leading-relaxed max-w-sm mx-auto">
          Plan meals that work for you — solo or with someone.
        </p>
      </div>

      <div className="space-y-3">
        <PrimaryButton onClick={onSolo}>Cooking solo</PrimaryButton>
        <button
          type="button"
          onClick={onJoinCode}
          className="w-full bg-transparent text-sage font-medium py-4 px-6 rounded-2xl border border-sage/30 hover:bg-sage/5 transition-colors"
        >
          I have a code
        </button>
        <button
          type="button"
          onClick={onCreate}
          className="w-full bg-transparent text-text-secondary font-medium py-4 px-6 rounded-2xl border border-border hover:bg-cream-dark transition-colors"
        >
          Setting up for two
        </button>
      </div>
    </div>
  );
}

function NameStep({
  displayName,
  onDisplayNameChange,
  onSubmit,
  onBack,
  error,
}: {
  displayName: string;
  onDisplayNameChange: (v: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  error: string | null;
}) {
  return (
    <div className="flex flex-col">
      <Wordmark />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="flex flex-col"
      >
        <label
          htmlFor="displayName"
          className="text-text-primary text-sm font-medium mb-3 tracking-wide"
        >
          What should we call you?
        </label>
        <input
          id="displayName"
          type="text"
          value={displayName}
          onChange={(e) => onDisplayNameChange(e.target.value)}
          placeholder="Your first name"
          autoFocus
          autoComplete="given-name"
          maxLength={32}
          className="w-full bg-white border border-border rounded-2xl px-5 py-4 text-text-primary text-lg placeholder:text-text-secondary/50 focus:outline-none focus:border-sage focus:ring-2 focus:ring-sage/20 transition-colors"
        />

        {error && (
          <p className="text-error text-sm mt-3" role="alert">
            {error}
          </p>
        )}

        <div className="mt-8">
          <PrimaryButton type="submit">Continue</PrimaryButton>
        </div>
        <div className="mt-2 text-center">
          <SecondaryButton onClick={onBack}>Back</SecondaryButton>
        </div>
      </form>
    </div>
  );
}

function PreferencesStep({
  diet,
  allergies,
  onDietChange,
  onAllergiesChange,
  onNext,
  onBack,
}: {
  diet: Diet;
  allergies: string;
  onDietChange: (v: Diet) => void;
  onAllergiesChange: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col">
      <Wordmark />

      <div className="mb-8">
        <h2 className="text-text-primary text-2xl font-semibold tracking-tight">
          Any dietary preferences?
        </h2>
        <p className="text-text-secondary text-sm mt-2">
          This helps us suggest meals that work for you. Skip if you're not sure.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="diet" className="text-text-secondary text-xs font-medium tracking-wide block mb-2">
            Dietary preference
          </label>
          <select
            id="diet"
            value={diet}
            onChange={(e) => onDietChange(e.target.value as Diet)}
            className="w-full bg-white border border-border rounded-xl px-4 py-3 text-text-primary focus:outline-none focus:border-sage focus:ring-2 focus:ring-sage/20 transition-colors appearance-none"
          >
            {DIETS.map((d) => (
              <option key={d} value={d}>
                {DIET_LABELS[d]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="allergies" className="text-text-secondary text-xs font-medium tracking-wide block mb-2">
            Allergies (optional)
          </label>
          <input
            id="allergies"
            type="text"
            value={allergies}
            onChange={(e) => onAllergiesChange(e.target.value)}
            placeholder="peanuts, shellfish, dairy…"
            className="w-full bg-white border border-border rounded-xl px-4 py-3 text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-sage focus:ring-2 focus:ring-sage/20 transition-colors"
          />
        </div>
      </div>

      <div className="mt-8">
        <PrimaryButton onClick={onNext}>Continue</PrimaryButton>
      </div>
      <div className="mt-2 text-center">
        <SecondaryButton onClick={onBack}>Back</SecondaryButton>
      </div>
    </div>
  );
}

function GoalsStep({
  goal,
  onGoalChange,
  onNext,
  onBack,
}: {
  goal: Goal;
  onGoalChange: (v: Goal) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col">
      <Wordmark />

      <div className="mb-8">
        <h2 className="text-text-primary text-2xl font-semibold tracking-tight">
          Any body goals?
        </h2>
        <p className="text-text-secondary text-sm mt-2">
          This helps us adapt portions to your body. Skip if you're not sure.
        </p>
      </div>

      <div className="space-y-3">
        {GOALS.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => onGoalChange(g)}
            className={`w-full text-left py-3 px-4 rounded-xl border transition-colors ${
              goal === g
                ? 'bg-sage/10 border-sage text-text-primary'
                : 'bg-white border-border text-text-secondary hover:bg-cream'
            }`}
          >
            <span className="text-sm font-medium">{GOAL_LABELS[g]}</span>
          </button>
        ))}
      </div>

      <div className="mt-8">
        <PrimaryButton onClick={onNext}>Continue</PrimaryButton>
      </div>
      <div className="mt-2 text-center">
        <SecondaryButton onClick={onBack}>Back</SecondaryButton>
      </div>
    </div>
  );
}

function BodyMetricsStep({
  weightKg,
  heightCm,
  age,
  gender,
  activityLevel,
  goal,
  onWeightKgChange,
  onHeightCmChange,
  onAgeChange,
  onGenderChange,
  onActivityLevelChange,
  onNext,
  onSkip,
  onBack,
}: {
  weightKg: string;
  heightCm: string;
  age: string;
  gender: Gender;
  activityLevel: ActivityLevel;
  goal: Goal;
  onWeightKgChange: (v: string) => void;
  onHeightCmChange: (v: string) => void;
  onAgeChange: (v: string) => void;
  onGenderChange: (v: Gender) => void;
  onActivityLevelChange: (v: ActivityLevel) => void;
  onNext: () => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col">
      <Wordmark />

      <div className="mb-8">
        <h2 className="text-text-primary text-2xl font-semibold tracking-tight">
          Tell us about your body
        </h2>
        <p className="text-text-secondary text-sm mt-2">
          {goal !== 'none'
            ? `This helps us tailor portions and nutrition to your goal: ${GOAL_LABELS[goal]}.`
            : 'This helps us personalize portion sizes and nutrition for you.'}
        </p>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="body-weight" className="text-text-secondary text-xs font-medium tracking-wide block mb-2">
              Weight (kg)
            </label>
            <input
              id="body-weight"
              type="number"
              inputMode="decimal"
              value={weightKg}
              onChange={(e) => onWeightKgChange(e.target.value)}
              placeholder="70"
              className="w-full bg-white border border-border rounded-xl px-4 py-3 text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-sage focus:ring-2 focus:ring-sage/20 transition-colors"
            />
          </div>
          <div>
            <label htmlFor="body-height" className="text-text-secondary text-xs font-medium tracking-wide block mb-2">
              Height (cm)
            </label>
            <input
              id="body-height"
              type="number"
              inputMode="decimal"
              value={heightCm}
              onChange={(e) => onHeightCmChange(e.target.value)}
              placeholder="170"
              className="w-full bg-white border border-border rounded-xl px-4 py-3 text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-sage focus:ring-2 focus:ring-sage/20 transition-colors"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="body-age" className="text-text-secondary text-xs font-medium tracking-wide block mb-2">
              Age
            </label>
            <input
              id="body-age"
              type="number"
              inputMode="numeric"
              value={age}
              onChange={(e) => onAgeChange(e.target.value)}
              placeholder="30"
              className="w-full bg-white border border-border rounded-xl px-4 py-3 text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-sage focus:ring-2 focus:ring-sage/20 transition-colors"
            />
          </div>
          <div>
            <label htmlFor="body-gender" className="text-text-secondary text-xs font-medium tracking-wide block mb-2">
              Gender
            </label>
            <select
              id="body-gender"
              value={gender}
              onChange={(e) => onGenderChange(e.target.value as Gender)}
              className="w-full bg-white border border-border rounded-xl px-4 py-3 text-text-primary focus:outline-none focus:border-sage focus:ring-2 focus:ring-sage/20 transition-colors appearance-none"
            >
              {GENDERS.map((g) => (
                <option key={g} value={g}>{GENDER_LABELS[g]}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="body-activity" className="text-text-secondary text-xs font-medium tracking-wide block mb-2">
            Activity level
          </label>
          <select
            id="body-activity"
            value={activityLevel}
            onChange={(e) => onActivityLevelChange(e.target.value as ActivityLevel)}
            className="w-full bg-white border border-border rounded-xl px-4 py-3 text-text-primary focus:outline-none focus:border-sage focus:ring-2 focus:ring-sage/20 transition-colors appearance-none"
          >
            {ACTIVITY_LEVELS.map((a) => (
              <option key={a} value={a}>{ACTIVITY_LABELS[a]}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-8">
        <PrimaryButton onClick={onNext}>Continue</PrimaryButton>
      </div>
      <div className="mt-3 text-center">
        <button
          type="button"
          onClick={onSkip}
          className="text-text-secondary text-sm hover:text-text-primary transition-colors"
        >
          Skip for now
        </button>
        <p className="text-text-secondary/70 text-[11px] mt-3 leading-relaxed">
          You can add your body measurements later in the Profile tab, but we recommend doing it now for the best personalized meals.
        </p>
      </div>
      <div className="mt-3 text-center">
        <SecondaryButton onClick={onBack}>Back</SecondaryButton>
      </div>
    </div>
  );
}

function PantryStep({
  pantryInput,
  onPantryInputChange,
  onSubmit,
  onSkip,
  submitting,
  error,
}: {
  pantryInput: string;
  onPantryInputChange: (v: string) => void;
  onSubmit: () => void;
  onSkip: () => void;
  submitting: boolean;
  error: string | null;
}) {
  return (
    <div className="flex flex-col">
      <Wordmark />

      <div className="mb-8">
        <h2 className="text-text-primary text-2xl font-semibold tracking-tight">
          What's in your kitchen?
        </h2>
        <p className="text-text-secondary text-sm mt-2">
          Type what you have — or skip and add later. This helps us suggest meals you can actually cook.
        </p>
      </div>

      <div className="space-y-3">
        <textarea
          value={pantryInput}
          onChange={(e) => onPantryInputChange(e.target.value)}
          placeholder="chicken, 2 cups rice, spinach, half an onion…"
          rows={3}
          className="w-full bg-white border border-border rounded-xl px-4 py-3 text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-sage focus:ring-2 focus:ring-sage/20 transition-colors resize-none"
        />
        {error && (
          <p className="text-error text-sm" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="mt-8">
        <PrimaryButton onClick={onSubmit} disabled={submitting}>
          {submitting ? 'Setting the table…' : 'Continue'}
        </PrimaryButton>
      </div>
      <div className="mt-2 text-center">
        <button
          type="button"
          onClick={onSkip}
          className="text-text-secondary text-sm hover:text-text-primary transition-colors"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}

function PartnerCheckStep({
  onJoin,
  onCreate,
  onBack,
}: {
  onJoin: () => void;
  onCreate: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col">
      <Wordmark />

      <div className="text-center mb-12">
        <h2 className="text-text-primary text-3xl font-semibold tracking-tight">
          Is your partner already set up?
        </h2>
        <p className="text-text-secondary text-base mt-3 leading-relaxed">
          If they've already created a kitchen, enter their code to join.
          If not, you'll get a code to share with them.
        </p>
      </div>

      <div className="space-y-3">
        <PrimaryButton onClick={onJoin}>Yes, I have their code</PrimaryButton>
        <button
          type="button"
          onClick={onCreate}
          className="w-full bg-transparent text-terracotta-dark font-medium py-4 px-6 rounded-2xl border border-terracotta/30 hover:bg-terracotta/5 transition-colors"
        >
          No, I'm setting up first
        </button>
      </div>
      <div className="mt-4 text-center">
        <SecondaryButton onClick={onBack}>Back</SecondaryButton>
      </div>
    </div>
  );
}

function CreatedStep({
  inviteCode,
  onContinue,
}: {
  inviteCode: string | null;
  onContinue: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
    }
  }

  return (
    <div className="flex flex-col">
      <Wordmark />

      <div className="text-center mb-8">
        <p className="text-sage text-sm font-medium tracking-wide uppercase">Your kitchen is ready</p>
        <h2 className="text-text-primary text-3xl font-semibold tracking-tight mt-3">
          Share this code with your partner
        </h2>
        <p className="text-text-secondary text-base mt-3 leading-relaxed">
          They enter it when they open the app, and your kitchens link up instantly.
        </p>
      </div>

      {inviteCode && (
        <div className="flex gap-2 justify-center mb-6">
          {inviteCode.split('').map((d, i) => (
            <div
              key={i}
              className="w-full aspect-square bg-white border border-border rounded-xl flex items-center justify-center text-text-primary text-2xl font-semibold"
            >
              {d}
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={handleCopy}
        className={`w-full font-medium py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2 mb-6 ${
          copied
            ? 'bg-sage text-white'
            : 'bg-white border border-border text-text-primary hover:bg-cream-dark'
        }`}
      >
        {copied ? 'Copied!' : 'Copy code'}
      </button>

      <PrimaryButton onClick={onContinue}>Continue to our kitchen</PrimaryButton>
      <p className="text-text-secondary text-sm text-center mt-4">
        You can also share this code later from the app header.
      </p>
      <p className="text-text-secondary/60 text-[11px] text-center mt-3">
        Free plan · 10 AI requests/day shared with your partner
      </p>
    </div>
  );
}

function ReadyStep({
  inviteCode,
  onContinue,
}: {
  inviteCode: string | null;
  onContinue: () => void;
}) {
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
    }
  }

  return (
    <div className="flex flex-col">
      <Wordmark />

      <div className="text-center mb-8">
        <p className="text-sage text-sm font-medium tracking-wide uppercase">You're all set</p>
        <h2 className="text-text-primary text-3xl font-semibold tracking-tight mt-3">
          Welcome to your kitchen
        </h2>
        <p className="text-text-secondary text-base mt-3 leading-relaxed">
          Start adding groceries or chat with the AI to plan your first meal.
        </p>
      </div>

      {inviteCode && (
        <div className="mb-6">
          <button
            type="button"
            onClick={() => setShowCode(!showCode)}
            className="w-full text-center text-text-secondary text-sm hover:text-text-primary transition-colors"
          >
            {showCode ? 'Hide invite code' : 'Invite someone later?'}
          </button>
          {showCode && (
            <div className="mt-4 space-y-4">
              <div className="flex gap-2 justify-center">
                {inviteCode.split('').map((d, i) => (
                  <div
                    key={i}
                    className="w-full aspect-square bg-white border border-border rounded-xl flex items-center justify-center text-text-primary text-2xl font-semibold"
                  >
                    {d}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className={`w-full font-medium py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2 ${
                  copied
                    ? 'bg-sage text-white'
                    : 'bg-white border border-border text-text-primary hover:bg-cream-dark'
                }`}
              >
                {copied ? 'Copied!' : 'Copy code'}
              </button>
            </div>
          )}
        </div>
      )}

      <PrimaryButton onClick={onContinue}>Start cooking</PrimaryButton>
      <p className="text-text-secondary/60 text-[11px] text-center mt-3">
        Free plan · 10 AI requests/day shared with your partner
      </p>
    </div>
  );
}

function PlanStep({
  onContinue,
  onBack,
}: {
  onContinue: () => void;
  onBack: () => void;
}) {
  const { checkout, checkingOut } = useBilling();
  const [planPeriod, setPlanPeriod] = useState<'monthly' | 'yearly'>('monthly');

  return (
    <div className="flex flex-col">
      <Wordmark />

      <div className="mb-8">
        <h2 className="text-text-primary text-2xl font-semibold tracking-tight">
          Your daily AI plan
        </h2>
        <p className="text-text-secondary text-sm mt-2">
          Every kitchen starts with <strong className="text-text-primary">10 AI requests per day</strong>, shared between you and your partner. Use them however you like — chat, plan meals, or generate recipes.
        </p>
      </div>

      <div className="bg-white border border-border rounded-2xl p-5 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="w-2 h-2 rounded-full bg-sage" />
          <h3 className="text-text-primary font-semibold text-sm">Premium</h3>
        </div>
        <p className="text-text-secondary text-sm leading-relaxed">
          Get <strong className="text-text-primary">70 AI requests</strong> and <strong className="text-text-primary">3 AI-generated meal images</strong> per day — that's 7× more. Cancel anytime.
        </p>

        <div className="flex bg-cream-dark rounded-xl p-1 mt-4 mb-4">
          <button
            type="button"
            onClick={() => setPlanPeriod('monthly')}
            className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
              planPeriod === 'monthly' ? 'bg-white text-text-primary shadow-sm' : 'text-text-secondary'
            }`}
          >
            $4.99/month
          </button>
          <button
            type="button"
            onClick={() => setPlanPeriod('yearly')}
            className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
              planPeriod === 'yearly' ? 'bg-white text-text-primary shadow-sm' : 'text-text-secondary'
            }`}
          >
            $44.99/year
          </button>
        </div>

        <button
          type="button"
          onClick={() => checkout(planPeriod)}
          disabled={checkingOut}
          className="w-full bg-sage text-white text-sm font-medium py-3 px-4 rounded-xl hover:bg-sage-dark active:scale-[0.99] transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          {checkingOut ? 'Redirecting…' : `Upgrade to Premium · ${planPeriod === 'monthly' ? '$4.99/mo' : '$44.99/yr'}`}
        </button>
      </div>

      <p className="text-text-secondary text-xs text-center mb-6">
        You can also upgrade anytime in Settings → Plan.
      </p>

      <PrimaryButton onClick={onContinue}>Continue with free plan</PrimaryButton>
      <div className="mt-2 text-center">
        <SecondaryButton onClick={onBack}>Back</SecondaryButton>
      </div>
    </div>
  );
}

function JoinCodeStep({
  digits,
  onDigitsChange,
  onSubmit,
  onBack,
  submitting,
  error,
}: {
  digits: string[];
  onDigitsChange: (d: string[]) => void;
  onSubmit: () => void;
  onBack: () => void;
  submitting: boolean;
  error: string | null;
}) {
  function setDigit(index: number, value: string) {
    const cleaned = value.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[index] = cleaned;
    onDigitsChange(next);
    if (cleaned && index < 5) {
      const nextEl = document.getElementById(`code-${index + 1}`);
      nextEl?.focus();
    }
  }

  function handleDigitKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      const prev = document.getElementById(`code-${index - 1}`);
      prev?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!text) return;
    e.preventDefault();
    const next = ['', '', '', '', '', ''];
    for (let i = 0; i < text.length; i++) next[i] = text[i] ?? '';
    onDigitsChange(next);
    const focusIndex = Math.min(text.length, 5);
    document.getElementById(`code-${focusIndex}`)?.focus();
  }

  return (
    <div className="flex flex-col">
      <Wordmark />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="flex flex-col"
      >
        <label className="text-text-primary text-sm font-medium mb-3 tracking-wide">
          Your partner's code
        </label>
        <div className="flex gap-2 justify-between mb-8" onPaste={handlePaste}>
          {digits.map((d, i) => (
            <input
              key={i}
              id={`code-${i}`}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={1}
              value={d}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => handleDigitKeyDown(i, e)}
              autoFocus={i === 0}
              className="w-full aspect-square bg-white border border-border rounded-2xl text-center text-text-primary text-2xl font-semibold focus:outline-none focus:border-sage focus:ring-2 focus:ring-sage/20 transition-colors"
            />
          ))}
        </div>

        {error && (
          <p className="text-error text-sm mt-3" role="alert">
            {error}
          </p>
        )}

        <div className="mt-8">
          <PrimaryButton type="submit" disabled={submitting}>
            {submitting ? 'Joining…' : 'Join our kitchen'}
          </PrimaryButton>
        </div>
        <div className="mt-2 text-center">
          <SecondaryButton onClick={onBack}>Back</SecondaryButton>
        </div>
      </form>
    </div>
  );
}
