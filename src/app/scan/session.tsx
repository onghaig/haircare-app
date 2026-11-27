import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
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
import { CrownPanel, CrownReview } from '@/components/scan/CrownPanel';
import { HairChecklist } from '@/components/scan/HairChecklist';
import { HeadGuide } from '@/components/scan/HeadGuide';
import { FINISH_MS, ScanFinish } from '@/components/scan/ScanFinish';
import { PromptCard, StatusChips, ViewProgress } from '@/components/scan/ScanHud';
import { Button, CloseButton as RoundClose, Text } from '@/components/ui';
import { cameraErrorMessage, MANUAL_AFTER_MS, promptFor, statusChips, viewInstruction } from '@/scan/guidance';
import { useProfile } from '@/profile/ProfileProvider';
import { BURST_MS, crownReducer, initialCrownState, stepVoice } from '@/scan/crown';
import { draftRemaining } from '@/scan/draft';
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
  viewsToTake,
} from '@/scan/session';
import { gotIt, loadNaturalVoice, speakNaturally, viewIntro, VoiceCoach } from '@/scan/voice';
import { colors, radius, spacing } from '@/theme';

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** The guided five-view scan. Camera and checks are native; this screen is the HUD. */
export default function ScanSessionScreen() {
  const { baseline, records, save, remove, draft, saveDraft, clearDraft } = useScans();
  // Redoing a scan from its result screen: the old one goes once this one has saved.
  // `only` retakes just those views of it; `resume` picks up a scan left part-way.
  const params = useLocalSearchParams<{ replaces?: string; only?: string; resume?: string }>();
  const replaces = params.replaces ?? (params.resume ? draft?.replaces : undefined);
  const only = useMemo(
    () => (params.only ? (params.only.split(',').filter((v) => (SCAN_ORDER as string[]).includes(v)) as ScanView[]) : null),
    [params.only],
  );
  const base = only && replaces ? records.find((r) => r.id === replaces) : undefined;
  const resumable = params.resume && draft ? draft : null;
  const { profile } = useProfile();
  const firstReveal = !profile.revealSeenAt;
  const [state, dispatch] = useReducer(scanReducer, initialScanState);
  const [permission, setPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [size, setSize] = useState({ width: 0, height: 0 });
  // Voice is on by default: you can't read the screen with your head turned or tilted down.
  const [voiceOn, setVoiceOn] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  // First scan only: one practice view with the checks live and nothing saved.
  const [practice, setPractice] = useState(false);
  const practicePassed = practice && state.everPassed;
  const [leaving, setLeaving] = useState(false);
  // The manual shutter appears only once a view has been stuck for a while.
  const [clock, setClock] = useState(() => Date.now());
  const manualShot = useRef(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(true);
  const camera = useRef<HeadMapCameraViewRef>(null);
  const coach = useMemo(() => new VoiceCoach((line) => speakNaturally(line)), []);
  // Pick the most natural voice on the phone once (enhanced or premium when installed). Not
  // awaited: until it answers, the default voice speaks.
  useEffect(() => loadNaturalVoice(), []);
  const view = currentView(state);
  // The crown: one photo from high above on a spoken countdown, then a check with a density estimate.
  const [crown, crownDispatch] = useReducer(crownReducer, initialCrownState);
  const onCrown = view === 'crown' && state.phase === 'capturing';

  // Finish: save and show the result. Once per scan: a later state change must not start a
  // second save (with a new id) while the first is still running.
  const saveStarted = useRef(false);
  const [saveStep, setSaveStep] = useState<string | null>(null);
  useEffect(() => {
    if (state.phase !== 'done' || saveStarted.current) return;
    saveStarted.current = true;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    // Hold the finish moment for a beat, even when saving is instant.
    const beat = new Promise((r) => setTimeout(r, FINISH_MS));
    const record = buildScanRecord(state, newId(), new Date(), base);
    setSaveStep('Storing your photos');
    save(record)
      .then(async (saved) => {
        if (replaces && replaces !== saved.id) {
          setSaveStep('Replacing the old scan');
          await remove(replaces);
        }
        await clearDraft();
        setSaveStep('Opening your results');
        setSaving(false);
        await beat;
        // The first good scan leads into the forecast reveal. A weak first scan shows its
        // result first, so the weak views can be retaken before the reveal (never after it).
        if (firstReveal && !saved.lowConfidence) router.replace('/reveal/analysing');
        else
          router.replace({
            pathname: '/scan/[id]',
            params: firstReveal ? { id: saved.id, then: 'reveal' } : { id: saved.id },
          });
      })
      .catch((e: unknown) => {
        saveStarted.current = false;
        setSaveError(e instanceof Error ? e.message : String(e));
      });
  }, [state, save, remove, clearDraft, replaces, firstReveal, base]);

  useEffect(() => {
    if (state.phase !== 'capturing') return;
    const t = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(t);
  }, [state.phase]);

  // Practice: the first time every check goes green, that's the lesson learned.
  useEffect(() => {
    if (!practicePassed) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (voiceOn) coach.say('That’s it. Every view works just like that.', Date.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when practice passes
  }, [practicePassed]);

  // Announce each new view with what to do; the crown's steps announce themselves.
  useEffect(() => {
    if (state.phase !== 'capturing' || view === 'crown') return;
    if (voiceOn) coach.say(viewIntro(view, viewInstruction(view)), Date.now());
  }, [view, state.phase, voiceOn, coach]);

  // Crown: speak each step as it starts (always: you can't see the screen above your head).
  useEffect(() => {
    if (!onCrown) return;
    const line = stepVoice(crown);
    if (line) coach.say(line, Date.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per step
  }, [crown.step, onCrown, coach]);

  // Crown countdown: one number a second, out loud.
  useEffect(() => {
    if (!onCrown || crown.step !== 'countdown') return;
    speakNaturally(String(crown.left));
    const t = setTimeout(() => crownDispatch({ type: 'tick' }), 1000);
    return () => clearTimeout(t);
  }, [onCrown, crown.step, crown.left]);

  // The photo: a short burst, and the camera sends back the sharpest frame as the capture.
  useEffect(() => {
    if (onCrown && crown.step === 'burst') void camera.current?.startBurst(BURST_MS);
  }, [onCrown, crown.step]);

  // The green line draws all the way for each view before a photo can be taken, and the finished
  // line stays up for a moment after it ("Got it") before the next view starts.
  const [drawnView, setDrawnView] = useState<ScanView | null>(null);
  const noGuide = size.width <= 0 || size.height <= 0;
  // Temples take the photo as soon as the hairline is clearly in the shot, without waiting for the line.
  const drawn = noGuide || drawnView === view || view === 'leftTemple' || view === 'rightTemple';
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
    crownDispatch({ type: 'reset' });
    setQueued(null);
    void camera.current?.resetCapture();
    dispatch({ type: 'retake', view: lastTaken });
  }

  function shoot() {
    if (held) return;
    // Pressed while checks are still red: the photo is kept but marked, and stays out of trends
    // if it scores low.
    manualShot.current = !liveRef.current?.allPassed;
    if (drawn) camera.current?.capture();
    else setQueued(view);
  }

  const taken = SCAN_ORDER.filter((v) => state.captures[v]);
  function close() {
    if (state.phase === 'capturing' && !practice && taken.length > 0 && !only) setLeaving(true);
    else router.back();
  }
  async function finishLater() {
    if (!state.hairState) return router.back();
    await saveDraft({
      startedAt: new Date(state.startedAt ?? Date.now()).toISOString(),
      hairState: state.hairState,
      captures: state.captures,
      ...(replaces ? { replaces } : {}),
    });
    router.back();
  }
  async function discard() {
    await clearDraft();
    router.back();
  }

  // A shot asked for mid-draw, or checks that went green before the line finished, fire now.
  // The crown has its own flow (countdown and burst).
  useEffect(() => {
    if (!drawn || held || view === 'crown') return;
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

  async function start(hairState: HairState, opts: { practise?: boolean } = {}) {
    void prepareVoiceAudioAsync();
    if (isHeadMapAvailable) {
      const p = await requestCameraPermissionAsync();
      setPermission(p);
      if (p !== 'granted') return;
    }
    if (resumable) {
      dispatch({ type: 'resume', hairState: resumable.hairState, captures: resumable.captures, now: Date.now() });
      return;
    }
    if (only) {
      dispatch({ type: 'resume', hairState, only, now: Date.now() });
      return;
    }
    setPractice(!!opts.practise);
    dispatch({ type: 'start', hairState, now: Date.now() });
  }

  function endPractice() {
    if (!state.hairState) return;
    setPractice(false);
    void camera.current?.resetCapture();
    dispatch({ type: 'start', hairState: state.hairState, now: Date.now() });
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
          <HairChecklist
            firstScan={records.length === 0 && !resumable}
            resume={resumable ? { done: SCAN_ORDER.length - draftRemaining(resumable).length, next: VIEW_LABEL[draftRemaining(resumable)[0] ?? 'front'].split(':')[0] } : null}
            retake={only ? only.map((v) => VIEW_LABEL[v].split(':')[0]) : null}
            onStart={start}
          />
        )}
      </SafeAreaView>
    );
  }

  const prompt = saveError
    ? { title: 'Couldn’t save this scan', detail: saveError, tone: 'fix' as const, voice: '' }
    : state.phase === 'done'
      ? { title: 'Saving your scan', detail: saveStep ?? undefined, tone: 'ready' as const, voice: '' }
      : cameraError
        ? { ...cameraErrorMessage(cameraError), tone: 'fix' as const, voice: '' }
        : held
          ? { title: 'Got it', tone: 'ready' as const, voice: 'Got it' }
          : live
            ? promptFor(live)
            : { title: 'Line up with the outline', tone: 'fix' as const, voice: '' };
  const ghost = baseline?.views[view]?.uri;
  const tip = state.tip ? TIPS[state.tip] : null;
  // Without live checks (no scan engine, or the camera failed) the shutter is the only way on.
  const showManual =
    state.phase === 'capturing' &&
    !held &&
    !live?.allPassed &&
    (!isHeadMapAvailable || !!cameraError || (state.viewSince != null && clock - state.viewSince >= MANUAL_AFTER_MS));

  return (
    <View testID="scan-camera" style={styles.camera} onLayout={(e) => setSize(e.nativeEvent.layout)}>
      <HeadMapCameraView
        ref={camera}
        style={StyleSheet.absoluteFill}
        view={view}
        baselineFaceWidth={baseline?.faceWidthPx ?? null}
        active={state.phase === 'capturing' && !(onCrown && crown.step === 'review') && !leaving}
        autoCapture={practice || view === 'crown' ? false : drawn && !held}
        onQuality={({ nativeEvent }) => {
          const now = Date.now();
          dispatch({ type: 'quality', report: nativeEvent, now });
          if (view !== 'crown') coach.update(promptFor(nativeEvent).voice, now, voiceOn);
        }}
        onCapture={({ nativeEvent }) => {
          setCameraError(null);
          if (nativeEvent.view !== view) return;
          if (view === 'crown') {
            crownDispatch({ type: 'captured', result: nativeEvent });
            return;
          }
          if (held || practice) return;
          if (voiceOn) coach.say(gotIt(), Date.now());
          setHeld(manualShot.current ? { ...nativeEvent, manual: true } : nativeEvent);
          manualShot.current = false;
        }}
        onError={({ nativeEvent }) => {
          // The raw message goes to the log for us; people see plain words (see the prompt).
          console.warn('[scan] camera error', nativeEvent.message);
          setCameraError(nativeEvent.message);
        }}
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
      {onCrown && crown.step === 'countdown' ? (
        <View pointerEvents="none" style={styles.countdown}>
          <Text variant="display" accessibilityLiveRegion="assertive" testID="crown-countdown">
            {crown.left}
          </Text>
        </View>
      ) : null}

      <SafeAreaView style={styles.hud} pointerEvents="box-none">
        <View style={styles.top}>
          <CloseButton onPress={close} />
          {practice ? (
            <Text variant="caption" style={[styles.pill, { fontWeight: '600' }]}>
              Practice
            </Text>
          ) : (
            <ViewProgress current={view} done={state.captures} only={only} />
          )}
          {view === 'crown' ? (
            // You can't see the screen with the phone above your head, so the crown always talks.
            <View
              accessible
              accessibilityRole="text"
              accessibilityLabel="Voice stays on for the crown"
              accessibilityState={{ disabled: true }}
              style={styles.pill}>
              <Text variant="caption" style={{ fontWeight: '600' }}>
                Voice on for the crown
              </Text>
            </View>
          ) : (
            <Pressable
              onPress={() => setVoiceOn((v) => !v)}
              accessibilityRole="switch"
              accessibilityState={{ checked: voiceOn }}
              accessibilityLabel="Voice guidance"
              style={styles.pill}>
              <Text variant="caption" style={{ fontWeight: '600' }}>
                {voiceOn ? 'Voice on' : 'Voice off'}
              </Text>
            </Pressable>
          )}
        </View>
        <Text variant="headline" style={styles.viewTitle}>
          {practice ? 'Practice: front view' : VIEW_LABEL[view]}
        </Text>
        <View style={{ flex: 1 }} />
        <View style={styles.bottom}>
          {!onCrown ? <PromptCard prompt={prompt} tip={tip} /> : null}
          {practice ? (
            <View style={styles.practice} testID="scan-practice">
              <Text variant="headline">{practicePassed ? 'That’s it. Every view works like this.' : 'Try one view first'}</Text>
              <Text variant="caption" color="textMuted">
                {practicePassed
                  ? 'When every check is green, the photo takes itself. Nothing here was saved.'
                  : 'Line up with the outline until every check below turns green. Nothing is saved.'}
              </Text>
              <Button label={practicePassed ? 'Start the real scan' : 'Skip practice'} variant={practicePassed ? 'primary' : 'secondary'} onPress={endPractice} />
            </View>
          ) : null}
          {lastTaken && !held && state.phase === 'capturing' && !practice ? (
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
          {live && !onCrown ? <StatusChips chips={statusChips(live)} /> : null}
          {practice ? null : view !== 'crown' ? (
            showManual ? (
              <Button label="Having trouble? Take it anyway" variant="secondary" onPress={shoot} />
            ) : null
          ) : onCrown ? (
            <CrownPanel state={crown} dispatch={crownDispatch} />
          ) : null}
        </View>
      </SafeAreaView>
      {state.phase === 'done' && !saveError ? (
        <ScanFinish captures={state.captures} curve={state.captures.front?.report?.hairline?.curve ?? base?.hairline?.curve} saving={saving} />
      ) : null}
      {leaving ? (
        <LeaveSheet
          taken={taken.length}
          left={viewsToTake(state).map((v) => VIEW_LABEL[v].split(':')[0])}
          firstScan={firstReveal}
          onStay={() => setLeaving(false)}
          onLater={() => void finishLater()}
          onDiscard={() => void discard()}
        />
      ) : null}
      {onCrown ? (
        <CrownReview
          state={crown}
          onKeep={() => crown.result && dispatch({ type: 'captured', result: crown.result })}
          onRetake={() => {
            void camera.current?.resetCapture();
            crownDispatch({ type: 'retake' });
          }}
        />
      ) : null}
    </View>
  );
}

function CloseButton({ onPress = () => router.back() }: { onPress?: () => void }) {
  return <RoundClose onPress={onPress} label="Close scan" />;
}

/** Leaving mid-scan keeps the photos taken so far for a day, so nobody starts again from zero. */
function LeaveSheet({
  taken,
  left,
  firstScan,
  onStay,
  onLater,
  onDiscard,
}: {
  taken: number;
  left: string[];
  firstScan: boolean;
  onStay: () => void;
  onLater: () => void;
  onDiscard: () => void;
}) {
  return (
    <View style={styles.scrim} testID="leave-scan">
      <SafeAreaView edges={['bottom']} style={styles.sheet} accessibilityViewIsModal>
        <View style={styles.grab} />
        <Text variant="title" accessibilityRole="header">
          Leave your scan?
        </Text>
        <Text color="textMuted">
          {`${taken} of ${SCAN_ORDER.length} photos are saved on your phone. Pick up where you left off any time in the next day.`}
        </Text>
        <Text variant="caption" color="textMuted">
          {firstScan
            ? `Your forecast is ready to build as soon as the last ${left.length === 1 ? 'view is' : `${left.length} views are`} in: ${left.join(', ')}.`
            : `Still to take: ${left.join(', ')}.`}
        </Text>
        <Button label="Keep scanning" onPress={onStay} />
        <Button label="Finish later" variant="secondary" onPress={onLater} />
        <Pressable accessibilityRole="button" onPress={onDiscard} style={styles.discard}>
          <Text variant="caption" style={{ color: colors.danger, fontWeight: '600' }}>
            Delete these photos
          </Text>
        </Pressable>
      </SafeAreaView>
    </View>
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
  practice: { backgroundColor: 'rgba(0,0,0,0.72)', borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: spacing.lg,
    gap: spacing.md,
  },
  grab: { width: 38, height: 4, borderRadius: 2, backgroundColor: colors.line, alignSelf: 'center' },
  discard: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md },
  pill: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    minHeight: 32,
    justifyContent: 'center',
  },
});
