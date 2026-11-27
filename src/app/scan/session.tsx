import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import * as Speech from 'expo-speech';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  HeadMapCameraView,
  isHeadMapAvailable,
  prepareVoiceAudioAsync,
  requestCameraPermissionAsync,
  type CaptureResult,
  type HeadMapCameraViewRef,
  type ScanView,
} from '@modules/headmap';
import { HairChecklist } from '@/components/scan/HairChecklist';
import { HeadGuide } from '@/components/scan/HeadGuide';
import { PromptCard, StatusChips, ViewProgress } from '@/components/scan/ScanHud';
import { Button, Text } from '@/components/ui';
import { promptFor, statusChips, viewInstruction } from '@/scan/guidance';
import { useProfile } from '@/profile/ProfileProvider';
import { useScans } from '@/scan/ScanProvider';
import {
  buildScanRecord,
  currentView,
  initialScanState,
  SCAN_ORDER,
  scanReducer,
  SHOW_CAPTURED_MS,
  TIPS,
  type HairState,
  VIEW_LABEL,
} from '@/scan/session';
import { VoiceCoach } from '@/scan/voice';
import { colors, spacing } from '@/theme';

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** The guided five-view scan. Camera and checks are native; this screen is the HUD. */
export default function ScanSessionScreen() {
  const { baseline, records, save, remove } = useScans();
  // Redoing a scan from its result screen: the old one goes once this one has saved.
  const { replaces } = useLocalSearchParams<{ replaces?: string }>();
  const { profile } = useProfile();
  const firstReveal = !profile.revealSeenAt;
  const [state, dispatch] = useReducer(scanReducer, initialScanState);
  const [permission, setPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [size, setSize] = useState({ width: 0, height: 0 });
  // Voice is on by default: you can't read the screen with your head turned or tilted down.
  const [voiceOn, setVoiceOn] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const camera = useRef<HeadMapCameraViewRef>(null);
  const coach = useMemo(() => new VoiceCoach((line) => Speech.speak(line, { rate: 0.95 })), []);
  const view = currentView(state);
  /** Crown self-timer: seconds left for a view. A timer for another view is no timer. */
  const [timer, setTimer] = useState<{ view: string; left: number } | null>(null);
  const countdown = timer && timer.view === view ? timer.left : null;

  // Finish: save and show the result.
  useEffect(() => {
    if (state.phase !== 'done') return;
    const record = buildScanRecord(state, newId(), new Date());
    save(record)
      .then(async (saved) => {
        if (replaces && replaces !== saved.id) await remove(replaces);
        // The first finished scan leads into the forecast reveal; later scans show their result.
        if (firstReveal) router.replace('/reveal/analysing');
        else router.replace({ pathname: '/scan/[id]', params: { id: saved.id } });
      })
      .catch((e: unknown) => setSaveError(e instanceof Error ? e.message : String(e)));
  }, [state, save, remove, replaces, firstReveal]);

  // Announce each new view with what to do; the crown is always voice-guided.
  useEffect(() => {
    if (state.phase !== 'capturing') return;
    if (view === 'crown' || voiceOn) coach.say(`${VIEW_LABEL[view]}. ${viewInstruction(view)}`, Date.now());
  }, [view, state.phase, voiceOn, coach]);

  // The green line draws all the way for each view before a photo can be taken, and the finished
  // line stays up for a moment after it ("Got it") before the next view starts.
  const [drawnView, setDrawnView] = useState<ScanView | null>(null);
  const noGuide = size.width <= 0 || size.height <= 0;
  const drawn = noGuide || drawnView === view;
  const [held, setHeld] = useState<CaptureResult | null>(null);
  const [queued, setQueued] = useState<ScanView | null>(null);
  const live = state.live;
  const liveRef = useRef(live);
  useEffect(() => {
    liveRef.current = live;
  });

  // The last photo taken, for "Redo last photo" (with retakes, not always the view before).
  const lastTaken = SCAN_ORDER.slice(0, state.index).filter((v) => state.captures[v]).at(-1);
  function redoLast() {
    if (!lastTaken || held) return;
    setTimer(null);
    setQueued(null);
    void camera.current?.resetCapture();
    dispatch({ type: 'retake', view: lastTaken });
  }

  function shoot() {
    if (held) return;
    if (drawn) camera.current?.capture();
    else setQueued(view);
  }

  // A shot asked for mid-draw, or checks that went green before the line finished, fire now.
  useEffect(() => {
    if (!drawn || held) return;
    if (queued === view || liveRef.current?.allPassed) camera.current?.capture();
  }, [drawn, held, queued, view]);

  useEffect(() => {
    if (!held) return;
    const t = setTimeout(() => {
      dispatch({ type: 'captured', result: held });
      setHeld(null);
      setQueued(null);
    }, SHOW_CAPTURED_MS);
    return () => clearTimeout(t);
  }, [held]);

  // Crown self-timer: the phone is behind your head, so count down out loud, then shoot.
  useEffect(() => {
    if (countdown == null) return;
    Speech.speak(String(countdown), { rate: 1 });
    const t = setTimeout(() => {
      if (countdown <= 1) {
        // Queue the shot: it fires as soon as the green line has finished drawing.
        setQueued(view);
        setTimer(null);
      } else {
        setTimer({ view, left: countdown - 1 });
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [countdown, view]);

  async function start(hairState: HairState) {
    void prepareVoiceAudioAsync();
    if (isHeadMapAvailable) {
      const p = await requestCameraPermissionAsync();
      setPermission(p);
      if (p !== 'granted') return;
    }
    dispatch({ type: 'start', hairState, now: Date.now() });
  }

  if (state.phase === 'checklist' || permission === 'denied') {
    return (
      <SafeAreaView style={styles.safe}>
        <CloseButton />
        {permission === 'denied' ? (
          <View style={styles.center}>
            <Text variant="title">Camera access is off</Text>
            <Text color="textMuted" style={{ textAlign: 'center' }}>
              The scan needs the camera to measure your hairline. Photos are analysed on your phone.
            </Text>
            <Button label="Open Settings" onPress={() => Linking.openSettings()} />
          </View>
        ) : (
          <HairChecklist firstScan={records.length === 0} onStart={start} />
        )}
      </SafeAreaView>
    );
  }

  const prompt = saveError
    ? { title: 'Couldn’t save this scan', detail: saveError, tone: 'fix' as const, voice: '' }
    : state.phase === 'done'
      ? { title: 'Saving your scan', tone: 'ready' as const, voice: '' }
      : cameraError
        ? { title: 'Camera problem', detail: cameraError, tone: 'fix' as const, voice: '' }
        : held
          ? { title: 'Got it', tone: 'ready' as const, voice: 'Got it' }
          : live
            ? promptFor(live)
            : { title: 'Line up with the outline', tone: 'fix' as const, voice: '' };
  const ghost = baseline?.views[view]?.uri;
  const tip = state.tip ? TIPS[state.tip] : null;

  return (
    <View testID="scan-camera" style={styles.camera} onLayout={(e) => setSize(e.nativeEvent.layout)}>
      <HeadMapCameraView
        ref={camera}
        style={StyleSheet.absoluteFill}
        view={view}
        baselineFaceWidth={baseline?.faceWidthPx ?? null}
        active={state.phase === 'capturing'}
        autoCapture={drawn && !held}
        onQuality={({ nativeEvent }) => {
          dispatch({ type: 'quality', report: nativeEvent, now: Date.now() });
          coach.update(promptFor(nativeEvent).voice, Date.now(), view === 'crown' || voiceOn);
        }}
        onCapture={({ nativeEvent }) => {
          setCameraError(null);
          if (held || nativeEvent.view !== view) return;
          if (view === 'crown' || voiceOn) coach.say('Got it', Date.now());
          setHeld(nativeEvent);
        }}
        onError={({ nativeEvent }) => setCameraError(nativeEvent.message)}
      />
      {ghost && view !== 'crown' ? (
        <Image source={{ uri: ghost }} style={[StyleSheet.absoluteFill, { opacity: 0.28 }]} contentFit="cover" pointerEvents="none" />
      ) : null}
      <HeadGuide
        view={view}
        aligned={!!held || !!live?.allPassed}
        width={size.width}
        height={size.height}
        hairline={live?.hairline}
        complete={!!held}
        onDrawn={() => setDrawnView(view)}
      />
      {countdown != null && countdown > 0 ? (
        <View pointerEvents="none" style={styles.countdown}>
          <Text variant="display" accessibilityLiveRegion="assertive">
            {countdown}
          </Text>
        </View>
      ) : null}

      <SafeAreaView style={styles.hud} pointerEvents="box-none">
        <View style={styles.top}>
          <CloseButton />
          <ViewProgress current={view} done={state.captures} />
          <Pressable
            onPress={() => setVoiceOn((v) => !v)}
            accessibilityRole="switch"
            accessibilityState={{ checked: voiceOn }}
            accessibilityLabel="Voice guidance"
            style={styles.pill}>
            <Text variant="caption" style={{ fontWeight: '600' }}>
              {voiceOn || view === 'crown' ? 'Voice on' : 'Voice off'}
            </Text>
          </Pressable>
        </View>
        <Text variant="headline" style={styles.viewTitle}>
          {VIEW_LABEL[view]}
        </Text>
        <View style={{ flex: 1 }} />
        <View style={styles.bottom}>
          <PromptCard prompt={prompt} tip={tip} />
          {lastTaken && !held && state.phase === 'capturing' ? (
            <Pressable
              onPress={redoLast}
              accessibilityRole="button"
              accessibilityLabel={`Redo last photo: ${VIEW_LABEL[lastTaken].split(':')[0]}`}
              testID="redo-last-photo"
              style={styles.redo}>
              <Text variant="caption" color="textMuted" style={{ fontWeight: '600' }}>
                {`↺ Redo last photo (${VIEW_LABEL[lastTaken].split(':')[0]})`}
              </Text>
            </Pressable>
          ) : null}
          {live ? <StatusChips chips={statusChips(live)} /> : null}
          {view !== 'crown' ? (
            <Button label="Take photo now" variant="secondary" onPress={shoot} />
          ) : (
            // The crown always gets captured: auto-capture when the checks pass, or this timer.
            <Button
              label={countdown != null ? 'Cancel timer' : 'Take crown photo in 3 seconds'}
              variant="secondary"
              onPress={() => setTimer(countdown != null ? null : { view, left: 3 })}
            />
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

function CloseButton() {
  return (
    <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close scan" style={styles.close}>
      <Text variant="headline">×</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  redo: { alignSelf: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  countdown: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, padding: spacing.xl, gap: spacing.md, alignItems: 'center', justifyContent: 'center' },
  camera: { flex: 1, backgroundColor: '#000' },
  hud: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  viewTitle: { textAlign: 'center', marginTop: spacing.sm },
  bottom: { padding: spacing.lg, gap: spacing.md },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  pill: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    minHeight: 32,
    justifyContent: 'center',
  },
});
