import test from 'node:test';
import assert from 'node:assert/strict';
import { createTVAudio, type TVSoundStatus } from '../src/lib/tv-audio';

class AudioFixture {
  state: AudioContextState = 'suspended';
  allowed = false;
  onstatechange: (() => void) | null = null;
  currentTime = 1;
  destination = {};
  tones = 0;
  closes = 0;
  resumes = 0;
  pending: (() => void)[] = [];
  resume() {
    this.resumes++;
    if (this.allowed) {
      this.state = 'running';
      this.onstatechange?.();
      this.pending.splice(0).forEach(resolve => resolve());
      return Promise.resolve();
    }
    return new Promise<void>(resolve => this.pending.push(resolve));
  }
  close() { this.state = 'closed'; this.closes++; return Promise.resolve(); }
  createOscillator() {
    return { type: '', frequency: { value: 0 }, connect() {}, disconnect() {}, onended: null,
      start: () => { this.tones++; }, stop() {} };
  }
  createGain() {
    return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect() {}, disconnect() {} };
  }
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
function fixture() {
  const context = new AudioFixture();
  const states: TVSoundStatus[] = [];
  let time = 0;
  const controller = createTVAudio(() => context as unknown as AudioContext, value => states.push(value), () => time);
  return { context, states, controller, advance: (ms: number) => { time += ms; } };
}
test('TV audio resumes automatically when autoplay is allowed and rings two tones', async () => {
  const {context, states, controller} = fixture();
  context.allowed = true;
  await controller.resume();
  assert.equal(states.at(-1), 'ready');
  controller.ring(); await flush();
  assert.equal(context.tones, 2);
  context.state = 'suspended'; context.onstatechange?.();
  assert.equal(states.at(-1), 'blocked');
  await controller.resume();
  assert.equal(states.at(-1), 'ready');
  controller.dispose(); assert.equal(context.closes, 1);
});
test('a user gesture can resume despite an earlier pending autoplay attempt', async () => {
  const {context, states, controller} = fixture();
  void controller.resume();
  assert.equal(states.at(-1), 'blocked');
  assert.equal(context.tones, 0);
  context.allowed = true;
  await controller.resume(); await flush();
  assert.equal(context.resumes, 2);
  assert.equal(states.at(-1), 'ready');
  assert.equal(context.tones, 0, 'unlocking does not play an unsolicited bell');
  controller.ring(); await flush(); assert.equal(context.tones, 2);
  controller.dispose();
});
test('unlocking later never replays old calls, and unmount cancels pending audio', async () => {
  const {context, controller, advance} = fixture();
  controller.ring(); advance(5000);
  context.allowed = true;
  await controller.resume(); await flush();
  assert.equal(context.tones, 0);
  context.state = 'suspended'; context.allowed = false;
  controller.ring(); controller.dispose();
  context.pending.splice(0).forEach(resolve => resolve()); await flush();
  assert.equal(context.tones, 0);
  assert.equal(context.closes, 1);
});
test('unsupported audio is reported honestly instead of showing ready', async () => {
  const states: TVSoundStatus[] = [];
  const controller = createTVAudio(() => { throw new Error('unsupported'); }, value => states.push(value));
  await controller.resume(); assert.equal(states.at(-1), 'unavailable');
  controller.dispose(); await controller.resume(); assert.equal(states.length, 1);
});
