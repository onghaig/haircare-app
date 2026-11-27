import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { LockOver, NoPhoto, PhotoLook } from '@/components/look/PhotoLook';
import { AiNote } from '@/components/styles/AiNote';
import { BeforeAfter } from '@/components/styles/BeforeAfter';
import { VerdictPill } from '@/components/styles/VerdictPill';
import { Button, Card, SubScreen, Text } from '@/components/ui';
import { isPremium } from '@/paywall/purchases';
import { isMinor } from '@/profile/onboarding';
import { useProfile } from '@/profile/ProfileProvider';
import { REFERENCE_LABEL, stylePhoto } from '@/look/references';
import { useOwnPhoto } from '@/look/useOwnPhoto';
import { SHARE_FAILED, shareView } from '@/share/shareImage';
import { rankedStyles, STYLE_AI_LABEL, styleById } from '@/styles/catalog';
import { styleJob } from '@/styles/jobs';
import { useCurrentStage } from '@/look/useCurrentStage';
import { colors, radius, spacing } from '@/theme';
import { useAiImage } from '@/visualize/useAiPreview';

/** One style: drag between now and the new cut, why it suits you or not, and what to tell the barber. */
export default function StyleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const style = styleById(id ?? '');
  const { profile } = useProfile();
  const own = useOwnPhoto();
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
  const photo = ai.status === 'ready' ? ai.uri : null;
  // Not subscribed: a blurred preview made on the phone, so no AI money goes on people who
  // never pay. The real AI picture replaces it once they unlock.
  const teaser = !photo && own && !isPremium(profile) && !isMinor(profile) ? own : null;
  const rough = !photo && !teaser && own?.curve && (style.sketch === 'bare' || style.sketch === 'stubble') ? own : null;
  const example = photo || teaser || rough ? null : stylePhoto(style.id, stage);
  const paint = style.sketch === 'bare' || style.sketch === 'stubble' ? style.sketch : undefined;
  const caption = photo
    ? STYLE_AI_LABEL
    : teaser
      ? 'Rough preview on your photo. Unlock for the AI picture'
      : rough
        ? 'Rough preview on your photo'
        : example != null
          ? REFERENCE_LABEL
          : 'Turn on AI to see it on your own photo';

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
        {photo && own ? (
          <BeforeAfter
            testID="style-compare"
            leftLabel="Now"
            rightLabel={style.name}
            start={0.35}
            left={<Image source={{ uri: own.uri }} style={StyleSheet.absoluteFill} contentFit="cover" testID="style-now-photo" />}
            right={<Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" testID="style-photo" />}
          />
        ) : (
          <View style={styles.frame}>
            {teaser ? (
              <>
                <PhotoLook photo={teaser} paint={paint} blur testID="style-teaser" />
                <LockOver line="Unlock to try it on you" />
              </>
            ) : rough ? (
              <PhotoLook photo={rough} paint={paint} showToday={false} testID="style-rough" />
            ) : example != null ? (
              <Image source={example} style={StyleSheet.absoluteFill} contentFit="cover" testID="style-example" />
            ) : (
              <NoPhoto title={style.name} line={style.blurb} />
            )}
          </View>
        )}
        <View style={styles.cardFoot}>
          <Text variant="caption" color="textMuted" style={{ flex: 1 }}>
            {caption}
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
  frame: { height: 300, borderRadius: radius.lg, overflow: 'hidden' },
  cardFoot: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xs },
});
