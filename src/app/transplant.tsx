import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useRef, useState, type ComponentRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { LineKey, LockOver, NoPhoto, PhotoLook } from '@/components/look/PhotoLook';
import { AiNote } from '@/components/styles/AiNote';
import { BeforeAfter } from '@/components/styles/BeforeAfter';
import { Button, Card, SubScreen, Text } from '@/components/ui';
import { isPremium } from '@/paywall/purchases';
import { isMinor } from '@/profile/onboarding';
import { useProfile } from '@/profile/ProfileProvider';
import { clinicReferralUrl, referralLink, restoredStage, TRANSPLANT_LABEL } from '@/referral/clinics';
import { REFERENCE_LABEL, restorePhoto } from '@/look/references';
import { useOwnPhoto } from '@/look/useOwnPhoto';
import { SHARE_FAILED, shareView } from '@/share/shareImage';
import { restoreJob } from '@/styles/jobs';
import { useCurrentStage } from '@/look/useCurrentStage';
import { colors, radius, spacing } from '@/theme';
import { useAiImage } from '@/visualize/useAiPreview';

/**
 * What a hair transplant could look like on you, and a way to talk to a clinic. Honest about
 * limits: a transplant moves hair, it doesn't stop loss, and the further loss has gone the less
 * there is to move.
 */
export default function TransplantScreen() {
  const { profile } = useProfile();
  const own = useOwnPhoto();
  const { stage } = useCurrentStage();
  const minor = isMinor(profile);
  const ai = useAiImage(minor ? null : restoreJob(stage));
  const card = useRef<ComponentRef<typeof View>>(null);
  const [error, setError] = useState<string | null>(null);
  const clinic = clinicReferralUrl();

  if (minor) {
    return (
      <SubScreen title="Transplant preview">
        <Text variant="headline">Not available under 18</Text>
        <Text color="textMuted">Surgeons don’t do hair transplants this young, because the pattern isn’t settled yet.</Text>
      </SubScreen>
    );
  }

  const photo = ai.status === 'ready' ? ai.uri : null;
  const example = photo || own ? null : restorePhoto(stage);
  // Not subscribed: the free preview made on the phone, blurred, until the real AI picture.
  const teaser = !photo && !!own && !isPremium(profile);
  const label = photo
    ? TRANSPLANT_LABEL
    : teaser
      ? 'Rough preview on your photo. Unlock for the AI picture'
      : own
        ? 'Rough preview on your photo, dashed line at a possible new hairline'
        : example != null
          ? REFERENCE_LABEL
          : TRANSPLANT_LABEL;

  async function share() {
    setError(null);
    try {
      await shareView(card, 'Transplant preview');
    } catch {
      setError(SHARE_FAILED);
    }
  }

  return (
    <SubScreen title="Transplant preview">
      <View ref={card} collapsable={false} style={styles.card}>
        {photo && own ? (
          <BeforeAfter
            testID="transplant-compare"
            leftLabel="Now"
            rightLabel="After"
            start={0.4}
            left={<Image source={{ uri: own.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />}
            right={<Image source={{ uri: photo }} style={StyleSheet.absoluteFill} contentFit="cover" testID="transplant-photo" />}
          />
        ) : (
          <View style={styles.frame}>
            {own ? (
              <>
                <PhotoLook photo={own} stageNow={stage} stageTo={restoredStage(stage)} paint="restore" blur={teaser} testID="transplant-own-photo" />
                {teaser ? <LockOver line="Unlock to see it on you" /> : null}
              </>
            ) : example != null ? (
              <Image source={example} style={StyleSheet.absoluteFill} contentFit="cover" testID="transplant-example" />
            ) : (
              <NoPhoto title="Your new hairline" line="Do a scan to see a possible result on your own photo." />
            )}
          </View>
        )}
        {!photo && !teaser && own?.curve ? <LineKey projected="After a transplant" /> : null}
        <Text variant="caption" color="textMuted" style={{ textAlign: 'center' }}>
          {label}
        </Text>
      </View>
      <AiNote ai={ai} />
      {error ? <Text color="warning">{error}</Text> : null}
      <Button label="Share" variant="secondary" onPress={share} />

      <Card style={{ gap: spacing.sm }}>
        <Text variant="headline">Good to know</Text>
        <Fact title="It moves hair, it doesn’t stop loss">Most surgeons want you on something that slows loss first, so the hair around the grafts stays.</Fact>
        <Fact title="It takes about a year">New hair starts at 3 to 4 months and looks finished at 9 to 12.</Fact>
        <Fact title={stage >= 5 ? 'Coverage is limited at your stage' : 'Your donor hair sets the limit'}>
          {stage >= 5
            ? 'There’s less donor hair to go around, so most people get a new front and keep a thinner crown.'
            : 'A surgeon checks the back and sides to see how many grafts you can spare.'}
        </Fact>
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <Text variant="headline">Talk to a clinic</Text>
        <Text color="textMuted">A consult is usually free. Ask how many grafts, who does the work, and to see results at your stage.</Text>
        {clinic ? (
          <Button label="Find a clinic" onPress={() => void WebBrowser.openBrowserAsync(referralLink(clinic, stage))} />
        ) : (
          <>
            <Button label="Find a clinic" disabled />
            <Text variant="caption" color="textMuted" testID="clinic-soon">
              Clinic search is coming soon.
            </Text>
          </>
        )}
      </Card>
    </SubScreen>
  );
}

function Fact({ title, children }: { title: string; children: string }) {
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
  frame: { height: 300, borderRadius: radius.lg, overflow: 'hidden' },
  card: { backgroundColor: colors.bg, borderRadius: radius.lg, gap: spacing.xs },
});
