import { loadNaturalVoice, pickNaturalVoice, resetNaturalVoice, speakNaturally, viewIntro, VoiceCoach } from '@/scan/voice';

describe('VoiceCoach', () => {
  it('waits for a line to settle before speaking it', () => {
    const speak = jest.fn();
    const c = new VoiceCoach(speak, { settleMs: 1000, repeatMs: 5000 });
    expect(c.update('Move closer', 0, true)).toBeNull();
    expect(c.update('Move closer', 500, true)).toBeNull();
    expect(c.update('Move closer', 1000, true)).toBe('Move closer');
    expect(speak).toHaveBeenCalledWith('Move closer');
  });

  it('does not chatter while the line keeps changing', () => {
    const speak = jest.fn();
    const c = new VoiceCoach(speak, { settleMs: 1000 });
    for (let t = 0; t < 5000; t += 400) c.update(t % 800 ? 'Move left' : 'Move right', t, true);
    expect(speak).not.toHaveBeenCalled();
  });

  it('does not repeat the same line within the cool-down', () => {
    const speak = jest.fn();
    const c = new VoiceCoach(speak, { settleMs: 0, repeatMs: 5000 });
    c.update('Hold', 0, true);
    c.update('Hold', 0, true);
    c.update('Hold', 3000, true);
    expect(speak).toHaveBeenCalledTimes(1);
    c.update('Hold', 6000, true);
    expect(speak).toHaveBeenCalledTimes(2);
  });

  it('stays silent when disabled and speaks immediately with say()', () => {
    const speak = jest.fn();
    const c = new VoiceCoach(speak, { settleMs: 0 });
    c.update('Hold', 0, false);
    c.update('Hold', 10, false);
    expect(speak).not.toHaveBeenCalled();
    c.say('Crown', 20);
    expect(speak).toHaveBeenCalledWith('Crown');
  });
});

describe('a natural voice', () => {
  const v = (identifier: string, quality = 'Default', language = 'en-US', name = identifier) => ({ identifier, name, quality, language });

  it('prefers premium, then enhanced, over the compact default, and never a novelty voice', () => {
    const voices = [
      v('com.apple.speech.synthesis.voice.Zarvox'),
      v('com.apple.eloquence.en-US.Rocko'),
      v('com.apple.voice.compact.en-US.Samantha'),
      v('com.apple.voice.enhanced.en-US.Evan', 'Enhanced'),
      v('com.apple.voice.premium.en-US.Zoe'),
    ];
    expect(pickNaturalVoice(voices, 'en-US')).toBe('com.apple.voice.premium.en-US.Zoe');
    expect(pickNaturalVoice(voices.slice(0, 4), 'en-US')).toBe('com.apple.voice.enhanced.en-US.Evan');
    expect(pickNaturalVoice(voices.slice(0, 2), 'en-US')).toBeUndefined();
  });

  it('keeps to English, in the phone’s own accent when there is a choice, and local voices on Android', () => {
    const voices = [v('fr-fr-x-vlf-local', 'Enhanced', 'fr-FR'), v('en-us-x-tpf-network', 'Enhanced'), v('en-gb-x-gbd-local', 'Enhanced', 'en-GB'), v('en-us-x-iob-local', 'Enhanced')];
    expect(pickNaturalVoice(voices, 'en-US')).toBe('en-us-x-iob-local');
    expect(pickNaturalVoice(voices, 'en-GB')).toBe('en-gb-x-gbd-local');
  });

  it('speaks in the picked voice once found, and the default until then', async () => {
    const Speech = jest.requireMock('expo-speech') as { speak: jest.Mock; getAvailableVoicesAsync: jest.Mock };
    resetNaturalVoice();
    Speech.speak.mockClear();
    speakNaturally('Hello');
    expect(Speech.speak.mock.calls[0][1].voice).toBeUndefined();
    Speech.getAvailableVoicesAsync.mockResolvedValueOnce([v('com.apple.voice.compact.en-US.Samantha'), v('com.apple.voice.premium.en-US.Zoe')]);
    loadNaturalVoice();
    for (let i = 0; i < 5; i++) await Promise.resolve();
    speakNaturally('Hi');
    expect(Speech.speak.mock.calls[1][1].voice).toBe('com.apple.voice.premium.en-US.Zoe');
    resetNaturalVoice();
  });

  it('introduces views like a person would', () => {
    expect(viewIntro('front', 'Look straight at the phone')).toBe('Let’s start with your hairline. Look straight at the phone.');
  });
});
