import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ForecastModel } from '@/forecast';
import { MemoryLogStore } from '@/plan/log';
import { PlanProvider } from '@/plan/PlanProvider';
import { ProfileProvider } from '@/profile/ProfileProvider';
import { MemoryProfileStore } from '@/profile/store';
import { emptyProfile, type Profile } from '@/profile/types';
import { ForecastProvider, useForecast } from '@/reveal/ForecastProvider';
import { ScanProvider } from '@/scan/ScanProvider';
import { SCAN_ORDER } from '@/scan/session';
import { MemoryScanStore } from '@/scan/store';
import type { ScanRecord } from '@/scan/session';

import { record } from '../../test-utils/scanFixtures';

const answers: Partial<Profile> = { age: 26, sex: 'male', zones: ['temples'] };
const firstScan = record('first', '2026-11-26T10:05:00Z', {
  views: Object.fromEntries(SCAN_ORDER.map((v) => [v, { uri: `file:///scans/first/${v}.heic`, score: 90 }])),
});

function Probe() {
  const { forecast } = useForecast();
  return <Text>{forecast ? 'forecast ready' : 'no forecast'}</Text>;
}

async function mount(seed: Partial<Profile>, scans: ScanRecord[]) {
  await render(
    <ProfileProvider store={new MemoryProfileStore({ ...emptyProfile(), ...seed })}>
      <PlanProvider store={new MemoryLogStore()}>
        <ScanProvider store={new MemoryScanStore(scans)}>
          <ForecastProvider samples={2000}>
            <Probe />
          </ForecastProvider>
        </ScanProvider>
      </PlanProvider>
    </ProfileProvider>,
  );
  await act(async () => {
    jest.runAllTimers();
  });
}

describe('ForecastProvider', () => {
  let run: jest.SpyInstance;
  beforeEach(() => {
    jest.useFakeTimers();
    run = jest.spyOn(ForecastModel.prototype, 'forecast');
  });
  afterEach(() => {
    run.mockRestore();
    jest.useRealTimers();
  });

  it('does not run the forecast during onboarding, so answering never blocks the next tap', async () => {
    await mount(answers, []);
    expect(run).not.toHaveBeenCalled();
    expect(screen.getByText('no forecast')).toBeOnTheScreen();
  });

  it('waits for the first scan after onboarding', async () => {
    await mount({ ...answers, completedAt: '2026-11-26T10:00:00Z' }, []);
    expect(run).not.toHaveBeenCalled();
  });

  it('runs once onboarding and the first scan are done', async () => {
    await mount({ ...answers, completedAt: '2026-11-26T10:00:00Z' }, [firstScan]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(screen.getByText('forecast ready')).toBeOnTheScreen();
  });
});
