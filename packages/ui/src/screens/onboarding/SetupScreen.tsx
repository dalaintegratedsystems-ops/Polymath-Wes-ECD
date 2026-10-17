'use client';

import { useState, type FormEvent } from 'react';
import {
  ChoiceChips,
  Field,
  FormError,
  NumberStepper,
  Select,
  StepProgress,
  TextInput,
} from '../../forms';
import { ArrowRightIcon } from '../../icons';
import { Celebration } from '../../illustrations';
import { Button, buttonClass } from '../../primitives';
import type { Submit } from './AuthScreens';

export type Locale = 'en' | 'af' | 'xh' | 'zu';
export type Province = 'EC' | 'FS' | 'GP' | 'KZN' | 'LP' | 'MP' | 'NC' | 'NW' | 'WC';

export const PROVINCE_NAMES: Record<Province, string> = {
  EC: 'Eastern Cape',
  FS: 'Free State',
  GP: 'Gauteng',
  KZN: 'KwaZulu-Natal',
  LP: 'Limpopo',
  MP: 'Mpumalanga',
  NC: 'Northern Cape',
  NW: 'North West',
  WC: 'Western Cape',
};

const LANGUAGES: { value: Locale; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'af', label: 'Afrikaans' },
  { value: 'xh', label: 'isiXhosa' },
  { value: 'zu', label: 'isiZulu' },
];

type Band = 'babies' | 'toddlers' | 'preschool' | 'gradeR';
const BANDS: { value: Band; label: string; min: number; max: number }[] = [
  { value: 'babies', label: 'Babies (0–18 months)', min: 0, max: 18 },
  { value: 'toddlers', label: 'Toddlers (1½–3 years)', min: 18, max: 36 },
  { value: 'preschool', label: '3–5 years', min: 36, max: 60 },
  { value: 'gradeR', label: 'Grade R (5–6 years)', min: 60, max: 72 },
];

export interface CentreDraft {
  name: string;
  addressLine: string;
  suburb: string;
  city: string;
  province: Province;
  agesServedMinMonths: number;
  agesServedMaxMonths: number;
  childCount: number;
}

/**
 * Onboarding in three short steps — you, your centre, your children — then a celebration.
 * Each step asks for only a few things, with the main button always in thumb reach.
 */
