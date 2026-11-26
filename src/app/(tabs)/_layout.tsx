import { Redirect } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';

import { TABS } from '@/navigation/tabs';
import { useProfile } from '@/profile/ProfileProvider';
import { colors } from '@/theme';

/** Native tab bar (UITabBarController on iOS, Material bottom navigation on Android). */
export default function TabsLayout() {
  const { loaded, onboarded } = useProfile();
  // New users start with onboarding; until the profile has loaded, show nothing (the splash is up).
  if (!loaded) return null;
  if (!onboarded) return <Redirect href="/onboarding" />;
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
