import { fireEvent, render, screen } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';

import { Button, Text } from '@/components/ui';
import { colors } from '@/theme';

describe('Button', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls onPress and fires a light haptic', async () => {
    const onPress = jest.fn();
    await render(<Button label="Start weekly scan" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Start weekly scan' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
  });

  it('does nothing when disabled', async () => {
    const onPress = jest.fn();
    await render(<Button label="Continue" onPress={onPress} disabled />);
    const btn = screen.getByRole('button', { name: 'Continue' });
    expect(btn).toBeDisabled();
    await fireEvent.press(btn);
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('Text', () => {
  it('applies the variant and colour tokens', async () => {
    await render(<Text variant="title" color="accent">Holding steady</Text>);
    expect(screen.getByText('Holding steady')).toHaveStyle({ fontSize: 28, color: colors.accent });
  });
});
