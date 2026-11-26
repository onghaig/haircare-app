import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import PaywallScreen from '@/app/paywall';
import { PurchasesProvider } from '@/paywall/PurchasesProvider';
import type { PurchaseService } from '@/paywall/purchases';
import { ProfileProvider } from '@/profile/ProfileProvider';
import { MemoryProfileStore } from '@/profile/store';
import { emptyProfile } from '@/profile/types';
import { MemoryLogStore } from '@/plan/log';
import { PlanProvider } from '@/plan/PlanProvider';
import { ForecastProvider } from '@/reveal/ForecastProvider';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissAll: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View };
});

function setup(service?: PurchaseService) {
  const store = new MemoryProfileStore({ ...emptyProfile(), age: 26, sex: 'male', zones: ['temples'] });
  const ui = (
    <PurchasesProvider service={service}>
      <ProfileProvider store={store}>
        <PlanProvider store={new MemoryLogStore()}>
          <ForecastProvider samples={3000}>
            <PaywallScreen />
          </ForecastProvider>
        </PlanProvider>
      </ProfileProvider>
    </PurchasesProvider>
  );
  return { store, ui };
}

beforeEach(() => jest.clearAllMocks());

describe('Paywall', () => {
  it('pre-selects annual, states the trial end, and marks a test build', async () => {
    await render(setup().ui);
    expect(screen.getByRole('radio', { name: /^Annual/ })).toBeSelected();
    expect(screen.getByText('$0.96')).toBeOnTheScreen();
    expect(screen.getByText(/^Free until \d{1,2} \w{3}\. We'll remind you the day before\. Cancel in one tap\.$/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Start free trial' })).toBeOnTheScreen();
    expect(screen.getByTestId('test-purchase-note')).toBeOnTheScreen();
    expect(screen.queryByRole('radio', { name: /^Monthly/ })).toBeNull();
  });

  it('switches to weekly, and shows monthly under more options', async () => {
    await render(setup().ui);
    await fireEvent.press(screen.getByRole('radio', { name: /^Weekly/ }));
    expect(screen.getByRole('button', { name: 'Subscribe for $6.99 a week' })).toBeOnTheScreen();
    expect(screen.getByText('Cancel in one tap, any time.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'More options' }));
    expect(screen.getByRole('radio', { name: /^Monthly/ })).toBeOnTheScreen();
  });

  it('starts the trial, saves the subscription and returns to the app', async () => {
    const { store, ui } = setup();
    await render(ui);
    await fireEvent.press(screen.getByRole('button', { name: 'Start free trial' }));
    await waitFor(() => expect(router.dismissAll).toHaveBeenCalled());
    expect((await store.load()).subscription).toMatchObject({ plan: 'annual', test: true });
  });

  it('closes without buying', async () => {
    const { store, ui } = setup();
    await render(ui);
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(router.dismissAll).toHaveBeenCalled();
    expect((await store.load()).subscription).toBeUndefined();
  });

  it('says plainly when a purchase fails, and stays open', async () => {
    const failing: PurchaseService = {
      isTest: false,
      purchase: jest.fn(async () => Promise.reject(new Error('Payment declined. You have not been charged.'))),
    };
    await render(setup(failing).ui);
    expect(screen.queryByTestId('test-purchase-note')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Start free trial' }));
    expect(await screen.findByText('Payment declined. You have not been charged.')).toBeOnTheScreen();
    expect(router.dismissAll).not.toHaveBeenCalled();
  });
});
