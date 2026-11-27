import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';

import { Button, Card, SubScreen, Text } from '@/components/ui';
import { shortDate } from '@/paywall/plans';
import { assess, hairTypeLine, hairTypeOf, parseIngredients, type Assessment } from '@/products/ingredients';
import { isProductBarcode, lookupProduct, type Product } from '@/products/lookup';
import { useProfile } from '@/profile/ProfileProvider';
import { useScans } from '@/scan/ScanProvider';
import { colors, radius, spacing, type as typeScale } from '@/theme';

type Phase =
  | { kind: 'scan' }
  | { kind: 'looking'; barcode: string }
  | { kind: 'missing'; barcode: string; why: 'notFound' | 'noIngredients' | 'error'; product?: Product }
  | { kind: 'type'; product?: Product }
  | { kind: 'result'; product?: Product; result: Assessment };

const MISSING_COPY = {
  notFound: 'We couldn’t find this product. Open Beauty Facts is a free, volunteer-run database, so some products are missing.',
  noIngredients: 'We found the product, but not its ingredient list.',
  error: 'We couldn’t reach the product database. Check your connection and try again.',
} as const;

/** Scan a shampoo's barcode, or type its ingredients, and see what's harsh for your hair. */
export default function ProductScannerScreen() {
  const { profile } = useProfile();
  const { records } = useScans();
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>({ kind: 'scan' });
  const [typed, setTyped] = useState('');
  const busy = useRef(false);
  const hair = hairTypeOf(records, profile);

  function check(text: string, product?: Product) {
    setPhase({ kind: 'result', product, result: assess(parseIngredients(text), hair) });
  }

  async function onScanned({ data }: BarcodeScanningResult) {
    if (busy.current || !isProductBarcode(data)) return;
    busy.current = true;
    setPhase({ kind: 'looking', barcode: data });
    const r = await lookupProduct(data);
    if (r.kind === 'found' && r.product.ingredientsText) check(r.product.ingredientsText, r.product);
    else if (r.kind === 'found') setPhase({ kind: 'missing', barcode: data, why: 'noIngredients', product: r.product });
    else setPhase({ kind: 'missing', barcode: data, why: r.kind });
  }

  function again() {
    busy.current = false;
    setTyped('');
    setPhase({ kind: 'scan' });
  }

  return (
    <SubScreen title="Check a product" close>
      {phase.kind === 'scan' ? (
        <>
          {permission?.granted ? (
            <View style={styles.camera}>
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
                onBarcodeScanned={(r) => void onScanned(r)}
                testID="product-camera"
              />
              <View style={styles.frame} pointerEvents="none" />
            </View>
          ) : (
            <Card style={styles.card}>
              <Text variant="headline">Use the camera to read the barcode</Text>
              <Text variant="caption" color="textMuted">
                {permission && !permission.canAskAgain ? 'Camera access is off for Haircare. Turn it on in your phone’s settings.' : 'Only the barcode number is used.'}
              </Text>
              {!permission || permission.canAskAgain ? <Button label="Allow camera" onPress={() => void requestPermission()} /> : null}
            </Card>
          )}
          <Text variant="caption" color="textMuted">
            Point at the barcode on the back of the bottle.
          </Text>
          <Button label="Type the ingredients instead" variant="secondary" onPress={() => setPhase({ kind: 'type' })} />
        </>
      ) : phase.kind === 'looking' ? (
        <Card style={[styles.card, { alignItems: 'center' }]}>
          <ActivityIndicator color={colors.accent} />
          <Text color="textMuted">Looking up {phase.barcode}</Text>
        </Card>
      ) : phase.kind === 'missing' ? (
        <Card style={styles.card} testID="product-missing">
          {phase.product ? <Text variant="headline">{phase.product.name}</Text> : null}
          <Text>{MISSING_COPY[phase.why]}</Text>
          <Button label="Type the ingredients" onPress={() => setPhase({ kind: 'type', product: phase.product })} />
          <Button label="Scan another" variant="secondary" onPress={again} />
        </Card>
      ) : phase.kind === 'type' ? (
        <Card style={styles.card}>
          <Text variant="headline">{phase.product ? `Ingredients of ${phase.product.name}` : 'Ingredients'}</Text>
          <Text variant="caption" color="textMuted">
            Copy the list from the back of the bottle, separated by commas.
          </Text>
          <TextInput
            value={typed}
            onChangeText={setTyped}
            multiline
            placeholder="Aqua, Sodium Laureth Sulfate, ..."
            placeholderTextColor={colors.textMuted}
            accessibilityLabel="Ingredients"
            style={styles.input}
          />
          <Button label="Check" disabled={parseIngredients(typed).length === 0} onPress={() => check(typed, phase.product)} />
          <Button label="Back to the camera" variant="secondary" onPress={again} />
        </Card>
      ) : (
        <ResultView product={phase.product} result={phase.result} hairLine={hairTypeLine(hair, shortDate)} onAgain={again} />
      )}
      <Text variant="caption" color="textMuted">
        Product details come from Open Beauty Facts. Only the barcode is sent. A guide to ingredients, not medical advice.
      </Text>
    </SubScreen>
  );
}

function ResultView({ product, result, hairLine, onAgain }: { product?: Product; result: Assessment; hairLine: string; onAgain: () => void }) {
  const tone = result.verdict === 'harsh' ? 'warning' : result.verdict === 'watch' ? 'text' : 'accent';
  return (
    <>
      <Card style={[styles.card, result.verdict === 'harsh' && { borderColor: colors.warning }]} testID="product-result">
        {product ? (
          <Text variant="caption" color="textMuted">
            {[product.brand, product.name].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
        <Text variant="headline" color={tone} testID="product-verdict">
          {result.title}
        </Text>
        <Text variant="caption" color="textMuted">
          {hairLine}
        </Text>
      </Card>

      {result.flags.map((f) => (
        <Card key={f.id} style={styles.card} testID={`flag-${f.id}`}>
          <Text variant="caption" color={f.severity === 'harsh' ? 'warning' : 'textMuted'}>
            {f.severity === 'harsh' ? 'Harsh for your hair' : 'Worth watching'}
          </Text>
          <Text style={{ fontWeight: '600' }}>{f.name}</Text>
          <Text variant="caption">{f.why}</Text>
          <Text variant="caption" color="textMuted">
            In it: {f.found.join(', ')}
          </Text>
        </Card>
      ))}

      {result.good.length ? (
        <Card style={styles.card}>
          <Text variant="headline">Good to see</Text>
          {result.good.map((g) => (
            <Text key={g.id} variant="caption">
              <Text variant="caption" style={{ fontWeight: '600' }}>
                {g.name}.
              </Text>{' '}
              {g.why}
            </Text>
          ))}
        </Card>
      ) : null}

      {result.other.length ? (
        <Text variant="caption" color="textMuted">
          Also in it, but not an issue for your hair: {result.other.join(', ').toLowerCase()}.
        </Text>
      ) : null}
      {result.count < 4 ? (
        <Text variant="caption" color="warning">
          That list looks short. Check it has every ingredient.
        </Text>
      ) : null}
      <Button label="Scan another" variant="secondary" onPress={onAgain} />
    </>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  camera: { aspectRatio: 1, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  frame: { width: '80%', height: '35%', borderWidth: 2, borderColor: colors.accent, borderRadius: radius.sm },
  input: {
    ...typeScale.body,
    color: colors.text,
    minHeight: 120,
    textAlignVertical: 'top',
    padding: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceRaised,
  },
});
