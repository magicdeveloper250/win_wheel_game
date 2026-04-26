// managers/AudioManager.ts
// Manages all game audio: spin, tick, win, zero, countdown beeps

export type SoundKey = "spin" | "tick" | "win" | "zero" | "beep" | "result";

export class AudioManager {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;
  private volume: number = 0.7;
  private tickInterval: ReturnType<typeof setInterval> | null = null;

  private getCtx(): AudioContext {
    if (!this.ctx || this.ctx.state === "closed") {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return this.ctx;
  }

  setEnabled(val: boolean): void {
    this.enabled = val;
    if (!val) this.stopTick();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    if (!this.enabled) this.stopTick();
    return this.enabled;
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
  }

  private playTone(
    frequency: number,
    duration: number,
    type: OscillatorType = "sine",
    gainVal: number = 0.3,
    startDelay: number = 0,
  ): void {
    if (!this.enabled) return;
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, ctx.currentTime + startDelay);
      gain.gain.setValueAtTime(gainVal * this.volume, ctx.currentTime + startDelay);
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        ctx.currentTime + startDelay + duration,
      );
      osc.start(ctx.currentTime + startDelay);
      osc.stop(ctx.currentTime + startDelay + duration);
    } catch (_) {
      // Audio error — ignore silently
    }
  }

  playBeep(countdownValue: number): void {
    const freq = countdownValue <= 3 ? 880 : 440;
    this.playTone(freq, 0.12, "square", 0.2);
  }

  playSpinStart(): void {
    // Rising whoosh
    try {
      const ctx = this.getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(80, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.4);
      gain.gain.setValueAtTime(0.15 * this.volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.5);
    } catch (_) {}
  }

  startTick(speedMs: number = 80): void {
    this.stopTick();
    if (!this.enabled) return;
    this.tickInterval = setInterval(() => {
      this.playTone(900, 0.04, "square", 0.08);
    }, speedMs);
  }

  stopTick(): void {
    if (this.tickInterval !== null) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  slowTick(durationMs: number): void {
    // Gradually slow ticking as wheel decelerates
    if (!this.enabled) return;
    const steps = 8;
    const stepTime = durationMs / steps;
    for (let i = 0; i < steps; i++) {
      const delay = i * stepTime;
      const freq = 600 - i * 40;
      setTimeout(() => {
        if (this.enabled) this.playTone(freq, 0.06, "square", 0.12);
      }, delay);
    }
  }

  playWin(points: number): void {
    if (!this.enabled) return;
    if (points === 0) {
      // Sad trombone-ish
      this.playTone(300, 0.15, "sawtooth", 0.25, 0);
      this.playTone(250, 0.15, "sawtooth", 0.25, 0.16);
      this.playTone(200, 0.3, "sawtooth", 0.25, 0.32);
    } else if (points >= 30) {
      // Big win fanfare
      [523, 659, 784, 1047].forEach((f, i) => {
        this.playTone(f, 0.18, "sine", 0.3, i * 0.12);
      });
    } else {
      // Normal win
      this.playTone(523, 0.12, "sine", 0.25, 0);
      this.playTone(659, 0.15, "sine", 0.25, 0.1);
      this.playTone(784, 0.2, "sine", 0.25, 0.22);
    }
  }

  playClick(): void {
    this.playTone(800, 0.05, "square", 0.15);
  }

  destroy(): void {
    this.stopTick();
    try {
      this.ctx?.close();
    } catch (_) {}
  }
}

export const audioManager = new AudioManager();