export function SetupScreen({
  initialName = '',
  initialLocale = 'en',
  onSaveProfile,
  onCreateCentre,
  doneHref = '/',
}: {
  initialName?: string;
  initialLocale?: Locale;
  onSaveProfile: Submit<{ displayName: string; locale: Locale }>;
  onCreateCentre: Submit<CentreDraft>;
  doneHref?: string;
}) {
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(initialName);
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [centre, setCentre] = useState({
    name: '',
    addressLine: '',
    suburb: '',
    city: '',
    province: '' as Province | '',
  });
  const [bands, setBands] = useState<Band[]>(['toddlers', 'preschool']);
  const [count, setCount] = useState(20);

  const go = async (fn: () => Promise<string | null>, next: number) => {
    setBusy(true);
    setError(null);
    try {
      const err = await fn();
      if (err) setError(err);
      else setStep(next);
    } catch {
      setError('Something went wrong. Check your signal and try again.');
    } finally {
      setBusy(false);
    }
  };

  const submitProfile = (e: FormEvent) => {
    e.preventDefault();
    void go(() => onSaveProfile({ displayName: name.trim(), locale }), 2);
  };

  const submitCentre = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setStep(3);
  };

  const submitChildren = (e: FormEvent) => {
    e.preventDefault();
    const chosen = BANDS.filter((b) => bands.includes(b.value));
    void go(
      () =>
        onCreateCentre({
          name: centre.name.trim(),
          addressLine: centre.addressLine.trim(),
          suburb: centre.suburb.trim(),
          city: centre.city.trim(),
          province: centre.province as Province,
          agesServedMinMonths: Math.min(...chosen.map((b) => b.min)),
          agesServedMaxMonths: Math.max(...chosen.map((b) => b.max)),
          childCount: count,
        }),
      4,
    );
  };

  if (step === 4) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
        <Celebration className="w-52" />
        <h1 className="mt-3 text-[1.75rem] leading-tight font-black text-ink">
          {centre.name} is set up!
        </h1>
        <p className="mt-2 text-ink-muted">
          Well done, {name.split(' ')[0]}. Next, let’s work through your registration together, one
          step at a time.
        </p>
        <a href={doneHref} className={`${buttonClass({ size: 'lg', block: true })} mt-8`}>
          Go to my home screen
          <ArrowRightIcon size={20} />
        </a>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-dvh max-w-md px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-10">
      <StepProgress
        step={step}
        total={3}
        label={step === 1 ? 'About you' : step === 2 ? 'Your centre' : 'Your children'}
      />

      {step === 1 && (
        <form onSubmit={submitProfile} className="mt-6 space-y-5">
          <h1 className="text-[1.75rem] leading-tight font-black tracking-tight text-ink">
            Welcome! What should we call you?
          </h1>
          <Field label="Your first name" htmlFor="name">
            <TextInput
              id="name"
              autoComplete="given-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <ChoiceChips
            label="Language for Wes"
            options={LANGUAGES}
            value={[locale]}
            onChange={([v]) => v && setLocale(v)}
          />
          <p className="text-sm text-ink-muted">
            Wes speaks English today. Afrikaans, isiXhosa and isiZulu are coming — we’ll remember
            your choice.
          </p>
          <FormError message={error} />
          <Button type="submit" size="lg" block disabled={busy || !name.trim()}>
            {busy ? 'Saving…' : 'Next'}
            {!busy && <ArrowRightIcon size={20} />}
          </Button>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={submitCentre} className="mt-6 space-y-5">
          <h1 className="text-[1.75rem] leading-tight font-black tracking-tight text-ink">
            Tell us about your centre
          </h1>
          <Field label="Centre name" htmlFor="centre-name">
            <TextInput
              id="centre-name"
              autoComplete="organization"
              placeholder="e.g. Siyakhula Educare"
              value={centre.name}
              onChange={(e) => setCentre({ ...centre, name: e.target.value })}
            />
          </Field>
          <Field
            label="Street address"
            hint="Optional for now — you’ll need it for registration."
            htmlFor="address"
          >
            <TextInput
              id="address"
              autoComplete="street-address"
              value={centre.addressLine}
              onChange={(e) => setCentre({ ...centre, addressLine: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Suburb or area" htmlFor="suburb">
              <TextInput
                id="suburb"
                value={centre.suburb}
                onChange={(e) => setCentre({ ...centre, suburb: e.target.value })}
              />
            </Field>
            <Field label="Town or city" htmlFor="city">
              <TextInput
                id="city"
                value={centre.city}
                onChange={(e) => setCentre({ ...centre, city: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Province" htmlFor="province">
            <Select
              id="province"
              value={centre.province}
              onChange={(e) => setCentre({ ...centre, province: e.target.value as Province })}
            >
              <option value="" disabled>
                Choose your province
              </option>
              {(Object.keys(PROVINCE_NAMES) as Province[]).map((p) => (
                <option key={p} value={p}>
                  {PROVINCE_NAMES[p]}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex gap-3">
            <Button variant="secondary" size="lg" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button
              type="submit"
              size="lg"
              block
              disabled={!centre.name.trim() || !centre.province}
            >
              Next
              <ArrowRightIcon size={20} />
            </Button>
          </div>
        </form>
      )}

      {step === 3 && (
        <form onSubmit={submitChildren} className="mt-6 space-y-6">
          <h1 className="text-[1.75rem] leading-tight font-black tracking-tight text-ink">
            Who comes to your centre?
          </h1>
          <ChoiceChips
            label="Ages you care for"
            options={BANDS}
            value={bands}
            onChange={setBands}
            multiple
          />
          <NumberStepper
            label="About how many children?"
            value={count}
            onChange={setCount}
            min={1}
            max={300}
          />
          <FormError message={error} />
          <div className="flex gap-3">
            <Button variant="secondary" size="lg" onClick={() => setStep(2)} disabled={busy}>
              Back
            </Button>
            <Button type="submit" size="lg" block disabled={busy || bands.length === 0}>
              {busy ? 'Setting up…' : 'Finish'}
            </Button>
          </div>
        </form>
      )}
    </main>
  );
}
