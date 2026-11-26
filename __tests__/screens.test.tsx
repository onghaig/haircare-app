import { render, screen } from '@testing-library/react-native';

import AskScreen from '@/app/(tabs)/ask';
import TodayScreen from '@/app/(tabs)/index';
import PredictScreen from '@/app/(tabs)/predict';
import ProgressScreen from '@/app/(tabs)/progress';
import ScanScreen from '@/app/(tabs)/scan';
import { ScanProvider } from '@/scan/ScanProvider';
import { MemoryScanStore } from '@/scan/store';

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

describe.each([
  ['Today', TodayScreen],
  ['Scan', ScanScreen],
  ['Progress', ProgressScreen],
  ['Predict', PredictScreen],
  ['Ask', AskScreen],
])('%s tab', (title, Component) => {
  it('renders its title as a header', async () => {
    await render(
      <ScanProvider store={new MemoryScanStore()}>
        <Component />
      </ScanProvider>,
    );
    expect(screen.getByRole('header', { name: title })).toBeOnTheScreen();
  });
});
