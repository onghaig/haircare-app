import { roleOf } from '@/forecast';
import { groupedOptions, inPlan, OPTIONS, optionById, optionPlan, showsRx, visibleOptions } from '@/options/catalog';
import { emptyProfile, type Profile } from '@/profile/types';

const p = (o: Partial<Profile>): Profile => ({ ...emptyProfile(), ...o });

describe('options catalogue', () => {
  it('every counted option matches what the model does with it', () => {
    for (const o of OPTIONS) {
      const roles = new Set(o.items.map(roleOf));
      if (o.role === 'none') expect(o.items).toHaveLength(0);
      if (o.role === 'slows') expect([...roles]).toEqual(['slows']);
      if (o.role === 'grows') expect([...roles]).toEqual(['grows']);
      if (o.role === 'both') expect(roles).toEqual(new Set(['slows', 'grows']));
    }
  });

  it('prescriptions are never shown to under-18s', () => {
    const teen = p({ age: 16 });
    expect(showsRx(teen)).toBe(false);
    expect(visibleOptions(teen).some((o) => o.rx)).toBe(false);
    expect(visibleOptions(teen).map((o) => o.id)).toEqual(['massage', 'ketoconazole', 'habits']);
  });

  it('adults see prescriptions by default, grouped by what they do', () => {
    const adult = p({ age: 24 });
    expect(showsRx(adult)).toBe(true);
    const groups = groupedOptions(adult);
    expect(groups.map((g) => g.role)).toEqual(['slows', 'grows', 'both']);
    expect(groups[0].options.map((o) => o.id)).toEqual(['finasteride', 'dutasteride']);
    expect(groups[1].options.map((o) => o.id)).toEqual(['minoxidil', 'oral_minoxidil', 'massage']);
  });

  it('never recommends, ranks or says "best for you"', () => {
    const copy = JSON.stringify(OPTIONS).toLowerCase();
    expect(copy).not.toMatch(/recommend|best for you|you should/);
  });

  it('marks every prescription-only option Rx and gives who it is not for', () => {
    for (const id of ['finasteride', 'dutasteride', 'oral_minoxidil', 'fin_minox'] as const) {
      expect(optionById(id).rx).toBe(true);
      expect(optionById(id).notFor).toMatch(/Under 18s/);
    }
    expect(optionById('minoxidil').rx).toBe(false);
  });

  it('an option is in the plan when every part of it is being done', () => {
    const combo = optionById('fin_minox');
    expect(inPlan(combo, [{ option: 'minoxidil', adherence: 0.9 }])).toBe(false);
    expect(inPlan(combo, optionPlan(combo))).toBe(true);
    expect(inPlan(optionById('habits'), [])).toBe(false);
  });
});
