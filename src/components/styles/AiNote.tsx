import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { spacing } from '@/theme';
import { MONTHLY_AI_CAP } from '@/visualize/preview';
import type { AiPreviewState } from '@/visualize/useAiPreview';

/** The line under an AI picture: ask first, say it's working, or say what went wrong. */
export function AiNote({ ai, offer = 'Show it on your photo with AI' }: { ai: AiPreviewState; offer?: string }) {
  if (ai.status === 'off' && ai.availability === 'needs-consent') return <Link label={offer} onPress={() => router.push('/ai-preview')} />;
  if (ai.status === 'off' && ai.availability === 'locked') {
    return <Link label="Unlock to see the real AI picture" onPress={() => router.push('/paywall')} />;
  }
  if (ai.status === 'off' && ai.availability === 'capped') {
    return (
      <Text variant="caption" color="textMuted" testID="ai-capped">
        {`You’ve made this month’s ${MONTHLY_AI_CAP} AI pictures. More next month.`}
      </Text>
    );
  }
  if (ai.status === 'off' && ai.availability === 'declined') return <Link label="AI preview is off. Turn it on" onPress={() => router.push('/ai-preview')} muted />;
  if (ai.status === 'loading') {
    return (
      <Text variant="caption" color="textMuted" accessibilityLiveRegion="polite" testID="ai-loading">
        Making your AI picture. About 10 to 20 seconds.
      </Text>
    );
  }
  if (ai.status === 'error') {
    return (
      <View style={styles.row}>
        <Text variant="caption" color="warning" style={{ flex: 1 }}>
          {`Couldn’t make it: ${ai.message}`}
        </Text>
        <Link label="Try again" onPress={ai.retry} />
      </View>
    );
  }
  return null;
}

function Link({ label, onPress, muted }: { label: string; onPress: () => void; muted?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8} style={styles.link}>
      <Text variant="caption" color={muted ? 'textMuted' : 'accent'} style={{ fontWeight: '700' }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  link: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
});
