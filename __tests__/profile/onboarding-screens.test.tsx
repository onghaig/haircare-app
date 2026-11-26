import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import type { ReactNode } from 'react';

import TabsLayout from '@/app/(tabs)/_layout';
import WelcomeScreen from '@/app/onboarding';
import QuestionsScreen from '@/app/onboarding/questions';
import { ProfileProvider } from '@/profile/ProfileProvider';
import { MemoryProfileStore } from '@/profile/store';
import { emptyProfile, type Profile } from '@/profile/types';

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), dismissAll: jest.fn() },
    Redirect: ({ href }: { href: string }) => <Text>{`redirect:${href}`}</Text>,
  };
});
jest.mock('expo-router/native-tabs', () => {
  const { Text } = jest.requireActual('react-native');
  const NativeTabs = ({ children }: { children: ReactNode }) => <>{children}</>;
  const Trigger = ({ name }: { name: string }) => <Text>{`tab:${name}`}</Text>;
  Trigger.Label = () => null;
  Trigger.Icon = () => null;
  NativeTabs.Trigger = Trigger;
  return { NativeTabs };
});
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: false, assets: [{ uri: 'file:///tmp/dad.jpg' }] })),
}));

function withProfile(ui: ReactNode, seed: Partial<Profile> = {}) {
  const store = new MemoryProfileStore({ ...emptyProfile(), ...seed });
  return { store, ui: <ProfileProvider store={store}>{ui}</ProfileProvider> };
}

const press = (name: string | RegExp) => fireEvent.press(screen.getByRole('button', { name }));
const choose = (role: 'radio' | 'checkbox', name: string | RegExp) => fireEvent.press(screen.getByRole(role, { name }));

beforeEach(() => jest.clearAllMocks());

describe('first launch', () => {
  it('sends new users to onboarding, and onboarded users to the tabs', async () => {
    await render(withProfile(<TabsLayout />).ui);
    expect(await screen.findByText('redirect:/onboarding')).toBeOnTheScreen();
    await render(withProfile(<TabsLayout />, { completedAt: '2026-11-26T10:00:00Z' }).ui);
    expect(await screen.findByText('tab:index')).toBeOnTheScreen();
  });

  it('welcome makes one promise and starts the questions', async () => {
    await render(withProfile(<WelcomeScreen />).ui);
    expect(screen.getByText(/See where your hair is heading/)).toBeOnTheScreen();
    expect(screen.getByText('Your photos stay encrypted and are never sold.')).toBeOnTheScreen();
    await press('Start my forecast');
    expect(router.push).toHaveBeenCalledWith('/onboarding/questions');
  });
});

describe('onboarding questions', () => {
  it('walks all nine steps, saves the profile and opens the first scan', async () => {
    const { store, ui } = withProfile(<QuestionsScreen />);
    await render(ui);

    // 1. Basics: age and sex are required.
    expect(screen.getByText('1 of 9')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await fireEvent.changeText(screen.getByLabelText('Your age'), '24');
    await choose('radio', 'Male');
    await press('Continue');

    // 2. Ancestry.
    expect(await screen.findByText('Your background')).toBeOnTheScreen();
    await choose('checkbox', 'White or European');
    await press('Continue');

    // 3. Tap the head: the head diagram and the chips are the same control.
    expect(await screen.findByText('Where are you noticing it?')).toBeOnTheScreen();
    expect(screen.getByText('3 of 9')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('zone-temples-f0'));
    expect(screen.getByRole('checkbox', { name: 'Temples' })).toBeChecked();
    expect(screen.getByText(/Pattern: temples first/)).toBeOnTheScreen();
    await choose('checkbox', 'Crown');
    expect(screen.getByText(/Pattern: front and crown/)).toBeOnTheScreen();
    await press('Continue');

    // 4. When and shedding.
    await choose('radio', '1 to 3 years');
    await choose('radio', '50 to 100');
    await press('Continue');

    // 5. Family tree: Dad is bald, with a photo.
    expect(await screen.findByText('Who in your family lost their hair?')).toBeOnTheScreen();
    await press(/^Dad, not answered/);
    await choose('radio', 'Bald or mostly bald');
    await choose('radio', 'In their 30s');
    await press('Add photo');
    await waitFor(() => expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalled());
    await press('Done');
    expect(await screen.findByRole('button', { name: 'Dad, Bald, photo added' })).toBeOnTheScreen();
    expect(screen.getByText(/1 of 1 relatives with loss/)).toBeOnTheScreen();
    await press('Continue');

    // 6. Treatments: adults see prescription options.
    expect(screen.getByRole('checkbox', { name: 'Finasteride' })).toBeOnTheScreen();
    await choose('checkbox', 'Minoxidil');
    await press('Continue');

    // 7 to 9.
    await press('Continue');
    await choose('radio', '7+ hours');
    await press('Continue');
    await choose('radio', 'Keep what I have');
    await press('Continue to your scan');

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/scan/session'));
    expect(router.dismissAll).toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith('/(tabs)/scan');
    const saved = await store.load();
    expect(saved).toMatchObject({
      age: 24,
      sex: 'male',
      ancestry: ['white'],
      zones: ['temples', 'crown'],
      noticed: '1to3y',
      shedding: '50to100',
      treatments: ['minoxidil'],
      sleep: 'good',
      goal: 'keep',
    });
    expect(saved.family.father).toEqual({ status: 'bald', startAge: 30, photoUri: 'file:///tmp/dad.jpg' });
    expect(saved.completedAt).toBeDefined();
  });

  it('"not noticing it yet" skips the when question', async () => {
    await render(withProfile(<QuestionsScreen />, { age: 22, sex: 'male' }).ui);
    await press('Continue');
    await press('Continue');
    await choose('checkbox', 'Not noticing it yet, but worried');
    expect(screen.getByText(/No changes yet/)).toBeOnTheScreen();
    await press('Continue');
    expect(screen.queryByText('When did you first notice changes?')).toBeNull();
    expect(screen.getByText('Hairs you notice falling each day')).toBeOnTheScreen();
  });

  it('never shows prescription treatments to under-18s', async () => {
    await render(withProfile(<QuestionsScreen />, { age: 16, sex: 'male' }).ui);
    for (let i = 0; i < 5; i++) await press('Continue');
    expect(screen.getByText('Anything you already use?')).toBeOnTheScreen();
    expect(screen.queryByRole('checkbox', { name: 'Finasteride' })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: 'Dutasteride' })).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Minoxidil' })).toBeOnTheScreen();
  });

  it('back goes to the previous step', async () => {
    await render(withProfile(<QuestionsScreen />, { age: 30, sex: 'female' }).ui);
    await press('Continue');
    expect(screen.getByText('2 of 9')).toBeOnTheScreen();
    await press('Back');
    expect(screen.getByText('1 of 9')).toBeOnTheScreen();
    await press('Back');
    expect(router.back).toHaveBeenCalled();
  });
});

