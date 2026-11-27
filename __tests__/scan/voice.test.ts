import { VoiceCoach } from '@/scan/voice';

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
