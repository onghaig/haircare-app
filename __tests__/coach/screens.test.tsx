import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import TodayScreen from '@/app/(tabs)/index';
import ProgressScreen from '@/app/(tabs)/progress';
import CoachScreen from '@/app/coach';
import QuickLogScreen from '@/app/log';
import ProductScannerScreen from '@/app/products';
import { answer, logQuick, type LogBook } from '@/plan/log';
import { addDays, dayKey } from '@/plan/tasks';

import { hairReading } from '../../test-utils/hairFixtures';
import { makeProviders } from '../../test-utils/providers';
import { record } from '../../test-utils/scanFixtures';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissAll: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

const now = new Date();
const day = (n: number) => dayKey(addDays(now, n));
const adult = { age: 30, sex: 'male' as const, completedAt: '2026-10-01T00:00:00Z' };

function doses(task: 'finasteride' | 'minoxidil', from: number, to: number, book: LogBook = {}) {
  for (let i = from; i <= to; i++) book = answer(book, day(i), task, 'done');
  return book;
}

beforeEach(() => jest.clearAllMocks());

describe('Quick log: food and workouts', () => {
  it('saves the optional answers with the rest', async () => {
    const { wrap, stores } = makeProviders({ profile: adult });
    await render(wrap(<QuickLogScreen />));
    await fireEvent.press(screen.getByRole('radio', { name: 'Normal' }));
    await fireEvent.press(screen.getByRole('radio', { name: '2' }));
    await fireEvent.press(screen.getByRole('radio', { name: '8 h' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Well' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Yes' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect((await stores.log.load())[day(0)].quick).toEqual({ shedding: 'normal', stress: 2, sleepHours: 8, diet: 'well', workout: true });
  });
});

describe('Progress: habits vs your hair', () => {
  it('asks for logs when there are none', async () => {
    const { wrap } = makeProviders({ profile: adult, scans: [record('a', addDays(now, -7).toISOString()), record('b', now.toISOString())] });
    await render(wrap(<ProgressScreen />));
    expect(await screen.findByTestId('lifestyle-empty')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Open quick log' }));
    expect(router.push).toHaveBeenCalledWith('/log');
  });

  it('shows the weeks of habits under the hair score', async () => {
    const log = logQuick({}, day(0), { shedding: 'normal', stress: 4, sleepHours: 6, diet: 'poorly', workout: true });
    const scans = [
      record('a', addDays(now, -8).toISOString(), { hair: hairReading({ score: 61 }) }),
      record('b', addDays(now, -1).toISOString(), { hair: hairReading({ score: 66 }) }),
    ];
    const { wrap } = makeProviders({ profile: adult, scans, log });
    await render(wrap(<ProgressScreen />));
    expect(await screen.findByTestId('lifestyle-card')).toBeOnTheScreen();
    expect(screen.getByLabelText(/^Hair score: .*week 6 hair score 66/)).toBeOnTheScreen();
    expect(screen.getByLabelText('Sleep: week 6 6 hours sleep')).toBeOnTheScreen();
    expect(screen.getByLabelText('Eating: week 6 ate poor')).toBeOnTheScreen();
    expect(screen.getByTestId('lifestyle-links')).toHaveTextContent(/^Not enough to compare yet/);
  });
});

describe('Routine coach', () => {
  it('tracks a new pack and shows when it runs out', async () => {
    const { wrap, stores } = makeProviders({ profile: { ...adult, treatments: ['finasteride'] }, log: doses('finasteride', -3, 0) });
    await render(wrap(<CoachScreen />));
    expect(await screen.findByText('Not tracked yet. Pick the pack you are on now.')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('radio', { name: '30 tablets' }));
    await waitFor(async () => expect((await stores.profile.load()).supplies?.finasteride).toEqual({ packDoses: 30, since: day(0) }));
    expect(await screen.findByText(/^About 29 days left, so it runs out around/)).toBeOnTheScreen();
  });

  it('takes a start date and shows the shedding heads-up', async () => {
    const { wrap, stores } = makeProviders({ profile: { ...adult, treatments: ['minoxidil'] } });
    await render(wrap(<CoachScreen />));
    await fireEvent.press(await screen.findByRole('radio', { name: 'About a month ago' }));
    await waitFor(async () => expect((await stores.profile.load()).treatmentStarts?.minoxidil).toBe(day(-30)));
    expect(await screen.findByTestId('coach-heads-up')).toHaveTextContent(/Month 2: extra shedding is normal/);
  });

  it('sets reminder times', async () => {
    const { wrap, stores } = makeProviders({ profile: { ...adult, reminders: { enabled: true, morning: { hour: 8, minute: 0 }, evening: { hour: 20, minute: 30 }, scanWeekday: 1 } } });
    await render(wrap(<CoachScreen />));
    await fireEvent.press(await screen.findByRole('radio', { name: '7:00' }));
    await waitFor(async () => expect((await stores.profile.load()).reminders?.morning).toEqual({ hour: 7, minute: 0 }));
    await fireEvent.press(screen.getByRole('button', { name: 'Scan a product' }));
    expect(router.push).toHaveBeenCalledWith('/products');
  });
});

describe('Today: coach alerts', () => {
  it('warns when a supply is low and opens the coach', async () => {
    const profile = { ...adult, treatments: ['finasteride' as const], supplies: { finasteride: { packDoses: 28, since: day(-24) } } };
    const { wrap } = makeProviders({ profile, log: doses('finasteride', -24, -1), scans: [record('s', now.toISOString())] });
    await render(wrap(<TodayScreen />));
    expect(await screen.findByTestId('low-finasteride')).toHaveTextContent(/Finasteride: about 4 days left/);
    await fireEvent.press(screen.getByRole('button', { name: /Finasteride: about 4 days left/ }));
    expect(router.push).toHaveBeenCalledWith('/coach');
  });

  it('shows the month 2 heads-up until dismissed', async () => {
    const { wrap, stores } = makeProviders({ profile: { ...adult, treatments: ['minoxidil'] }, log: doses('minoxidil', -35, -1), scans: [record('s', now.toISOString())] });
    await render(wrap(<TodayScreen />));
    expect(await screen.findByTestId('shedding-heads-up')).toHaveTextContent(/Month 2: extra shedding is normal/);
    await fireEvent.press(screen.getByRole('button', { name: 'Got it' }));
    await waitFor(() => expect(screen.queryByTestId('shedding-heads-up')).toBeNull());
    expect((await stores.profile.load()).coach?.dismissed).toEqual(['shedding:minoxidil']);
  });
});

describe('Product scanner', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    global.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockReset();
  });

  it('scans a barcode, looks it up and flags what is harsh for curly hair', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 1, product: { product_name: 'Daily Shampoo', brands: 'Acme', ingredients_text: 'Aqua, Sodium Lauryl Sulfate, Dimethicone, Glycerin, Parfum' } }),
    });
    const scans = [record('s', now.toISOString(), { hair: hairReading({ curl: 'curly', dryness: 'some' }) })];
    const { wrap } = makeProviders({ profile: adult, scans });
    await render(wrap(<ProductScannerScreen />));
    await fireEvent(screen.getByTestId('product-camera'), 'onBarcodeScanned', { type: 'ean13', data: '3600541358386' });
    expect(await screen.findByTestId('product-verdict')).toHaveTextContent('Harsh for your hair');
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/3600541358386\.json/);
    expect(screen.getByText('Acme · Daily Shampoo')).toBeOnTheScreen();
    expect(screen.getByTestId('flag-sulfates')).toHaveTextContent(/In it: sodium lauryl sulfate/);
    expect(screen.getByTestId('flag-silicones')).toBeOnTheScreen();
    expect(screen.getByText(/^Checked for your wavy or curly, dry or frizzy hair/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Scan another' }));
    expect(screen.getByTestId('product-camera')).toBeOnTheScreen();
  });

  it('ignores QR codes', async () => {
    const { wrap } = makeProviders({ profile: adult });
    await render(wrap(<ProductScannerScreen />));
    await fireEvent(screen.getByTestId('product-camera'), 'onBarcodeScanned', { type: 'qr', data: 'https://example.com' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('offers typing the list when the product is missing', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 0 }) });
    const { wrap } = makeProviders({ profile: adult });
    await render(wrap(<ProductScannerScreen />));
    await fireEvent(screen.getByTestId('product-camera'), 'onBarcodeScanned', { type: 'ean13', data: '12345670' });
    expect(await screen.findByTestId('product-missing')).toHaveTextContent(/couldn’t find this product/);
    await fireEvent.press(screen.getByRole('button', { name: 'Type the ingredients' }));
    expect(screen.getByRole('button', { name: 'Check' })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Ingredients'), 'Aqua, Decyl Glucoside, Glycerin, Ketoconazole');
    await fireEvent.press(screen.getByRole('button', { name: 'Check' }));
    expect(screen.getByTestId('product-verdict')).toHaveTextContent('Looks fine for your hair');
    expect(screen.getByText(/Not tailored yet/)).toBeOnTheScreen();
  });
});
