export type TVSoundStatus = 'starting' | 'ready' | 'blocked' | 'unavailable';

/** One audio context per TV screen. Never replay a bell after a delayed unlock. */
export function createTVAudio(
  createContext: () => AudioContext,
  onStatus: (status: TVSoundStatus) => void,
  now: () => number = Date.now,
) {
  let context: AudioContext | null = null;
  let disposed = false;
  const report = () => {
    if (!disposed && context) onStatus(context.state === 'running' ? 'ready' : 'blocked');
  };
  function resume(): Promise<void> {
    if (disposed) return Promise.resolve();
    try {
      if (!context || context.state === 'closed') {
        if (context) context.onstatechange = null;
        context = createContext();
        context.onstatechange = report;
      }
      const current = context;
      report();
      if (current.state === 'running') return Promise.resolve();
      // This promise can remain pending until a real user gesture. A later
      // gesture must still call resume(), rather than wait behind that promise.
      return current.resume().then(() => {
        if (context === current) report();
      }).catch(() => {
        if (!disposed && context === current) onStatus('blocked');
      });
    } catch {
      onStatus('unavailable');
      return Promise.resolve();
    }
  }
  function ring() {
    const requested = now();
    void resume().then(() => {
      const current = context;
      if (disposed || !current || current.state !== 'running' || now() - requested > 2000) return;
      [659.25, 523.25].forEach((frequency, index) => {
        const oscillator = current.createOscillator();
        const gain = current.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        const time = current.currentTime + index * 0.35;
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(0.24, time + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.7);
        oscillator.connect(gain);
        gain.connect(current.destination);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(time);
        oscillator.stop(time + 0.75);
      });
    });
  }
  function dispose() {
    disposed = true;
    if (context) {
      context.onstatechange = null;
      if (context.state !== 'closed') void context.close().catch(() => {});
      context = null;
    }
  }
  return { resume, ring, dispose };
}
