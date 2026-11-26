/** The five fixed views of the guided scan. */
export type ScanView = 'front' | 'leftTemple' | 'rightTemple' | 'top' | 'crown';

export const SCAN_VIEWS: readonly ScanView[] = ['front', 'leftTemple', 'rightTemple', 'top', 'crown'];

/** Quality checks, in the order the user should fix them. Mirrors QualityCheck in Swift. */
export type QualityCheck =
  | 'faceFound'
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
}

export interface CaptureResult {
  /** Local file URI of the full-resolution photo (encrypted at rest by iOS file protection). */
  uri: string;
  view: ScanView;
  /** Measured again on the full-resolution still. */
  report?: QualityReport;
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
}
