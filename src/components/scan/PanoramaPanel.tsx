import { StyleSheet, View } from 'react-native';
import Svg, { Path, Text as SvgText } from 'react-native-svg';

import { Button, Text } from '@/components/ui';
import { BACK_CELLS, CELL_COUNT, coverage, coveragePaths, FACE_CELLS } from '@/scan/headCoverage';
import { colors, radius, spacing } from '@/theme';

export type PanoramaPart = 'face' | 'back';

/**
 * The whole head from above, region by region: green once a region has a good frame, outlined
 * where this part of the panorama is still looking, faint for the other part. Front at the top.
 */
export function HeadCoverage({
  filled,
  part,
  current,
  size = 132,
}: {
  filled: readonly number[];
  part: PanoramaPart;
  current?: number;
  size?: number;
}) {
  const have = new Set(filled);
  const mine = new Set(part === 'face' ? FACE_CELLS : BACK_CELLS);
  return (
    <View
      testID="head-coverage"
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${filled.length} of ${CELL_COUNT} areas of your head captured`}>
      <Svg width={size} height={size}>
        {coveragePaths(size).map(({ cell, d }) => (
          <Path
            key={cell}
            d={d}
            fill={have.has(cell) ? colors.accent : mine.has(cell) ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)'}
            stroke={cell === current ? '#fff' : 'rgba(0,0,0,0.35)'}
            strokeWidth={cell === current ? 2 : 1}
          />
        ))}
        <SvgText x={size / 2} y={9} fontSize={9} fill="rgba(255,255,255,0.8)" textAnchor="middle">
          Front
        </SvgText>
      </Svg>
    </View>
  );
}

/** The panorama step's panel: the coverage picture, what to do now and the ways on. */
export function PanoramaPanel({
  part,
  filled,
  current,
  hint,
  stalled,
  finishing,
  onNext,
  onFinish,
}: {
  part: PanoramaPart;
  filled: readonly number[];
  current?: number;
  hint: string | null;
  /** No new region for a while: offer the way on instead of trapping you. */
  stalled: boolean;
  finishing: boolean;
  onNext: () => void;
  onFinish: () => void;
}) {
  const all = coverage(filled);
  const here = coverage(filled, part === 'face' ? FACE_CELLS : BACK_CELLS);
  return (
    <View style={styles.panel} testID={`panorama-${part}`}>
      <View style={styles.row}>
        <HeadCoverage filled={filled} part={part} current={current} />
        <View style={styles.words}>
          <Text variant="headline">{part === 'face' ? 'Front and sides' : 'Back and top'}</Text>
          <Text variant="caption" color="textMuted" testID="panorama-count">
            {`${all.filled} of ${all.total} areas · this part ${here.filled} of ${here.total}`}
          </Text>
          {hint ? (
            <Text variant="caption" style={{ fontWeight: '600' }} accessibilityLiveRegion="polite" testID="panorama-hint">
              {hint}
            </Text>
          ) : null}
        </View>
      </View>
      {finishing ? (
        <Text variant="caption" color="textMuted">
          Putting your head together…
        </Text>
      ) : part === 'face' ? (
        stalled ? (
          <Button label="Next: the back of my head" variant="secondary" onPress={onNext} />
        ) : null
      ) : stalled ? (
        <Button
          label={all.complete ? 'Finish' : `Finish now (${all.total - all.filled} areas missing)`}
          variant="secondary"
          onPress={onFinish}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: 'rgba(0,0,0,0.72)', borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  words: { flex: 1, gap: spacing.xs },
});
