import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { PurchasesProvider } from '@/paywall/PurchasesProvider';
import { PlanProvider } from '@/plan/PlanProvider';
import { ProfileProvider } from '@/profile/ProfileProvider';
import { ForecastProvider } from '@/reveal/ForecastProvider';
import { ScanProvider } from '@/scan/ScanProvider';
import { colors } from '@/theme';

const theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.bg,
    primary: colors.accent,
    text: colors.text,
    border: colors.line,
  },
};

export default function RootLayout() {
  return (
    <ThemeProvider value={theme}>
      <StatusBar style="light" />
      <PurchasesProvider>
      <ProfileProvider>
        <PlanProvider>
        <ForecastProvider>
          <ScanProvider>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: colors.bg },
              }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="onboarding/index" options={{ gestureEnabled: false, animation: 'fade' }} />
              <Stack.Screen name="onboarding/questions" />
              <Stack.Screen name="reveal/analysing" options={{ gestureEnabled: false, animation: 'fade' }} />
              <Stack.Screen name="reveal/index" options={{ gestureEnabled: false, animation: 'fade' }} />
              <Stack.Screen name="paywall" options={{ presentation: 'modal', gestureEnabled: false }} />
              <Stack.Screen name="massage" options={{ presentation: 'fullScreenModal' }} />
              <Stack.Screen name="log" options={{ presentation: 'modal' }} />
              <Stack.Screen name="verdict" options={{ presentation: 'fullScreenModal' }} />
              <Stack.Screen name="share" options={{ presentation: 'modal' }} />
              <Stack.Screen
                name="scan/session"
                options={{
                  presentation: 'fullScreenModal',
                  gestureEnabled: false,
                }}
              />
              <Stack.Screen name="scan/[id]" options={{ presentation: 'modal' }} />
            </Stack>
          </ScanProvider>
        </ForecastProvider>
        </PlanProvider>
      </ProfileProvider>
      </PurchasesProvider>
    </ThemeProvider>
  );
}
