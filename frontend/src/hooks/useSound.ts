import { useEffect, useRef, useCallback } from 'react';

interface UseSoundOptions {
  volume?: number;   // 0.0 to 1.0
  preload?: boolean; // fetch & decode on mount
}

interface UseSoundReturn {
  play: () => void;
  preload: () => Promise<void>;
  isUnlocked: boolean;
}

// Singleton AudioContext shared across all hook instances
let sharedCtx: AudioContext | null = null;
let isUnlocked = false;

function getAudioContext(): AudioContext {
  if (!sharedCtx) {
    sharedCtx = new AudioContext();
  }
  return sharedCtx;
}

// Call once at app root to unlock audio on first user gesture
export function unlockAudio() {
  const unlock = async () => {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    isUnlocked = true;
    document.removeEventListener('click', unlock);
    document.removeEventListener('keydown', unlock);
    document.removeEventListener('touchstart', unlock);
  };

  document.addEventListener('click', unlock);
  document.addEventListener('keydown', unlock);
  document.addEventListener('touchstart', unlock);
}

export function useSound(url: string, options: UseSoundOptions = {}): UseSoundReturn {
  const { volume = 1.0, preload: shouldPreload = true } = options;
  const bufferRef = useRef<AudioBuffer | null>(null);

  const loadBuffer = useCallback(async () => {
    if (bufferRef.current) return; // already loaded
    const ctx = getAudioContext();
    const res = await fetch(url);
    const arrayBuffer = await res.arrayBuffer();
    bufferRef.current = await ctx.decodeAudioData(arrayBuffer);
  }, [url]);

  useEffect(() => {
    if (shouldPreload) {
      loadBuffer().catch(console.error);
    }
  }, [shouldPreload, loadBuffer]);

  const play = useCallback(() => {
    const ctx = getAudioContext();
    if (!bufferRef.current) {
      // Try to load and play (works if user has interacted)
      loadBuffer().then(() => {
        if (!bufferRef.current) return;
        const src = ctx.createBufferSource();
        const gainNode = ctx.createGain();
        gainNode.gain.value = volume;
        src.buffer = bufferRef.current;
        src.connect(gainNode);
        gainNode.connect(ctx.destination);
        src.start(0);
      }).catch(console.error);
      return;
    }

    const src = ctx.createBufferSource();
    const gainNode = ctx.createGain();
    gainNode.gain.value = volume;
    src.buffer = bufferRef.current;
    src.connect(gainNode);
    gainNode.connect(ctx.destination);
    src.start(0);
  }, [volume, loadBuffer]);

  return { play, preload: loadBuffer, isUnlocked };
}