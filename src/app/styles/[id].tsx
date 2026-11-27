import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg from 'react-native-svg';

import { Face } from '@/components/head/Face';
import { AiNote } from '@/components/styles/AiNote';
import { BeforeAfter } from '@/components/styles/BeforeAfter';
import { StyleSketch } from '@/components/styles/StyleSketch';
import { VerdictPill } from '@/components/styles/VerdictPill';
import { Button, Card, SubScreen, Text } from '@/components/ui';
import { useProfile } from '@/profile/ProfileProvider';
import { faceForStage } from '@/reveal/reveal';
import { useScans } from '@/scan/ScanProvider';
import { SHARE_FAILED, shareView } from '@/share/shareImage';
import { rankedStyles, STYLE_AI_LABEL, STYLE_SKETCH_LABEL, styleById } from '@/styles/catalog';
import { styleJob } from '@/styles/jobs';
import { useCurrentStage } from '@/styles/useCurrentStage';
import { colors, radius, spacing } from '@/theme';
import { previewPhoto } from '@/visualize/preview';
import { useAiImage } from '@/visualize/useAiPreview';

/** One style: drag between now and the new cut, why it suits you or not, and what to tell the barber. */
export default function StyleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const style = styleById(id ?? '');
  const { profile } = useProfile();
  const { records } = useScans();
  const { stage } = useCurrentStage();
  const ai = useAiImage(style ? styleJob(style.id, stage) : null);
  const card = useRef<ComponentRef<typeof View>>(null);
  const [error, setError] = useState<string | null>(null);

  if (!style) {
    return (
      <SubScreen title="Style">
        <Text color="textMuted">That style isn’t in the list any more.</Text>
      </SubScreen>
    );
  }
  const ranked = rankedStyles(stage, profile);
  const at = ranked.findIndex((r) => r.style.id === style.id);
  const { fit } = ranked[at];
  const next = ranked[(at + 1) % ranked.length].style;
  const own = previewPhoto(records);
  const photo = ai.status === 'ready' ? ai.uri : null;
  const now = photo && own ? own.uri : null;
  const { recede, top } = faceForStage(stage);

  async function share() {
    setError(null);
    try {
      await shareView(card, `Me with a ${style!.name.toLowerCase()}?`);
    } catch {
      setError(SHARE_FAILED);
    }
  }

  return (
    <SubScreen title={style.name}>
      <View ref={card} collapsable={false} style={styles.card} testID="style-card">
        <BeforeAfter
          testID="style-compare"
          leftLabel="Now"
          rightLabel={style.name}
          start={0.35}
          left={
            now ? (
              <Image source={{ uri: now }} style={StyleSheet.absoluteFill} contentFit="cover" testID="style-now-photo" />
            ) : (
              <Svg width="100%" height="100%" viewBox="0 0 200 240" preserveAspectRatio="xMidYMid slice">
                <Face id="style-now" recede={recede} top={top} shoulders />
              </Svg>
            )
          }
          right={
            photo ? (
              <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" testID="style-photo" />
            ) : (
              <StyleSketch id="style-after" shape={style.sketch} stage={stage} />
            )
          }
        />
        <View style={styles.cardFoot}>
          <Text variant="caption" color="textMuted" style={{ flex: 1 }}>
            {photo ? STYLE_AI_LABEL : STYLE_SKETCH_LABEL}
          </Text>
          <Text variant="caption" color="accent" style={{ fontWeight: '800' }}>
            Haircare
          </Text>
        </View>
      </View>
      <AiNote ai={ai} />

      <Card style={{ gap: spacing.xs }}>
        <VerdictPill verdict={fit.verdict} />
        <Text>{fit.why}</Text>
        <Text variant="caption" color="textMuted">
          {style.blurb}
        </Text>
      </Card>
      <Card style={{ gap: spacing.xs }}>
        <Text variant="headline">Tell your barber</Text>
        <Text selectable testID="barber-line">
          {style.barber}
        </Text>
      </Card>

      {error ? <Text color="warning">{error}</Text> : null}
      <Button label="Share" onPress={share} />
      <Button label={`Next: ${next.name}`} variant="secondary" onPress={() => router.replace({ pathname: '/styles/[id]', params: { id: next.id } })} />
    </SubScreen>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.bg, borderRadius: radius.lg, gap: spacing.xs },
  cardFoot: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xs },
});
