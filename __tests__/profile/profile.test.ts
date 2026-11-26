import { ForecastModel } from '@/forecast';
import { ancestryFor, relativesFor, toForecastInput, treatmentFor } from '@/profile/forecastInput';
import {
  canContinue,
  familySummary,
  patternLine,
  riskCard,
  STEPS,
  toggleMulti,
  toggleWorried,
  toggleZone,
  treatmentOptions,
} from '@/profile/onboarding';
import { emptyProfile, type Profile } from '@/profile/types';

const p = (extra: Partial<Profile> = {}): Profile => ({ ...emptyProfile(), ...extra });

describe('onboarding steps', () => {
  it('has nine steps, fun first and health last', () => {
    expect(STEPS).toHaveLength(9);
    expect(STEPS[2]).toBe('where');
    expect(STEPS[4]).toBe('family');
    expect(STEPS.indexOf('health')).toBeGreaterThan(STEPS.indexOf('family'));
  });

  it('needs age and sex to leave the first step, and nothing else after it', () => {
    expect(canContinue('basics', p())).toBe(false);
    expect(canContinue('basics', p({ age: 24 }))).toBe(false);
    expect(canContinue('basics', p({ age: 24, sex: 'male' }))).toBe(true);
    expect(canContinue('basics', p({ age: 9, sex: 'male' }))).toBe(false);
    expect(canContinue('basics', p({ age: 95, sex: 'male' }))).toBe(false);
    expect(canContinue('family', p())).toBe(true);
  });
});

describe('tap-the-head', () => {
  it('toggles zones and clears "not noticing it yet"', () => {
    let s = toggleWorried(p());
    expect(s.worriedOnly).toBe(true);
    s = toggleZone(s, 'temples');
    expect(s).toMatchObject({ zones: ['temples'], worriedOnly: false });
    s = toggleZone(s, 'temples');
    expect(s.zones).toEqual([]);
  });

  it('"not noticing it yet, but worried" clears the zones', () => {
    const s = toggleWorried(p({ zones: ['crown', 'top'] }));
    expect(s).toMatchObject({ zones: [], worriedOnly: true });
    expect(toggleWorried(s).worriedOnly).toBe(false);
  });

  it('describes the pattern in plain words', () => {
    expect(patternLine(p({ zones: ['temples'] }))).toBe('Pattern: temples first');
    expect(patternLine(p({ zones: ['hairline'] }))).toBe('Pattern: hairline first');
    expect(patternLine(p({ zones: ['crown'] }))).toBe('Pattern: crown first');
    expect(patternLine(p({ zones: ['temples', 'crown'] }))).toBe('Pattern: front and crown');
    expect(patternLine(p({ zones: ['allOver', 'crown'] }))).toBe('Pattern: diffuse thinning');
    expect(patternLine(p({ worriedOnly: true }))).toMatch(/No changes yet/);
  });
});

describe('multi-selects with an exclusive "none"', () => {
  it('none clears the rest, and anything else clears none', () => {
    expect(toggleMulti(['minoxidil', 'finasteride'], 'none', 'none')).toEqual(['none']);
    expect(toggleMulti(['none'], 'minoxidil', 'none')).toEqual(['minoxidil']);
    expect(toggleMulti(['minoxidil'], 'minoxidil', 'none')).toEqual([]);
  });
});

describe('under-18s', () => {
  it('are never offered prescription treatments', () => {
    expect(treatmentOptions(p({ age: 16 }))).not.toContain('finasteride');
    expect(treatmentOptions(p({ age: 16 }))).not.toContain('dutasteride');
    expect(treatmentOptions(p({ age: 16 }))).toContain('minoxidil');
    expect(treatmentOptions(p({ age: 18 }))).toContain('finasteride');
  });
});

describe('risk card', () => {
  it('fills in as steps are answered and counts relatives with loss', () => {
    const s = p({ zones: ['temples'], family: { father: { status: 'receding' }, mother: { status: 'full' } } });
    expect(familySummary(s)).toEqual({ answered: 2, withLoss: 1 });
    const card = riskCard(s, 3);
    expect(card.percent).toBe(33);
    expect(card.remaining).toBe(6);
    expect(card.line).toBe('Pattern: temples first. 1 of 2 relatives with loss');
  });

  it('ignores "not sure" relatives', () => {
    expect(familySummary(p({ family: { father: { status: 'unknown' } } }))).toEqual({ answered: 0, withLoss: 0 });
  });
});

describe('profile to forecast input', () => {
  it('maps ancestry choices to one model key', () => {
    expect(ancestryFor([])).toBeUndefined();
    expect(ancestryFor(['east_asian'])).toBe('east_asian');
    expect(ancestryFor(['white', 'black'])).toBe('mixed_or_other');
    expect(ancestryFor(['other'])).toBe('mixed_or_other');
  });

  it('picks the strongest treatment already used', () => {
    expect(treatmentFor([])).toBe('none');
    expect(treatmentFor(['ketoconazole'])).toBe('none');
    expect(treatmentFor(['minoxidil'])).toBe('minoxidil');
    expect(treatmentFor(['finasteride', 'minoxidil'])).toBe('finasteride+minoxidil');
    expect(treatmentFor(['dutasteride', 'minoxidil'])).toBe('dutasteride');
  });

  it('maps relatives the model knows, with typical ages when unknown', () => {
    const s = p({
      age: 24,
      family: {
        father: { status: 'receding', startAge: 30 },
        maternalGrandfather: { status: 'bald' },
        paternalGrandfather: { status: 'full' },
        brother: { status: 'thinning' },
        mother: { status: 'full' }, // not in the v0 model
        maternalUncle: { status: 'unknown' }, // skipped
      },
    });
    expect(relativesFor(s)).toEqual([
      { relation: 'father', status: 'thinning', age: 30 },
      { relation: 'maternal_grandfather', status: 'bald', age: 75 },
      { relation: 'paternal_grandfather', status: 'full', age: 75 },
      { relation: 'brother', status: 'thinning', age: 24 },
    ]);
  });

  it('is null until age is known, and runs through the forecast engine', () => {
    expect(toForecastInput(p())).toBeNull();
    const input = toForecastInput(
      p({ age: 24, ancestry: ['white'], family: { father: { status: 'bald', startAge: 30 } }, treatments: ['finasteride'] }),
    );
    expect(input).toMatchObject({ age: 24, ancestry: 'white', treatment: 'finasteride' });
    const f = new ForecastModel().forecast(input!, { years: [5], samples: 20_000 });
    expect(f.byYear[0].withTreatment).not.toBeNull();
    // A bald father raises risk compared with a father who kept his hair.
    const full = new ForecastModel().forecast(
      toForecastInput(p({ age: 24, family: { father: { status: 'full' } } }))!,
      { years: [5], samples: 20_000 },
    );
    expect(f.byYear[0].pNorwood3Plus).toBeGreaterThan(full.byYear[0].pNorwood3Plus);
  });
});
