/** The five fixed views of the guided scan. */
export type ScanView = 'front' | 'leftTemple' | 'rightTemple' | 'top' | 'crown';

export const SCAN_VIEWS: readonly ScanView[] = ['front', 'leftTemple', 'rightTemple', 'top', 'crown'];

/** Quality checks, in the order the user should fix them. Mirrors QualityCheck in Swift. */
export type QualityCheck =
  | 'faceFound'
  | 'hairInFrame'
  | 'centred'
  | 'pose'
  | 'distance'
  | 'backlight'
  | 'exposure'
  | 'foreheadVisible'
  | 'sharpness'
  | 'hairlineFound';

export type DistanceHint = 'ok' | 'moveCloser' | 'moveBack';
export type CentringHint = 'ok' | 'moveLeft' | 'moveRight' | 'moveUp' | 'moveDown';

export interface HairlineReport {
  centreMM?: number;
  leftTempleMM?: number;
  rightTempleMM?: number;
  /** Mean temple height minus centre height, in pupil distances. Positive means receded temples. */
  templeRecessionIPD?: number;
  foreheadVisible: boolean;
  interPupilPx: number;
  /** Hairline trace, normalised 0..1 to the frame, for the overlay. */
  curve: [number, number][];
}

/** Top and crown views: which way to move the phone so the hair fills the frame. */
export type AimHint = 'ok' | 'noHair' | 'moveCloser' | 'moveLeft' | 'moveRight' | 'moveUp' | 'moveDown';

/** Mean hair confidence (0 to 1) per cell, row-major from the top left. */
export interface HairGrid {
  cols: number;
  rows: number;
  values: number[];
}

export interface QualityReport {
  view: ScanView;
  /** 0 to 100. Scans under 60 are kept but left out of trend lines. */
  score: number;
  allPassed: boolean;
  passed: QualityCheck[];
  failed: QualityCheck[];
  topIssue?: QualityCheck;
  distance: DistanceHint;
  centring: CentringHint;
  faceWidthPx?: number;
  pose?: { yaw: number; pitch: number; roll: number };
  poseError?: number;
  stats?: { sharpness: number; faceBrightness: number; backlit: boolean };
  hairline?: HairlineReport;
  /** Coarse hair map of the frame (for the scalp map). */
  hairGrid?: HairGrid;
  /** Top and crown views only. Directions are in the camera image (for the crown, your left is left). */
  aim?: { hint: AimHint; hairShare: number; centre?: [number, number] };
  /** Size in pixels of the frame the normalised positions refer to. */
  frameSize?: [number, number];
  /** Face views: a few landmarks (normalised 0..1) by MediaPipe index, for the scalp map. */
  anchors?: Record<string, [number, number]>;
}

export interface CaptureResult {
  /** Local file URI of the full-resolution photo (encrypted at rest by iOS file protection). */
  uri: string;
  view: ScanView;
  /** Measured again on the full-resolution still. */
  report?: QualityReport;
  /** True when this is the best frame of a crown burst rather than a single shot. */
  burst?: boolean;
  /** Set by the app (not the camera): taken with the manual shutter while checks were still red. */
  manual?: boolean;
}

export type PermissionStatus = 'granted' | 'denied';

export interface HeadMapCameraViewProps {
  view: ScanView;
  /** Face width from the baseline scan, for the distance check. */
  baselineFaceWidth?: number | null;
  /** Take the photo automatically once every check has held green (default true). */
  autoCapture?: boolean;
  /** Pause the camera without unmounting (default true). */
  active?: boolean;
  onQuality?: (event: { nativeEvent: QualityReport }) => void;
  onAligned?: (event: { nativeEvent: { view: ScanView } }) => void;
  onCapture?: (event: { nativeEvent: CaptureResult }) => void;
  onError?: (event: { nativeEvent: { message: string } }) => void;
  style?: import('react-native').StyleProp<import('react-native').ViewStyle>;
}

export interface HeadMapCameraViewRef {
  capture(): Promise<void>;
  resetCapture(): Promise<void>;
  /** Watch the frames for this long and send the best one as a capture (crown, on your own). */
  startBurst(durationMs: number): Promise<void>;
}
