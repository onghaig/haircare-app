import { milestoneAges, stageAt, twoFuturesAt } from '@/predict/twoFutures';
import { clinicReferralUrl, referralLink, restoredStage } from '@/referral/clinics';
import { rankedStyles, styleById, styleFit, STYLES } from '@/styles/catalog';
import { restoreJob, styleJob } from '@/styles/jobs';
import { requestBody } from '@/visualize/provider';
import type { Forecast } from '@/forecast';

import { STYLE_IDS } from '../../server/visualize/src/styles';

const fit = (id: string, stage: number, zones: ('temples' | 'crown')[] = []) => styleFit(styleById(id)!, stage, { zones }).verdict;

describe('hairstyle fit', () => {
  it('matches the preview service’s list exactly', () => {
    expect(STYLES.map((s) => s.id).sort()).toEqual([...STYLE_IDS].sort());
  });

  it('a full hairline can carry anything', () => {
    for (const s of STYLES) expect(styleFit(s, 1, { zones: [] }).verdict).not.toBe('shows');
  });

  it('flags styles that show recession once the temples go', () => {
    expect(fit('slick', 2)).toBe('shows');
    expect(fit('quiff', 3)).toBe('shows');
    expect(fit('crop', 2)).toBe('hides');
    expect(fit('fringe', 3, ['temples'])).toBe('hides');
  });

  it('short and shaved cuts hide thinning further on; fringes stop working', () => {
    expect(fit('buzz', 5)).toBe('hides');
    expect(fit('shaved', 6)).toBe('hides');
    expect(fit('crop', 5)).toBe('shows');
    expect(fit('fringe', 4)).toBe('shows');
    expect(fit('crop', 4)).toBe('hides');
  });

  it('a thin crown counts against longer styles even with a good front', () => {
    expect(fit('sidepart', 1, ['crown'])).toBe('shows');
    expect(fit('crew', 1, ['crown'])).toBe('works');
  });

  it('ranks hiders first and showers last', () => {
    const r = rankedStyles(4).map((x) => x.fit.verdict);
    expect(r).toEqual([...r].sort((a, b) => ['hides', 'works', 'shows'].indexOf(a) - ['hides', 'works', 'shows'].indexOf(b)));
    expect(r[0]).toBe('hides');
    expect(r.at(-1)).toBe('shows');
  });
});

describe('AI jobs', () => {
  it('sends only an id and the stage for a style, and files it per style', () => {
    const job = styleJob('crop', 3.3);
    expect(job).toEqual({ name: 'style-crop', request: { kind: 'style', style: 'crop', stage: 3.5 } });
    expect(requestBody({ ...job.request, imageBase64: 'QQ==' } as never)).toEqual({ image: 'QQ==', kind: 'style', style: 'crop', stage: 3.5 });
  });

  it('a restore job is per half stage, and the future body is unchanged', () => {
    expect(restoreJob(4.2).name).toBe('restore-s4.0');
    expect(requestBody({ kind: 'restore', imageBase64: 'QQ==', stage: 4 })).toEqual({ image: 'QQ==', kind: 'restore', stage: 4 });
    expect(requestBody({ imageBase64: 'QQ==', stage: 3, years: 5 })).toEqual({ image: 'QQ==', stage: 3, years: 5 });
  });
});

describe('two futures', () => {
  it('compares at round ages within 15 years', () => {
    expect(milestoneAges(25)).toEqual([30, 35, 40]);
    expect(milestoneAges(28)).toEqual([30, 35, 40]);
    expect(milestoneAges(30)).toEqual([35, 40, 45]);
    expect(milestoneAges(34)).toEqual([35, 40, 45]);
    expect(milestoneAges(60, 3)).toEqual([]);
  });

  const year = (years: number, untreated: number, plan: number | null) => ({
    years,
    age: 25 + years,
    untreated: { p10: untreated, p50: untreated, p90: untreated },
    withTreatment: plan == null ? null : { p10: plan, p50: plan, p90: plan },
  });
  const f = { ageNow: 25, byYear: [year(1, 2, 2), year(5, 3, 2.2), year(10, 4, 2.6), year(15, 5, 3)] } as unknown as Forecast;

  it('reads each path between the forecast’s years', () => {
    expect(stageAt(f, 5, 'untreated')).toBe(3);
    expect(stageAt(f, 7.5, 'untreated')).toBeCloseTo(3.5);
    expect(twoFuturesAt(f, 35)).toEqual({ age: 35, years: 10, untreated: 4, plan: 2.6 });
  });

  it('has no second future without a plan that changes the path', () => {
    const none = { ageNow: 25, byYear: [year(1, 2, null), year(15, 5, null)] } as unknown as Forecast;
    expect(twoFuturesAt(none, 30)).toBeNull();
  });
});

describe('clinic referral', () => {
  it('is a placeholder until a partner link is set, and must be https', () => {
    expect(clinicReferralUrl({ clinicReferralUrl: '' })).toBeNull();
    expect(clinicReferralUrl({ clinicReferralUrl: 'http://x.test' })).toBeNull();
    expect(clinicReferralUrl({ clinicReferralUrl: 'https://partner.test/find' })).toBe('https://partner.test/find');
  });

  it('passes only a loss band, never the photo or profile', () => {
    expect(referralLink('https://partner.test/find', 3.5)).toBe('https://partner.test/find?source=haircare&loss=moderate');
    expect(referralLink('https://partner.test/find?a=1', 6)).toBe('https://partner.test/find?a=1&source=haircare&loss=advanced');
  });

  it('draws a less full result the further loss has gone', () => {
    expect(restoredStage(2)).toBeLessThan(restoredStage(4));
    expect(restoredStage(4)).toBeLessThan(restoredStage(6));
  });
});
