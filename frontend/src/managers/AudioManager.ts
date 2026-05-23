import type { GameBet } from "@/lib/types";

export type SoundKey = "spin" | "tick" | "win" | "zero" | "beep" | "result";

export class AudioManager {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;
  private volume: number = 0.7;

  private pianoInterval: ReturnType<typeof setInterval> | null = null;
  private pianoRunning = false;
  private pianoStep = 0;
  private pianoSpeedMs = 180;

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

  isEnabled(): boolean { return this.enabled; }

  toggle(): boolean {
    this.enabled = !this.enabled;
    if (!this.enabled) this.stopTick();
    return this.enabled;
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
  }

  private createNoise(ctx: AudioContext, duration: number, bandLow: number, bandHigh: number, gainVal: number, startDelay: number = 0): void {
    const bufferSize = Math.ceil(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = (bandLow + bandHigh) / 2;
    bp.Q.value = (bandLow + bandHigh) / (bandHigh - bandLow);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainVal * this.volume, ctx.currentTime + startDelay);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startDelay + duration);

    source.connect(bp);
    bp.connect(gain);
    gain.connect(ctx.destination);
    source.start(ctx.currentTime + startDelay);
    source.stop(ctx.currentTime + startDelay + duration);
  }

  private readonly PIANO_SCALE: number[] = [
    261.63, 293.66, 329.63, 349.23, 392.00,
    440.00, 493.88, 523.25, 587.33, 659.25,
    698.46, 783.99, 880.00, 987.77, 1046.50,
  ];

  private readonly CASINO_MELODY: number[] = [
    523.25, 659.25, 783.99, 880.00, 1046.50,
    880.00, 783.99, 659.25, 523.25, 440.00,
    523.25, 587.33, 659.25, 783.99, 880.00,
    1046.50, 987.77, 880.00, 783.99, 659.25,
  ];

  private playPianoNote(frequency: number, startDelay: number = 0, velocity: number = 0.8): void {
    if (!this.enabled) return;
    try {
      const ctx = this.getCtx();
      const now = ctx.currentTime + startDelay;
      const vol = this.volume * velocity;

      const fundamental = ctx.createOscillator();
      const fGain = ctx.createGain();
      fundamental.type = "sine";
      fundamental.frequency.setValueAtTime(frequency, now);
      fGain.gain.setValueAtTime(0.0001, now);
      fGain.gain.linearRampToValueAtTime(0.30 * vol, now + 0.006);
      fGain.gain.exponentialRampToValueAtTime(0.14 * vol, now + 0.08);
      fGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
      fundamental.connect(fGain);
      fGain.connect(ctx.destination);
      fundamental.start(now);
      fundamental.stop(now + 1.5);

      const harmonics: [number, number, number][] = [
        [2, 0.18, 0.35],
        [3, 0.09, 0.22],
        [4, 0.05, 0.14],
        [5, 0.03, 0.10],
        [6, 0.015, 0.07],
        [7, 0.008, 0.05],
      ];

      for (const [ratio, amp, decay] of harmonics) {
        const h = ctx.createOscillator();
        const hg = ctx.createGain();
        h.type = "sine";
        h.frequency.setValueAtTime(frequency * ratio, now);
        hg.gain.setValueAtTime(0.0001, now);
        hg.gain.linearRampToValueAtTime(amp * vol, now + 0.005);
        hg.gain.exponentialRampToValueAtTime(0.0001, now + decay);
        h.connect(hg);
        hg.connect(ctx.destination);
        h.start(now);
        h.stop(now + decay + 0.01);
      }

      const bufSize = Math.ceil(ctx.sampleRate * 0.012);
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.08));
      const strike = ctx.createBufferSource();
      strike.buffer = buf;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 3000;
      const strikeGain = ctx.createGain();
      strikeGain.gain.setValueAtTime(0.06 * vol, now);
      strikeGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.012);
      strike.connect(hp);
      hp.connect(strikeGain);
      strikeGain.connect(ctx.destination);
      strike.start(now);
      strike.stop(now + 0.015);
    } catch (_) {}
  }

  private playMechanicalClick(startDelay: number = 0): void {
    if (!this.enabled) return;
    try {
      const ctx = this.getCtx();
      const now = ctx.currentTime + startDelay;

      const bufferSize = Math.ceil(ctx.sampleRate * 0.04);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.1));
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;

      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 2000;

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.55 * this.volume, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);

      source.connect(hp);
      hp.connect(gain);
      gain.connect(ctx.destination);
      source.start(now);
      source.stop(now + 0.05);

      const body = ctx.createOscillator();
      const bodyGain = ctx.createGain();
      body.type = "sine";
      body.frequency.setValueAtTime(120, now);
      body.frequency.exponentialRampToValueAtTime(60, now + 0.025);
      bodyGain.gain.setValueAtTime(0.3 * this.volume, now);
      bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
      body.connect(bodyGain);
      bodyGain.connect(ctx.destination);
      body.start(now);
      body.stop(now + 0.035);
    } catch (_) {}
  }

  private playCoinClink(startDelay: number = 0): void {
    if (!this.enabled) return;
    try {
      const ctx = this.getCtx();
      const now = ctx.currentTime + startDelay;

      const partials: [number, number, number][] = [
        [3520, 0.22, 0.18],
        [5274, 0.14, 0.12],
        [7040, 0.08, 0.08],
        [9349, 0.05, 0.06],
        [11175, 0.03, 0.04],
      ];

      for (const [freq, amp, decay] of partials) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(amp * this.volume, now + 0.003);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + decay + 0.01);
      }

      const bufSize = Math.ceil(ctx.sampleRate * 0.015);
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.15));
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.18 * this.volume, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.015);
      noise.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start(now);
      noise.stop(now + 0.02);
    } catch (_) {}
  }

  private playReelStop(pitch: number = 1.0, startDelay: number = 0): void {
    if (!this.enabled) return;
    try {
      const ctx = this.getCtx();
      const now = ctx.currentTime + startDelay;

      const thud = ctx.createOscillator();
      const thudGain = ctx.createGain();
      thud.type = "sine";
      thud.frequency.setValueAtTime(90 * pitch, now);
      thud.frequency.exponentialRampToValueAtTime(40 * pitch, now + 0.07);
      thudGain.gain.setValueAtTime(0.0001, now);
      thudGain.gain.linearRampToValueAtTime(0.5 * this.volume, now + 0.004);
      thudGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
      thud.connect(thudGain);
      thudGain.connect(ctx.destination);
      thud.start(now);
      thud.stop(now + 0.1);

      const snap = ctx.createOscillator();
      const snapGain = ctx.createGain();
      snap.type = "square";
      snap.frequency.setValueAtTime(3000 * pitch, now);
      snap.frequency.exponentialRampToValueAtTime(800 * pitch, now + 0.015);
      snapGain.gain.setValueAtTime(0.15 * this.volume, now);
      snapGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.02);
      snap.connect(snapGain);
      snapGain.connect(ctx.destination);
      snap.start(now);
      snap.stop(now + 0.025);

      this.createNoise(ctx, 0.05, 1000, 8000, 0.12, startDelay);
    } catch (_) {}
  }

  playSpinStart(): void {
    if (!this.enabled) return;
    try {
      const ctx = this.getCtx();

      const leverPull = ctx.createOscillator();
      const lpGain = ctx.createGain();
      leverPull.type = "sawtooth";
      leverPull.frequency.setValueAtTime(180, ctx.currentTime);
      leverPull.frequency.linearRampToValueAtTime(60, ctx.currentTime + 0.12);
      lpGain.gain.setValueAtTime(0.0001, ctx.currentTime);
      lpGain.gain.linearRampToValueAtTime(0.28 * this.volume, ctx.currentTime + 0.01);
      lpGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
      leverPull.connect(lpGain);
      lpGain.connect(ctx.destination);
      leverPull.start(ctx.currentTime);
      leverPull.stop(ctx.currentTime + 0.2);

      this.createNoise(ctx, 0.12, 200, 2000, 0.2, 0.05);

      [0.18, 0.24, 0.30].forEach((delay) => {
        this.playMechanicalClick(delay);
      });

      [0, 1, 2, 3].forEach((i) => {
        this.playPianoNote(this.PIANO_SCALE[i + 4], 0.32 + i * 0.1, 0.6);
      });
    } catch (_) {}
  }

  startTick(speedMs: number = 180): void {
    this.stopTick();
    if (!this.enabled) return;

    this.pianoStep = 0;
    this.pianoSpeedMs = speedMs;
    this.pianoRunning = true;

    const tick = () => {
      if (!this.pianoRunning) return;
      this.playMechanicalClick();
      if (this.pianoStep % 3 === 0) {
        const note = this.CASINO_MELODY[this.pianoStep % this.CASINO_MELODY.length];
        this.playPianoNote(note, 0, 0.45);
      }
      this.pianoStep++;
      this.pianoInterval = setTimeout(tick, this.pianoSpeedMs);
    };

    this.pianoInterval = setTimeout(tick, 0);
  }

  rampEngineSpeed(progress: number): void {
    if (!this.pianoRunning) return;
    this.pianoSpeedMs = Math.max(40, 180 - progress * 140);
  }

  stopTick(): void {
    this.pianoRunning = false;
    if (this.pianoInterval !== null) {
      clearTimeout(this.pianoInterval);
      this.pianoInterval = null;
    }
  }

  slowTick(durationMs: number): void {
    if (!this.enabled) return;
    const steps = 5;
    const interval = durationMs / steps;
    for (let i = 0; i < steps; i++) {
      setTimeout(() => {
        this.playReelStop(1.0 - i * 0.08);
        const noteIdx = this.PIANO_SCALE.length - 1 - i;
        this.playPianoNote(this.PIANO_SCALE[Math.max(0, noteIdx)] * 0.5, 0, 0.5);
      }, i * interval);
    }
  }

  playWin(isWin: GameBet[] | undefined): void {
    if (!this.enabled) return;
    if (!isWin || isWin.length === 0) {
      try {
        const ctx = this.getCtx();
        const now = ctx.currentTime;

        const buzz = ctx.createOscillator();
        const buzzGain = ctx.createGain();
        buzz.type = "sawtooth";
        buzz.frequency.setValueAtTime(220, now);
        buzz.frequency.exponentialRampToValueAtTime(80, now + 0.35);
        buzzGain.gain.setValueAtTime(0.0001, now);
        buzzGain.gain.linearRampToValueAtTime(0.3 * this.volume, now + 0.01);
        buzzGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
        buzz.connect(buzzGain);
        buzzGain.connect(ctx.destination);
        buzz.start(now);
        buzz.stop(now + 0.42);

        this.createNoise(ctx, 0.25, 100, 600, 0.15, 0.08);
      } catch (_) {}
    } else {
      const coinCount = Math.min(isWin.length * 3 + 5, 20);
      for (let i = 0; i < coinCount; i++) {
        const delay = i * 85 + Math.random() * 30;
        setTimeout(() => this.playCoinClink(), delay);
      }

      try {
        const ctx = this.getCtx();

        const fanfareNotes: [number, number, number][] = [
          [523.25, 0, 0.12],
          [659.25, 100, 0.12],
          [783.99, 200, 0.12],
          [1046.50, 300, 0.25],
          [1318.51, 440, 0.15],
          [1567.98, 520, 0.15],
          [2093.00, 600, 0.35],
        ];

        for (const [freq, delayMs, dur] of fanfareNotes) {
          setTimeout(() => {
            try {
              const now = ctx.currentTime;

              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.type = "triangle";
              osc.frequency.setValueAtTime(freq, now);
              gain.gain.setValueAtTime(0.0001, now);
              gain.gain.linearRampToValueAtTime(0.3 * this.volume, now + 0.008);
              gain.gain.setValueAtTime(0.3 * this.volume, now + dur - 0.02);
              gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.start(now);
              osc.stop(now + dur + 0.01);

              const h2 = ctx.createOscillator();
              const h2g = ctx.createGain();
              h2.type = "sine";
              h2.frequency.setValueAtTime(freq * 2, now);
              h2g.gain.setValueAtTime(0.0001, now);
              h2g.gain.linearRampToValueAtTime(0.1 * this.volume, now + 0.006);
              h2g.gain.exponentialRampToValueAtTime(0.0001, now + dur * 0.6);
              h2.connect(h2g);
              h2g.connect(ctx.destination);
              h2.start(now);
              h2.stop(now + dur * 0.65);
            } catch (_) {}
          }, delayMs);
        }

        setTimeout(() => {
          for (let i = 0; i < 8; i++) {
            setTimeout(() => this.playCoinClink(0), i * 60 + Math.random() * 20);
          }
        }, 700);

        const winArp: number[] = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98, 2093.00];
        winArp.forEach((freq, i) => {
          this.playPianoNote(freq, i * 0.09, 0.75);
        });
        setTimeout(() => {
          [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
            this.playPianoNote(freq, i * 0.06 + 0.02, 0.55);
          });
        }, 750);
      } catch (_) {}
    }
  }

  playTap(frequency: number = 440): void {
    if (!this.enabled) return;
    this.playMechanicalClick(0);
  }

  playSuccess(): void {
    if (!this.enabled) return;
    try {
      const ctx = this.getCtx();

      const jackpotNotes: [number, number][] = [
        [392.00, 0],
        [523.25, 80],
        [659.25, 160],
        [783.99, 240],
        [1046.50, 320],
        [1318.51, 400],
        [1567.98, 480],
        [2093.00, 560],
        [2637.02, 620],
      ];

      for (const [freq, delayMs] of jackpotNotes) {
        setTimeout(() => {
          try {
            const now = ctx.currentTime;

            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "square";
            osc.frequency.setValueAtTime(freq, now);
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.linearRampToValueAtTime(0.22 * this.volume, now + 0.005);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.2);

            const sine = ctx.createOscillator();
            const sGain = ctx.createGain();
            sine.type = "sine";
            sine.frequency.setValueAtTime(freq * 0.5, now);
            sGain.gain.setValueAtTime(0.0001, now);
            sGain.gain.linearRampToValueAtTime(0.18 * this.volume, now + 0.006);
            sGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
            sine.connect(sGain);
            sGain.connect(ctx.destination);
            sine.start(now);
            sine.stop(now + 0.16);
          } catch (_) {}
        }, delayMs);
      }

      for (let i = 0; i < 15; i++) {
        setTimeout(() => this.playCoinClink(), i * 90 + Math.random() * 40);
      }

      const jackpotMelody: [number, number][] = [
        [261.63, 0], [329.63, 80], [392.00, 160], [523.25, 240],
        [659.25, 320], [783.99, 400], [1046.50, 480], [1318.51, 560],
        [1567.98, 620], [2093.00, 680],
      ];
      for (const [freq, delayMs] of jackpotMelody) {
        setTimeout(() => this.playPianoNote(freq, 0, 0.85), delayMs);
      }
      setTimeout(() => {
        const triumphChord = [523.25, 659.25, 783.99, 1046.50, 1318.51];
        triumphChord.forEach((freq, i) => {
          this.playPianoNote(freq, i * 0.018, 0.9);
        });
      }, 800);

      setTimeout(() => {
        try {
          const now = ctx.currentTime;
          const chordFreqs = [523.25, 659.25, 783.99, 1046.50];
          for (const freq of chordFreqs) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "triangle";
            osc.frequency.setValueAtTime(freq, now);
            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.linearRampToValueAtTime(0.2 * this.volume, now + 0.01);
            gain.gain.setValueAtTime(0.2 * this.volume, now + 0.4);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.68);
          }
        } catch (_) {}
      }, 700);
    } catch (_) {}
  }

  playError(): void {
    if (!this.enabled) return;
    try {
      const ctx = this.getCtx();
      const now = ctx.currentTime;

      const buzz = ctx.createOscillator();
      const buzzGain = ctx.createGain();
      buzz.type = "sawtooth";
      buzz.frequency.setValueAtTime(160, now);
      buzz.frequency.exponentialRampToValueAtTime(55, now + 0.45);
      buzzGain.gain.setValueAtTime(0.0001, now);
      buzzGain.gain.linearRampToValueAtTime(0.35 * this.volume, now + 0.01);
      buzzGain.gain.setValueAtTime(0.35 * this.volume, now + 0.12);
      buzzGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
      buzz.connect(buzzGain);
      buzzGain.connect(ctx.destination);
      buzz.start(now);
      buzz.stop(now + 0.52);

      const buzz2 = ctx.createOscillator();
      const b2Gain = ctx.createGain();
      buzz2.type = "square";
      buzz2.frequency.setValueAtTime(80, now + 0.1);
      buzz2.frequency.exponentialRampToValueAtTime(30, now + 0.55);
      b2Gain.gain.setValueAtTime(0.0001, now + 0.1);
      b2Gain.gain.linearRampToValueAtTime(0.2 * this.volume, now + 0.12);
      b2Gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.58);
      buzz2.connect(b2Gain);
      b2Gain.connect(ctx.destination);
      buzz2.start(now + 0.1);
      buzz2.stop(now + 0.6);

      this.createNoise(ctx, 0.3, 100, 800, 0.18, 0.05);

      const thud = ctx.createOscillator();
      const thudGain = ctx.createGain();
      thud.type = "sine";
      thud.frequency.setValueAtTime(60, now + 0.52);
      thud.frequency.exponentialRampToValueAtTime(20, now + 0.75);
      thudGain.gain.setValueAtTime(0.0001, now + 0.52);
      thudGain.gain.linearRampToValueAtTime(0.32 * this.volume, now + 0.535);
      thudGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
      thud.connect(thudGain);
      thudGain.connect(ctx.destination);
      thud.start(now + 0.52);
      thud.stop(now + 0.82);
    } catch (_) {}
  }

  playClick(): void {
    if (!this.enabled) return;
    this.playMechanicalClick(0);
  }

  playBeep(countdownValue: number): void {
    if (!this.enabled) return;
    try {
      const ctx = this.getCtx();
      const now = ctx.currentTime;

      const freq = countdownValue <= 3 ? 1400 : 880;
      const urgency = countdownValue <= 3 ? 2 : 1;

      for (let u = 0; u < urgency; u++) {
        const delay = u * 0.13;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.setValueAtTime(freq, now + delay);
        gain.gain.setValueAtTime(0.0001, now + delay);
        gain.gain.linearRampToValueAtTime(0.22 * this.volume, now + delay + 0.005);
        gain.gain.setValueAtTime(0.22 * this.volume, now + delay + 0.055);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + delay);
        osc.stop(now + delay + 0.11);

        const sub = ctx.createOscillator();
        const subGain = ctx.createGain();
        sub.type = "sine";
        sub.frequency.setValueAtTime(freq * 0.5, now + delay);
        subGain.gain.setValueAtTime(0.0001, now + delay);
        subGain.gain.linearRampToValueAtTime(0.12 * this.volume, now + delay + 0.005);
        subGain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.09);
        sub.connect(subGain);
        subGain.connect(ctx.destination);
        sub.start(now + delay);
        sub.stop(now + delay + 0.1);
      }
    } catch (_) {}
  }

  destroy(): void {
    this.stopTick();
    try { this.ctx?.close(); } catch (_) {}
  }
}

export const audioManager = new AudioManager();