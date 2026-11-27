import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Button, Text } from '@/components/ui';
import { AIM_VOICE, reviewNote, type CrownAction, type CrownState } from '@/scan/crown';
import { colors, radius, spacing } from '@/theme';

import { PromptCard } from './ScanHud';

/** The bottom of the scan screen for the crown: pick a way, then the solo or helper steps. */
export function CrownPanel({
  state,
  dispatch,
  onShutter,
}: {
  state: CrownState;
  dispatch: (a: CrownAction) => void;
  onShutter: () => void;
}) {
  switch (state.step) {
    case 'choose':
      return (
        <View style={styles.gap}>
          <PromptCard
            prompt={{
              title: 'How are you taking the crown photo?',
              detail: 'On your own, the phone talks you into place and keeps the best of a quick burst. With a helper, they line it up on screen.',
              tone: 'ready',
              voice: '',
            }}
          />
          <Button label="On my own" onPress={() => dispatch({ type: 'choose', mode: 'solo' })} />
          <Button label="Someone’s helping me" variant="secondary" onPress={() => dispatch({ type: 'choose', mode: 'helper' })} />
        </View>
      );
    case 'countdown':
      return (
        <View style={styles.gap}>
          <PromptCard
            prompt={{
              title: 'Get the phone behind your head',
              detail: 'Camera facing your crown, about 30 cm away. Listen for directions.',
              tone: 'ready',
              voice: '',
            }}
          />
          <Button label="Take it now" variant="secondary" onPress={() => dispatch({ type: 'shootNow' })} />
          <Button label="Cancel" variant="secondary" onPress={() => dispatch({ type: 'switchMode' })} />
        </View>
      );
    case 'aiming':
      return (
        <View style={styles.gap}>
          <PromptCard
            prompt={{
              title: state.hint ? AIM_VOICE[state.hint] : 'Finding your crown',
              detail: 'The burst starts by itself once your crown is in the middle.',
              tone: state.hint === 'ok' ? 'ready' : 'fix',
              voice: '',
            }}
          />
          <Button label="Take it now" variant="secondary" onPress={() => dispatch({ type: 'shootNow' })} />
        </View>
      );
    case 'burst':
      return <PromptCard prompt={{ title: 'Hold still', detail: 'Picking the sharpest photo…', tone: 'ready', voice: '' }} />;
    case 'helper':
      return (
        <View style={styles.gap}>
          <Button label="Take crown photo" onPress={onShutter} />
          <Button label="I’m on my own" variant="secondary" onPress={() => dispatch({ type: 'choose', mode: 'solo' })} />
        </View>
      );
    case 'review':
      return null;
  }
}

/** Full-screen check of the kept crown photo before it goes into the scan. */
export function CrownReview({ state, onKeep, onRetake }: { state: CrownState; onKeep: () => void; onRetake: () => void }) {
  if (state.step !== 'review' || !state.result) return null;
  const note = reviewNote(state.result);
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
