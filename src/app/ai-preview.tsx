import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, Text } from '@/components/ui';
import { isMinor } from '@/profile/onboarding';
import { useProfile } from '@/profile/ProfileProvider';
import { colors, spacing } from '@/theme';
import { useAiPreviewServices } from '@/visualize/AiPreviewProvider';

/**
 * Consent for the AI "future you" preview. It's the only feature where a face photo leaves the
 * phone, so it says exactly what happens before anything is sent, and turning it off deletes
 * what was made.
 */
export default function AiPreviewConsentScreen() {
  const { profile, update } = useProfile();
  const { store } = useAiPreviewServices();
  const on = !!profile.aiPreview?.consentAt;

  if (isMinor(profile)) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          <Text variant="title">Not available under 18</Text>
          <Button label="Back" variant="secondary" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  async function agree() {
    await update((p) => ({ ...p, aiPreview: { consentAt: new Date().toISOString() } }));
    router.back();
  }

  async function decline() {
    // Turning it off also deletes every preview made so far.
    store.removeAll();
    await update((p) => ({ ...p, aiPreview: { declinedAt: new Date().toISOString() } }));
    router.back();
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="title" accessibilityRole="header">
          See it on your own photo
        </Text>
        <Text color="textMuted">
          Instead of a drawing, an AI image model redraws your hair on your own photo at the stage your forecast
          shows as most likely for that year.
        </Text>
        <Card style={styles.points}>
          <Point title="Your photo leaves your phone for this">
            Your latest front scan photo, shrunk to 768 pixels, is sent to our preview service, which passes it to
            Google’s Gemini image model. Only your hair is changed.
          </Point>
          <Point title="Nothing is kept on the server">
            The photo is used for that one request and not stored. The result is saved only on this phone.
          </Point>
          <Point title="It’s an illustration">
            It shows what the forecast’s most likely stage could look like on you. It isn’t a medical prediction
            or a diagnosis.
          </Point>
          <Point title="You can turn it off">
            Turning it off here deletes every AI preview from this phone. Deleting a scan deletes the previews made
            from it.
          </Point>
        </Card>
        {on ? (
          <Button label="Turn off AI previews" variant="secondary" onPress={decline} />
        ) : (
          <>
            <Button label="Agree and make my preview" onPress={agree} />
            <Button label="Not now" variant="secondary" onPress={decline} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Point({ title, children }: { title: string; children: string }) {
  return (
    <View style={{ gap: 2 }}>
      <Text style={{ fontWeight: '700' }}>{title}</Text>
      <Text variant="caption" color="textMuted">
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md },
  points: { gap: spacing.md },
});
