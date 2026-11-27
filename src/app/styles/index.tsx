import { router } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AiNote } from '@/components/styles/AiNote';
import { StyleThumb } from '@/components/styles/StyleThumb';
import { VerdictPill } from '@/components/styles/VerdictPill';
import { Button, Card, SubScreen, Text } from '@/components/ui';
import { useProfile } from '@/profile/ProfileProvider';
import { stageLabel } from '@/reveal/reveal';
import { SHARE_FAILED, shareView } from '@/share/shareImage';
import { rankedStyles } from '@/styles/catalog';
import { useCurrentStage } from '@/look/useCurrentStage';
import { colors, radius, spacing } from '@/theme';
import { useAiImage } from '@/visualize/useAiPreview';

/**
 * Hairstyles to try, ranked for today's hairline: the ones that hide thinning first, the ones
 * that show it last and say so. Sketches here; the AI image is made only for the one you open.
 */
export default function StyleGalleryScreen() {
  const { profile } = useProfile();
  const { stage, measured } = useCurrentStage();
  const ranked = rankedStyles(stage, profile);
  // Asks for nothing: only tells us whether AI try-on is on, to offer it.
  const ai = useAiImage(null);
  const vote = useRef<ComponentRef<typeof View>>(null);
  const [error, setError] = useState<string | null>(null);
  const top4 = ranked.filter((r) => r.fit.verdict !== 'shows').slice(0, 4);

  async function shareVote() {
    setError(null);
    try {
      await shareView(vote, 'Which haircut should I get?');
    } catch {
      setError(SHARE_FAILED);
    }
  }

  return (
    <SubScreen title="Try a hairstyle">
      <Text color="textMuted">
        Picked for {measured ? 'your scan' : 'your answers'}: {stageLabel(stage)}.
      </Text>
      <AiNote ai={ai} offer="Try them on your own photo (AI)" />
      <View style={styles.grid}>
        {ranked.map(({ style, fit }) => (
          <Pressable
            key={style.id}
            accessibilityRole="button"
            accessibilityLabel={`${style.name}. ${fit.why}`}
            onPress={() => router.push({ pathname: '/styles/[id]', params: { id: style.id } })}
            style={styles.tile}
            testID={`style-${style.id}`}>
            <View style={styles.thumb}>
              <StyleThumb id={`g-${style.id}`} style={style} stage={stage} nameless />
            </View>
            <Text style={{ fontWeight: '700' }}>{style.name}</Text>
            <VerdictPill verdict={fit.verdict} />
          </Pressable>
        ))}
      </View>

      <Card style={{ gap: spacing.sm }}>
        <Text variant="headline">Can’t pick? Ask your friends</Text>
        <View ref={vote} collapsable={false} style={styles.vote} testID="vote-card">
          <Text variant="caption" color="accent" style={styles.brand}>
            WHICH ONE SHOULD I GET?
          </Text>
          <View style={styles.voteGrid}>
            {top4.map(({ style }, i) => (
              <View key={style.id} style={styles.voteCell}>
                <View style={styles.voteThumb}>
                  <StyleThumb id={`v-${style.id}`} style={style} stage={stage} nameless />
                </View>
                <Text variant="caption" style={{ fontWeight: '700' }}>{`${i + 1}. ${style.name}`}</Text>
              </View>
            ))}
          </View>
          <Text variant="caption" color="textMuted" style={{ textAlign: 'center' }}>
            Reply with a number · Haircare
          </Text>
        </View>
        {error ? <Text color="warning">{error}</Text> : null}
        <Button label="Share the vote card" variant="secondary" onPress={shareVote} />
      </Card>
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { width: '48%', flexGrow: 1, gap: 4, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.sm },
  thumb: { height: 150, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surfaceRaised },
  vote: { backgroundColor: colors.bg, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  brand: { fontWeight: '800', letterSpacing: 1, textAlign: 'center' },
  voteGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  voteCell: { width: '48%', flexGrow: 1, gap: 2, alignItems: 'center' },
  voteThumb: { width: '100%', height: 110, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surfaceRaised },
});
