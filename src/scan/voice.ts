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
