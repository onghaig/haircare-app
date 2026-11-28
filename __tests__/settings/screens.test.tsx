import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';

import EditAnswerScreen from '@/app/settings/[step]';
import SettingsScreen from '@/app/settings/index';
import { ForecastModel } from '@/forecast';
import { MemoryLogStore } from '@/plan/log';
import { PlanProvider } from '@/plan/PlanProvider';
import { ProfileProvider } from '@/profile/ProfileProvider';
import { MemoryProfileStore } from '@/profile/store';
import { emptyProfile, type Profile } from '@/profile/types';
import { ForecastProvider, useForecast } from '@/reveal/ForecastProvider';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissAll: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

const onboarded: Partial<Profile> = {
  age: 28,
  sex: 'male',
  zones: ['temples'],
  family: { father: { status: 'bald' } },
  treatments: ['minoxidil'],
  sleep: 'ok',
  completedAt: '2026-11-01T00:00:00Z',
};

/** Profile, plan and forecast, without scans, so the forecast runs from the profile alone. */
function setup(seed: Partial<Profile> = onboarded) {
  const store = new MemoryProfileStore({ ...emptyProfile(), ...seed });
  const saves = jest.spyOn(store, 'save');
  const wrap = (ui: ReactNode) => (
    <ProfileProvider store={store}>
      <PlanProvider store={new MemoryLogStore({})}>
        <ForecastProvider samples={500}>{ui}</ForecastProvider>
      </PlanProvider>
    </ProfileProvider>
  );
  return { store, saves, wrap };
}

function PlanNames() {
  const { plan, forecast } = useForecast();
  return <>{forecast ? <TestText>{`plan:${plan.map((p) => p.option).join(',')}`}</TestText> : null}</>;
}
const TestText = ({ children }: { children: string }) => {
  const { Text } = jest.requireActual('react-native');
  return <Text>{children}</Text>;
};

beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.restoreAllMocks());

describe('Settings', () => {
  it('shows what you use now and every onboarding answer to change', async () => {
    const { wrap } = setup();
    await render(wrap(<SettingsScreen />));
    expect(await screen.findByTestId('settings-treatments')).toHaveTextContent('Minoxidil');
    expect(screen.getByRole('button', { name: 'Change age and sex' })).toHaveTextContent(/28, Male/);
    expect(screen.getByRole('button', { name: 'Change family' })).toHaveTextContent(/1 of 1 relatives with hair loss/);
    await fireEvent.press(screen.getByRole('button', { name: 'Update what I’m doing' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/settings/[step]', params: { step: 'treatments' } });
    await fireEvent.press(screen.getByRole('button', { name: 'Change your goal' }));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/settings/[step]', params: { step: 'goal' } });
  });
});

describe('Changing an answer', () => {
  it('edits a copy, saves once, and the forecast re-runs once with the new plan', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ step: 'treatments' });
    const run = jest.spyOn(ForecastModel.prototype, 'forecast');
    const { store, saves, wrap } = setup();
    await render(
      wrap(
        <>
          <EditAnswerScreen />
          <PlanNames />
        </>,
      ),
    );
    expect(await screen.findByText('plan:minoxidil', {}, { timeout: 8000 })).toBeOnTheScreen();
    const runsBefore = run.mock.calls.length;
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    // Several taps: nothing is saved and the forecast doesn't re-run.
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Finasteride' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Minoxidil' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Minoxidil' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Minoxidil' }));
    expect(saves).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 20));
    expect(run.mock.calls.length).toBe(runsBefore);

    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(saves).toHaveBeenCalledTimes(1);
    expect((await store.load()).treatments).toEqual(['finasteride']);
    expect((await store.load()).sleep).toBe('ok');
    expect(await screen.findByText('plan:finasteride', {}, { timeout: 8000 })).toBeOnTheScreen();
    expect(run.mock.calls.length).toBe(runsBefore + 1);
  });

  it('won’t save an age outside the range', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ step: 'basics' });
    const { saves, wrap } = setup();
    await render(wrap(<EditAnswerScreen />));
    await fireEvent.changeText(await screen.findByLabelText('Your age'), '9');
    expect(screen.getByText('Haircare is for ages 13 to 90.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Your age'), '31');
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saves).toHaveBeenCalledTimes(1));
  });

  it('under-18s are not offered prescription treatments', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ step: 'treatments' });
    const { wrap } = setup({ ...onboarded, age: 16 });
    await render(wrap(<EditAnswerScreen />));
    expect(await screen.findByRole('checkbox', { name: 'Minoxidil' })).toBeOnTheScreen();
    expect(screen.queryByRole('checkbox', { name: 'Finasteride' })).toBeNull();
  });

  it('an unknown question shows a plain message', async () => {
    jest.mocked(useLocalSearchParams).mockReturnValue({ step: 'nope' });
    const { wrap } = setup();
    await render(wrap(<EditAnswerScreen />));
    expect(await screen.findByText('This question doesn’t exist.')).toBeOnTheScreen();
  });
});
