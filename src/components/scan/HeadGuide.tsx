import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, Path, Text as SvgText } from 'react-native-svg';

import type { HairlineReport, ScanView } from '@modules/headmap';
import { curveToScreen, isUsableCurve, TEMPLATES, toPath, toScreen, TOP_VIEW, type Frame } from '@/scan/hairlineGuide';
import { colors } from '@/theme';

import { HairlineHighlight } from './HairlineHighlight';

/**
 * The head outline the user lines up with. Its size and centre match the native centring
 * and distance checks (face centred 45% down the frame, face about half the frame wide),
 * so "inside the outline" and "all checks green" mean the same thing.
 */
export const GUIDE = { centreX: 0.5, centreY: 0.45, faceShare: 0.5 } as const;

// Head outline in a 200 x 240 box; the face (brow to chin) spans y 40..204, x 36..164.
const OUTLINE = 'M100 10C56 10 36 50 36 104C36 150 60 192 100 204C140 192 164 150 164 104C164 50 144 10 100 10Z';

export function guideFrame(width: number, height: number): Frame {
  const scale = (GUIDE.faceShare * width) / 128;
  const x = GUIDE.centreX * width - 100 * scale;
  const y = GUIDE.centreY * height - 122 * scale;
  return { x, y, scale };
}

/** Top and crown views have no face to fit, so they use a wider box centred in the frame. */
export function backFrame(width: number, height: number): Frame {
  const scale = (0.78 * width) / 200;
  return { x: width / 2 - 100 * scale, y: GUIDE.centreY * height - 120 * scale, scale };
}

/** The line to highlight: the detected hairline when the native module has one, else the view's template. */
export function highlightPoints(view: ScanView, hairline: HairlineReport | undefined, width: number, height: number) {
  const detected = hairline?.curve ? curveToScreen(hairline.curve, width, height) : [];
  if (view !== 'crown' && isUsableCurve(detected)) return { points: detected, detected: true };
  const frame = view === 'top' || view === 'crown' ? backFrame(width, height) : guideFrame(width, height);
  return { points: toScreen(TEMPLATES[view], frame), detected: false };
}

export function HeadGuide({
  view,
  aligned,
  width,
  height,
  hairline,
  complete,
  onDrawn,
}: {
  view: ScanView;
  aligned: boolean;
  width: number;
  height: number;
  hairline?: HairlineReport;
  /** Hold the highlight fully drawn (just after the photo). */
  complete?: boolean;
  /** The highlight finished its first full draw for this view. */
  onDrawn?: () => void;
}) {
  if (width <= 0 || height <= 0) return null;
  const stroke = aligned ? colors.accent : colors.text;
  const hl = highlightPoints(view, hairline, width, height);
  const highlight = (
    <HairlineHighlight
      points={hl.points}
      detected={hl.detected}
      aligned={aligned}
      drawKey={`${view}:${hl.detected}`}
      complete={complete}
      onDrawn={onDrawn}
    />
  );

  if (view === 'top' || view === 'crown') {
    const f = backFrame(width, height);
    const p = (x: number, y: number) => [f.x + x * f.scale, f.y + y * f.scale] as const;
    const [cx, cy] = p(...TOP_VIEW.centre);
    const [kx, ky] = p(...TOP_VIEW.crown);
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="head-guide">
        <Svg width={width} height={height}>
          {view === 'top' ? (
            <>
              {/* Simple top-down head: one oval, the parting line, and the crown target. */}
              <Ellipse cx={cx} cy={cy} rx={TOP_VIEW.rx * f.scale} ry={TOP_VIEW.ry * f.scale} stroke={stroke} strokeWidth={2.6} strokeOpacity={aligned ? 1 : 0.7} fill="none" />
              <Path d={toPath(toScreen(TOP_VIEW.parting, f))} stroke={stroke} strokeOpacity={0.35} strokeWidth={1.5} strokeDasharray="6 6" />
              <Circle cx={kx} cy={ky} r={TOP_VIEW.crownR * f.scale} stroke={colors.accent} strokeWidth={2} strokeDasharray="5 5" fill="none" testID="crown-target" />
              <SvgText x={kx} y={ky - TOP_VIEW.crownR * f.scale - 8} fill={colors.accent} fontSize={13} fontWeight="600" textAnchor="middle">
                Crown
              </SvgText>
            </>
          ) : (
            <Circle cx={cx} cy={cy} r={60 * f.scale} stroke={stroke} strokeWidth={2.6} strokeDasharray="10 8" fill="none" />
          )}
          {highlight}
        </Svg>
      </View>
    );
  }

  const { x, y, scale } = guideFrame(width, height);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="head-guide">
      <Svg width={width} height={height}>
        <Path
          d={OUTLINE}
          transform={`translate(${x} ${y}) scale(${scale})`}
          stroke={stroke}
          strokeWidth={2.6 / scale}
          strokeOpacity={aligned ? 1 : 0.7}
          fill="none"
        />
        {highlight}
      </Svg>
    </View>
  );
}
