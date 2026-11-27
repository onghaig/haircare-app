import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { crownEstimate, crownEstimateText, reviewNote, type CrownAction, type CrownState } from '@/scan/crown';
import { colors, radius, spacing } from '@/theme';

import { PromptCard } from './ScanHud';

/** The bottom of the scan screen for the crown: one overhead photo on a short countdown. */
export function CrownPanel({ state, dispatch }: { state: CrownState; dispatch: (a: CrownAction) => void }) {
  switch (state.step) {
    case 'ready':
      return (
        <View style={styles.gap}>
          <PromptCard
            prompt={{
              title: 'Hold the phone up high',
              detail: 'Tap Start, then lift the phone straight above your head with the back camera pointing down at your crown. It counts down out loud and takes the photo.',
              tone: 'ready',
              voice: '',
            }}
          />
          <Button label="Start" onPress={() => dispatch({ type: 'start' })} />
          <Button label="Someone’s helping: take photo now" variant="secondary" onPress={() => dispatch({ type: 'shootNow' })} />
        </View>
      );
    case 'countdown':
      return (
        <View style={styles.gap}>
          <PromptCard prompt={{ title: 'Lift it up high', detail: 'Back camera pointing down at your crown. Hold still when the count ends.', tone: 'ready', voice: '' }} />
          <Button label="Take photo now" variant="secondary" onPress={() => dispatch({ type: 'shootNow' })} />
          <Button label="Cancel" variant="secondary" onPress={() => dispatch({ type: 'reset' })} />
        </View>
      );
    case 'burst':
      return <PromptCard prompt={{ title: 'Hold still', detail: 'Taking your crown photo…', tone: 'ready', voice: '' }} />;
    case 'review':
      return null;
  }
}

/** Full-screen check of the kept crown photo before it goes into the scan. */
export function CrownReview({ state, onKeep, onRetake }: { state: CrownState; onKeep: () => void; onRetake: () => void }) {
  if (state.step !== 'review' || !state.result) return null;
  const note = reviewNote(state.result);
  // Density from this one photo, shown only when the photo itself is usable.
  const estimate = note.good ? crownEstimate(state.result.report?.hairGrid) : null;
  const est = estimate ? crownEstimateText(estimate) : null;
  return (
    <View style={styles.review} testID="crown-review">
      <Text variant="title" accessibilityRole="header">
        Check your crown photo
      </Text>
      <Image source={{ uri: state.result.uri }} style={styles.photo} contentFit="cover" accessibilityLabel="Your crown photo" />
      <View style={[styles.note, { borderColor: note.good ? colors.accentDim : colors.warning }]}>
        <Text variant="headline">{note.title}</Text>
        <Text variant="caption" color="textMuted">
          {note.detail}
        </Text>
      </View>
      {est ? (
        <View style={[styles.note, { borderColor: colors.line }]} testID="crown-estimate">
          <Text variant="headline">{est.title}</Text>
          <Text variant="caption" color="textMuted">
            {`${est.detail} An estimate from one photo, not a diagnosis.`}
          </Text>
        </View>
      ) : null}
      <Button label="Keep this photo" onPress={onKeep} />
      <Button label="Retake crown photo" variant="secondary" onPress={onRetake} />
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.sm },
  review: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    padding: spacing.xl,
    paddingTop: spacing.xxl * 2,
    gap: spacing.md,
  },
  photo: { flex: 1, borderRadius: radius.lg, backgroundColor: colors.surfaceRaised },
  note: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: 4, backgroundColor: colors.surface },
});
