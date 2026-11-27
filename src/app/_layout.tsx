import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { PurchasesProvider } from '@/paywall/PurchasesProvider';
import { PlanProvider } from '@/plan/PlanProvider';
import { ReminderSync } from '@/plan/ReminderSync';
import { ProfileProvider } from '@/profile/ProfileProvider';
import { ForecastProvider } from '@/reveal/ForecastProvider';
import { ScanProvider } from '@/scan/ScanProvider';
import { AiPreviewProvider } from '@/visualize/AiPreviewProvider';
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
        <AiPreviewProvider>
        <ScanProvider>
          <ForecastProvider>
            <ReminderSync />
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
              <Stack.Screen name="privacy" options={{ presentation: 'modal' }} />
              <Stack.Screen name="settings/index" />
              <Stack.Screen name="settings/[step]" />
              <Stack.Screen name="coach" />
              <Stack.Screen name="products" options={{ presentation: 'modal' }} />
              <Stack.Screen name="options/index" />
              <Stack.Screen name="options/how" />
              <Stack.Screen name="options/[id]" options={{ presentation: 'modal' }} />
              <Stack.Screen name="ai-preview" options={{ presentation: 'modal' }} />
              <Stack.Screen name="styles/index" />
              <Stack.Screen name="styles/[id]" />
              <Stack.Screen name="transplant" />
              <Stack.Screen
                name="scan/session"
                options={{
                  presentation: 'fullScreenModal',
                  gestureEnabled: false,
                }}
              />
              <Stack.Screen name="scan/[id]" options={{ presentation: 'modal' }} />
              <Stack.Screen name="scan/upload" options={{ presentation: 'modal' }} />
              <Stack.Screen name="scan/panorama" options={{ presentation: 'fullScreenModal' }} />
            </Stack>
          </ForecastProvider>
        </ScanProvider>
        </AiPreviewProvider>
        </PlanProvider>
      </ProfileProvider>
      </PurchasesProvider>
    </ThemeProvider>
  );
}
