import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { spacing } from '@/theme';
import { MONTHLY_AI_CAP } from '@/visualize/preview';
import { useAiPreview } from '@/visualize/useAiPreview';

import { FuturePreview } from './FuturePreview';

/**
 * "You in N years": for subscribers who agreed, their own photo AI-restyled to the forecast's
 * stage. Everyone else sees the free preview made on the phone. Locked previews stay blurred.
 */
export function FutureLook({ stage, age, years, locked }: { stage: number; age: number; years: number; locked: boolean }) {
  const ai = useAiPreview(stage, years);
  return (
    <View style={{ gap: spacing.sm }}>
      <FuturePreview stage={stage} age={age} locked={locked} photoUri={ai.status === 'ready' ? ai.uri : undefined} />
      {ai.status === 'off' && ai.availability === 'needs-consent' ? (
        <Link label="Show the hair change with AI" onPress={() => router.push('/ai-preview')} />
      ) : null}
      {ai.status === 'off' && ai.availability === 'locked' && !locked ? (
        <Link label="See it as a real AI picture with Premium" onPress={() => router.push('/paywall')} muted />
      ) : null}
      {ai.status === 'off' && ai.availability === 'capped' ? (
        <Text variant="caption" color="textMuted">{`You’ve made this month’s ${MONTHLY_AI_CAP} AI pictures. More next month.`}</Text>
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
