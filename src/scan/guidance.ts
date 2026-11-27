import type { QualityCheck, QualityReport, ScanView } from '@modules/headmap';

/**
 * Turns a live quality report into the one thing to tell the user right now, plus the
 * status chips under the camera. Copy follows the spec: short, specific, never blaming.
 */
export interface Prompt {
  title: string;
  detail?: string;
  /** `ready` while holding green before auto-capture. */
  tone: 'fix' | 'ready';
  /** Spoken line for voice guidance (always used for the crown, optional elsewhere). */
  voice: string;
}

/**
 * What to do for each view, in body-anchored words. "Left" and "right" on their own are
 * ambiguous on a mirrored screen, so the temples name the shoulder to turn your nose toward.
 *
 * Direction, pinned in a test: to show the camera your left temple you turn your head to your
 * right. That matches the pose gate (left temple target yaw -45; MediaPipe's yaw is negative when
 * the nose turns toward the subject's right). The green line's side is set separately, from what
 * people saw on a real phone (see hairlineGuide.ts). Temples now take the photo as soon as the
 * head is turned the right way and that side's hairline is clearly in the shot.
 */
const VIEW_POSE: Record<ScanView, string> = {
  front: 'Look straight at the phone, chin level',
  leftTemple: 'Show your left temple: turn your nose toward your right shoulder',
  rightTemple: 'Show your right temple: turn your nose toward your left shoulder',
  top: 'Tilt your head down toward the phone',
  crown: 'Hold the phone up high above your head, camera pointing down',
};

/** Target yaw per temple view, in the camera module's convention (negative: nose to your right). */
export const TEMPLE_YAW: Partial<Record<ScanView, number>> = { leftTemple: -45, rightTemple: 45 };

/**
 * Which shoulder to turn your nose toward to reach the view's target yaw, or null when the turn
 * is close enough (within 5 degrees) or the view isn't a temple.
 */
export function turnToward(view: ScanView, yaw: number | undefined): 'right' | 'left' | null {
  const target = TEMPLE_YAW[view];
  if (target == null || yaw == null) return null;
  const diff = target - yaw;
  if (Math.abs(diff) < 5) return null;
  return diff < 0 ? 'right' : 'left';
}

/** What to do for a view, spoken when the view starts. */
export function viewInstruction(view: ScanView): string {
  return VIEW_POSE[view];
}

export function promptFor(report: QualityReport): Prompt {
  const issue = report.topIssue;
  if (!issue || report.allPassed) {
    return { title: 'Hold still', detail: 'Capturing', tone: 'ready', voice: 'Hold' };
  }
  const p = (title: string, detail?: string, voice = title): Prompt => ({ title, detail, tone: 'fix', voice });
  switch (issue) {
    case 'faceFound':
      return report.view === 'crown'
        ? p('Point the camera at your crown', undefined, 'A little higher, tilt the phone toward you')
        : p('Bring your face into the outline');
    case 'hairInFrame':
      return report.view === 'crown'
        ? p('Point the camera at your crown', 'The back of your head should fill the circle', 'A little higher, tilt the phone toward you')
        : p('Tilt your head down', 'Let the top of your head fill the oval', 'Tilt your head down until your hair fills the screen');
    case 'centred': {
      const dir = { moveLeft: 'left', moveRight: 'right', moveUp: 'up', moveDown: 'down', ok: '' }[report.centring];
      return p(`Move your head ${dir} a little`, 'Line up with the outline');
    }
    case 'pose': {
      const toward = turnToward(report.view, report.pose?.yaw);
      if (toward) {
        const more = Math.abs((TEMPLE_YAW[report.view] ?? 0) - (report.pose?.yaw ?? 0)) < 30 ? 'a little more ' : '';
        return p(`Turn ${more}toward your ${toward} shoulder`, poseDetail(report), `Turn ${more}toward your ${toward} shoulder`);
      }
      return p(VIEW_POSE[report.view], poseDetail(report));
    }
    case 'distance':
      return report.distance === 'moveCloser'
        ? p('Move a little closer', 'Same distance as your first scan')
        : p('Back a little', 'Same distance as your first scan');
    case 'backlight':
      return p('Face a window or light', 'The light behind you is too bright');
    case 'exposure':
      return (report.stats?.faceBrightness ?? 128) < 128
        ? p('Find more light', 'Face a window or turn on a light')
        : p('Too bright', 'Step out of direct light');
    case 'foreheadVisible':
      return p('Push your hair back a little', 'Your forehead needs to be visible');
    case 'sharpness':
      return p('Hold still', 'The photo is a little blurry');
    case 'hairlineFound':
      return p('Show your hairline', 'Keep the top of your head inside the frame');
  }
}

function poseDetail(r: QualityReport): string | undefined {
  if (!r.pose || r.poseError == null) return undefined;
  return `${Math.round(r.poseError)} degrees off`;
}

export interface StatusChip {
  label: string;
  ok: boolean;
}

/** The five chips under the camera: Head level, Distance, Light, Still, Forehead. */
export function statusChips(report: QualityReport): StatusChip[] {
  const failed = new Set<QualityCheck>(report.failed);
  if (report.view === 'top' || report.view === 'crown') {
    // No face to track: hair in frame, light and stillness are what matter.
    return [
      { label: 'Hair in frame', ok: !failed.has('hairInFrame') },
      { label: 'Light', ok: !failed.has('exposure') && !failed.has('backlight') },
      { label: 'Still', ok: !failed.has('sharpness') },
    ];
  }
  if (report.view === 'leftTemple' || report.view === 'rightTemple') {
    // Temples: the photo takes as soon as the head is turned and that side's hairline is clear.
    return [
      { label: 'Head turned', ok: !failed.has('pose') && !failed.has('faceFound') },
      { label: 'Hairline', ok: !failed.has('hairlineFound') && !failed.has('faceFound') },
      { label: 'Light', ok: !failed.has('exposure') && !failed.has('backlight') },
      { label: 'Still', ok: !failed.has('sharpness') },
    ];
  }
  const chips: StatusChip[] = [
    { label: 'Head level', ok: !failed.has('pose') && !failed.has('centred') && !failed.has('faceFound') },
    { label: 'Distance', ok: !failed.has('distance') && !failed.has('faceFound') },
    { label: 'Light', ok: !failed.has('exposure') && !failed.has('backlight') },
    { label: 'Still', ok: !failed.has('sharpness') },
  ];
  if (report.view === 'front') chips.push({ label: 'Forehead', ok: !failed.has('foreheadVisible') && !failed.has('hairlineFound') });
  return chips;
}

/**
 * The manual shutter stays hidden this long on each view. Auto-capture handles a good pose; the
 * button is a way out for someone stuck, not a way around the checks.
 */
export const MANUAL_AFTER_MS = 8000;

/**
 * Camera and scan-engine failures in plain words. The raw message is for the log, never the
 * screen.
 */
export function cameraErrorMessage(raw: string): { title: string; detail: string } {
  const m = raw.toLowerCase();
  if (/permission|denied|not authori[sz]ed/.test(m)) {
    return { title: 'Camera access is off', detail: 'Turn on camera access for this app in Settings, then try again.' };
  }
  if (/in use|busy|another app|disconnected|interrupted/.test(m)) {
    return { title: 'The camera is busy', detail: 'Close any other app using the camera, then come back.' };
  }
  if (/no camera|unavailable|not available|not found.*camera/.test(m)) {
    return { title: 'No camera found', detail: 'This phone didn’t give the app a front camera to use.' };
  }
  return {
    title: 'The scan couldn’t start',
    detail: 'Close the scan and open it again. If it keeps happening, restart your phone.',
  };
}
