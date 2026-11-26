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

const VIEW_POSE: Record<ScanView, string> = {
  front: 'Look straight at the phone, chin level',
  leftTemple: 'Turn your head 45 degrees to the right',
  rightTemple: 'Turn your head 45 degrees to the left',
  top: 'Tilt your head down toward the phone',
  crown: 'Hold the phone above and behind your head',
};

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
    case 'centred': {
      const dir = { moveLeft: 'left', moveRight: 'right', moveUp: 'up', moveDown: 'down', ok: '' }[report.centring];
      return p(`Move your head ${dir} a little`, 'Line up with the outline');
    }
    case 'pose':
      return p(VIEW_POSE[report.view], poseDetail(report));
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
  const chips: StatusChip[] = [
    { label: 'Head level', ok: !failed.has('pose') && !failed.has('centred') && !failed.has('faceFound') },
    { label: 'Distance', ok: !failed.has('distance') && !failed.has('faceFound') },
    { label: 'Light', ok: !failed.has('exposure') && !failed.has('backlight') },
    { label: 'Still', ok: !failed.has('sharpness') },
  ];
  if (report.view === 'front') chips.push({ label: 'Forehead', ok: !failed.has('foreheadVisible') && !failed.has('hairlineFound') });
  return chips;
}
