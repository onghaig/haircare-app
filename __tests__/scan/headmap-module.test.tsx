import { render, screen } from '@testing-library/react-native';

import {
  analyzeImageAsync,
  HeadMapCameraView,
  isHeadMapAvailable,
  MEAN_INTER_PUPIL_MM,
  requestCameraPermissionAsync,
  SCAN_VIEWS,
} from '@modules/headmap';

// Under Jest there is no native module, the same as Expo Go or web.
describe('HeadMap module without a native build', () => {
  it('reports itself unavailable and keeps the 63 mm default', () => {
    expect(isHeadMapAvailable).toBe(false);
    expect(MEAN_INTER_PUPIL_MM).toBe(63);
  });

  it('rejects calls with a message that says what to do', () => {
    expect(() => requestCameraPermissionAsync()).toThrow(/development build/);
    expect(() => analyzeImageAsync('file:///x.jpg')).toThrow(/development build/);
  });

  it('renders a clear fallback instead of a blank camera', async () => {
    await render(<HeadMapCameraView view="front" />);
    expect(screen.getByText(/needs a development build/)).toBeOnTheScreen();
  });

  it('lists the five views in scan order', () => {
    expect(SCAN_VIEWS).toEqual(['front', 'leftTemple', 'rightTemple', 'top', 'crown']);
  });
});
