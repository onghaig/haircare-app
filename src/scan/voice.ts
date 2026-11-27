import * as Speech from 'expo-speech';

/**
 * Decides when to speak a guidance line. Speaks a new line only after it has stayed the
 * same for a short moment (no chattering as the head moves), never repeats itself within a
 * cool-down, and always speaks for the crown, where the user cannot see the screen.
 */
export interface VoiceCoachOptions {
  settleMs?: number;
  repeatMs?: number;
}

export class VoiceCoach {
  private candidate: { line: string; since: number } | null = null;
  private lastSpoken: { line: string; at: number } | null = null;
  private readonly settleMs: number;
  private readonly repeatMs: number;

  constructor(
    private readonly speak: (line: string) => void,
    opts: VoiceCoachOptions = {},
  ) {
    this.settleMs = opts.settleMs ?? 1200;
    this.repeatMs = opts.repeatMs ?? 5000;
  }

  /** Feed the current line (or null when nothing should be said). Returns the spoken line, if any. */
  update(line: string | null, now: number, enabled: boolean): string | null {
    if (!enabled || !line) {
      this.candidate = null;
      return null;
    }
    if (!this.candidate || this.candidate.line !== line) {
      this.candidate = { line, since: now };
      return null;
    }
    if (now - this.candidate.since < this.settleMs) return null;
    if (this.lastSpoken && this.lastSpoken.line === line && now - this.lastSpoken.at < this.repeatMs) return null;
    this.lastSpoken = { line, at: now };
    this.speak(line);
    return line;
  }

  /** Speak immediately (view changes, capture confirmations). */
  say(line: string, now: number) {
    this.lastSpoken = { line, at: now };
    this.candidate = null;
    this.speak(line);
  }
}

/**
 * A more natural voice. The system default is often the small "compact" voice, which sounds
 * robotic. Phones usually also have enhanced or premium voices (iOS: Settings > Accessibility >
 * Spoken Content > Voices; Android: the Google speech engine's high quality voices), which are
 * free and run on the device. We pick the best installed English one, in the phone's own accent
 * when there is a choice, and never a novelty voice. No paid or online service.
 */
export interface VoiceInfo {
  identifier: string;
  name: string;
  quality: string;
  language: string;
}

/** Robotic or novelty voices on iOS (the Eloquence set, and the old Zarvox, Bells and friends). */
const NOVELTY = /com\.apple\.eloquence|com\.apple\.speech\.synthesis\.voice|novelty/i;

/** Ranks a voice: higher is more natural. Negative means never use it. */
export function voiceRank(v: VoiceInfo, locale = 'en-US'): number {
  const lang = v.language.replace('_', '-').toLowerCase();
  const want = locale.replace('_', '-').toLowerCase();
  if (!lang.startsWith(want.slice(0, 2))) return -1;
  const id = `${v.identifier} ${v.name}`.toLowerCase();
  if (NOVELTY.test(id)) return -1;
  let rank = 1;
  if (/premium/.test(id)) rank = 4;
  else if (/siri/.test(id)) rank = 3.5;
  else if (v.quality === 'Enhanced' || /enhanced/.test(id)) rank = 3;
  // Android: network voices need data and start late; local ones answer at once.
  if (/network/.test(id)) rank -= 0.75;
  if (lang === want) rank += 0.5;
  return rank;
}

export function pickNaturalVoice(voices: readonly VoiceInfo[], locale = 'en-US'): string | undefined {
  let best: { id: string; rank: number } | undefined;
  for (const v of voices) {
    const rank = voiceRank(v, locale);
    // Stable: on a tie the first listed (the system's own order) wins.
    if (rank > 0 && (!best || rank > best.rank)) best = { id: v.identifier, rank };
  }
  return best?.id;
}

/** Natural voices sound best at about their own pace; the compact one a touch slower. */
const RATE = 0.97;

let chosenVoice: string | undefined;
let voiceLoad: 'idle' | 'loading' | 'done' = 'idle';

function deviceLocale(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || 'en-US';
  } catch {
    return 'en-US';
  }
}

/**
 * Looks up the installed voices once, in the background. Never awaited by the scan, so a slow or
 * stuck lookup only means the default voice keeps speaking.
 */
export function loadNaturalVoice(): void {
  if (voiceLoad !== 'idle') return;
  voiceLoad = 'loading';
  if (typeof Speech.getAvailableVoicesAsync !== 'function') {
    voiceLoad = 'done';
    return;
  }
  Speech.getAvailableVoicesAsync()
    .then((voices) => {
      chosenVoice = pickNaturalVoice(voices ?? [], deviceLocale());
    })
    .catch(() => {})
    .finally(() => {
      voiceLoad = 'done';
    });
}

/** The voice picked so far (undefined: the system default). */
export function naturalVoice(): string | undefined {
  return chosenVoice;
}

/** For tests. */
export function resetNaturalVoice() {
  chosenVoice = undefined;
  voiceLoad = 'idle';
}

/** Speak a line in the most natural voice found. */
export function speakNaturally(line: string): void {
  Speech.speak(line, { rate: RATE, pitch: 1, ...(chosenVoice ? { voice: chosenVoice } : {}) });
}

/** How each view is introduced out loud: a sentence a person would say, not a screen label. */
const INTRO: Record<string, string> = {
  front: 'Let’s start with your hairline.',
  leftTemple: 'Now your left temple.',
  rightTemple: 'And now the other side.',
  top: 'Next, the top of your head.',
  crown: 'Last one, your crown.',
};

export function viewIntro(view: string, instruction: string): string {
  return `${INTRO[view] ?? ''} ${instruction}.`.trim();
}

const GOT_IT = ['Got it.', 'Nice, got that one.', 'Perfect.'];
let gotItTurn = 0;

/** A few ways to say "got it", in turn, so it doesn't sound like a recording. */
export function gotIt(): string {
  return GOT_IT[gotItTurn++ % GOT_IT.length];
}
