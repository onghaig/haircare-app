import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { spacing } from '@/theme';
import { useAiPreview } from '@/visualize/useAiPreview';

import { FuturePreview } from './FuturePreview';

/**
 * "You in N years": the user's own photo, AI-restyled to the forecast's stage, when they've agreed
 * to it; the drawn illustration otherwise. Locked previews stay blurred either way.
 */
export function FutureLook({ stage, age, years, locked }: { stage: number; age: number; years: number; locked: boolean }) {
  const ai = useAiPreview(stage, years);
  return (
    <View style={{ gap: spacing.sm }}>
      <FuturePreview stage={stage} age={age} locked={locked} photoUri={ai.status === 'ready' ? ai.uri : undefined} />
      {ai.status === 'off' && ai.availability === 'needs-consent' ? (
        <Link label="Show the hair change with AI" onPress={() => router.push('/ai-preview')} />
      ) : null}
      {ai.status === 'off' && ai.availability === 'declined' ? (
        <Link label="AI preview is off. Turn it on" onPress={() => router.push('/ai-preview')} muted />
      ) : null}
      {ai.status === 'loading' ? (
        <Text variant="caption" color="textMuted" accessibilityLiveRegion="polite" testID="ai-preview-loading">
          Making your AI preview. This takes about 10 to 20 seconds.
        </Text>
      ) : null}
      {ai.status === 'error' ? (
        <View style={styles.row}>
          <Text variant="caption" color="warning" style={{ flex: 1 }}>
            {`Couldn’t make your AI preview: ${ai.message}`}
          </Text>
          <Link label="Try again" onPress={ai.retry} />
        </View>
      ) : null}
    </View>
  );
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
