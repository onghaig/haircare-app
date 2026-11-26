import { NativeTabs } from 'expo-router/native-tabs';

import { TABS } from '@/navigation/tabs';
import { colors } from '@/theme';

/** Native tab bar (UITabBarController on iOS, Material bottom navigation on Android). */
export default function TabsLayout() {
  return (
    <NativeTabs
      backgroundColor={colors.bg}
      tintColor={colors.accent}
      iconColor={{ default: colors.textMuted, selected: colors.accent }}
      labelStyle={{ default: { color: colors.textMuted }, selected: { color: colors.accent } }}
      indicatorColor={colors.surfaceRaised}>
      {TABS.map((t) => (
        <NativeTabs.Trigger key={t.route} name={t.route}>
          <NativeTabs.Trigger.Label>{t.label}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={t.sf} md={t.md} />
        </NativeTabs.Trigger>
      ))}
    </NativeTabs>
  );
}
