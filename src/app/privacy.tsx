import { Card, SubScreen, Text } from '@/components/ui';
import { spacing } from '@/theme';

const POINTS: { title: string; body: string }[] = [
  {
    title: 'Your scan photos stay on your phone',
    body: 'They are measured on the phone and kept in the app’s private storage. They are never sold.',
  },
  {
    title: 'Family photos need their OK',
    body: 'Only add photos of relatives who are happy for you to. They are kept on your phone like your scans.',
  },
  {
    title: 'Health answers stay out of analytics',
    body: 'Your answers, logs and medicines are never sent to ad or analytics tools, and reminders never name a medicine on the lock screen.',
  },
  {
    title: 'Delete everything any time',
    body: 'Deleting a scan removes its photos and measurements from the phone straight away. Deleting the app removes everything.',
  },
];

/** The privacy promise in plain words, linked from the paywall and settings. */
export default function PrivacyScreen() {
  return (
    <SubScreen title="Privacy" close>
      <Text color="textMuted">The short version of how this app treats your data.</Text>
      {POINTS.map((p) => (
        <Card key={p.title} style={{ gap: spacing.xs }}>
          <Text variant="headline">{p.title}</Text>
          <Text color="textMuted">{p.body}</Text>
        </Card>
      ))}
      <Text variant="caption" color="textMuted">
        Estimates for wellness tracking, not a diagnosis. The full privacy policy is published before launch.
      </Text>
    </SubScreen>
  );
}
