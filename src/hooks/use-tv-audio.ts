'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createTVAudio, type TVSoundStatus } from '@/lib/tv-audio';

export function useTVAudio() {
  const [status, setStatus] = useState<TVSoundStatus>('starting');
  const controller = useRef<ReturnType<typeof createTVAudio> | null>(null);
  useEffect(() => {
    const audio = createTVAudio(() => new AudioContext(), setStatus);
    controller.current = audio;
    const resume = () => { void audio.resume(); };
    const gesture = (event: Event) => { if (event.isTrusted) resume(); };
    const visible = () => { if (document.visibilityState === 'visible') resume(); };
    // Try automatically for kiosk browsers with autoplay permission. Ordinary
    // browsers unlock on the first trusted click/key, including fullscreen.
    resume();
    window.addEventListener('click', gesture, true);
    window.addEventListener('keydown', gesture, true);
    window.addEventListener('focus', resume);
    window.addEventListener('pageshow', resume);
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.removeEventListener('click', gesture, true);
      window.removeEventListener('keydown', gesture, true);
      window.removeEventListener('focus', resume);
      window.removeEventListener('pageshow', resume);
      document.removeEventListener('visibilitychange', visible);
      controller.current = null;
      audio.dispose();
    };
  }, []);
  const ring = useCallback(() => controller.current?.ring(), []);
  return { status, ring };
}
