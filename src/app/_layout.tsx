import { DarkTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { ProfileProvider } from "@/profile/ProfileProvider";
import { ScanProvider } from "@/scan/ScanProvider";
import { colors } from "@/theme";

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
      <ProfileProvider>
        <ScanProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="onboarding/index"
              options={{ gestureEnabled: false, animation: "fade" }}
            />
            <Stack.Screen name="onboarding/questions" />
            <Stack.Screen
              name="scan/session"
              options={{
                presentation: "fullScreenModal",
                gestureEnabled: false,
              }}
            />
            <Stack.Screen
              name="scan/[id]"
              options={{ presentation: "modal" }}
            />
          </Stack>
        </ScanProvider>
      </ProfileProvider>
    </ThemeProvider>
  );
}
