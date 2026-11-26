import { Text as RNText, type TextProps } from 'react-native';

import { colors, type ColorToken, type as typeScale, type TypeVariant } from '@/theme';

export type AppTextProps = TextProps & { variant?: TypeVariant; color?: ColorToken };

export function Text({ variant = 'body', color = 'text', style, ...rest }: AppTextProps) {
  return <RNText {...rest} style={[typeScale[variant], { color: colors[color] }, style]} />;
}
