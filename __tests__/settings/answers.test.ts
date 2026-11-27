import { applyStep, currentTreatments, isStep, STEP_FIELDS, stepChanged, summary } from '@/profile/answers';
import { STEPS } from '@/profile/onboarding';
import { emptyProfile, type Profile } from '@/profile/types';

const base = (p: Partial<Profile> = {}): Profile => ({ ...emptyProfile(), age: 30, sex: 'male', ...p });

describe('onboarding answers in settings', () => {
  it('every onboarding step is editable and owns at least one field', () => {
    for (const s of STEPS) {
      expect(isStep(s)).toBe(true);
      expect(STEP_FIELDS[s].length).toBeGreaterThan(0);
    }
    expect(isStep('subscription')).toBe(false);
  });

  it('saving a step writes only that step, on top of the latest profile', () => {
    const saved = base({ treatments: ['minoxidil'], subscription: { plan: 'annual', startedAt: 'x', trialEndsAt: null, test: true } });
    const draft = { ...base(), treatments: ['finasteride' as const], sleep: 'poor' as const };
    const out = applyStep(saved, draft, 'treatments');
    expect(out.treatments).toEqual(['finasteride']);
    expect(out.sleep).toBeUndefined();
    expect(out.subscription).toEqual(saved.subscription);
  });

  it('knows when a step has really changed', () => {
    const p = base({ zones: ['crown'] });
    expect(stepChanged(p, { ...p }, 'where')).toBe(false);
    expect(stepChanged(p, { ...p, zones: ['crown', 'top'] }, 'where')).toBe(true);
    expect(stepChanged(p, { ...p, sleep: 'good' }, 'where')).toBe(false);
  });

  it('summarises answers in plain words', () => {
    const p = base({
      treatments: ['finasteride', 'minoxidil'],
      family: { father: { status: 'bald' }, mother: { status: 'full' } },
      stressEvents: ['exams'],
      sleep: 'ok',
      smoker: false,
      goal: 'keep',
      shedding: '50to100',
      noticed: '1to3y',
    });
    expect(summary('basics', p)).toBe('30, Male');
    expect(summary('treatments', p)).toBe('Finasteride, Minoxidil');
    expect(summary('family', p)).toBe('1 of 2 relatives with hair loss');
    expect(summary('lifestyle', p)).toBe('1 stressful event, Sleep 6 to 7 hours, Non-smoker');
    expect(summary('when', p)).toBe('1 to 3 years, 50 to 100 a day');
    expect(summary('goal', p)).toBe('Keep what I have');
    expect(summary('where', base({ worriedOnly: true }))).toBe('Not noticing it yet');
    expect(summary('treatments', base({ treatments: ['none'] }))).toBe('Nothing yet');
  });

  it('prescription treatments never count for under-18s', () => {
    const teen = base({ age: 16, treatments: ['finasteride', 'minoxidil'] });
    expect(currentTreatments(teen)).toEqual(['minoxidil']);
    expect(summary('treatments', teen)).toBe('Minoxidil');
  });
});
