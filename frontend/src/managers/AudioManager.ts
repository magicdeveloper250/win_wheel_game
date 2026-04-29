// managers/AudioManager.ts
// Manages all game audio — aviator/plane engine theme

export type SoundKey = "spin" | "tick" | "win" | "zero" | "beep" | "result";

export class AudioManager {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;
  private volume: number = 0.7;

  // Tick engine nodes — kept alive so we can modulate them in real-time
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineOsc2: OscillatorNode | null = null;   // harmonic layer
  private engineGain2: GainNode | null = null;
  private noiseSource: AudioBufferSourceNode | null = null;
  private noiseGain: GainNode | null = null;
  private engineRunning = false;

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
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, ctx.currentTime + startDelay);
      gain.gain.setValueAtTime(gainVal * this.volume, ctx.currentTime + startDelay);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startDelay + duration);
      osc.start(ctx.currentTime + startDelay);
      osc.stop(ctx.currentTime + startDelay + duration);
    } catch (_) {}
  }

  // ── White noise buffer (used as engine rumble texture) ───────────────────
  private createNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
    const sampleRate = ctx.sampleRate;
    const frames     = Math.ceil(sampleRate * durationSec);
    const buffer     = ctx.createBuffer(1, frames, sampleRate);
    const data       = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  // ── Spin start — runway throttle-up ─────────────────────────────────────
  playSpinStart(): void {
    if (!this.enabled) return;
    try {
      const ctx  = this.getCtx();
      const now  = ctx.currentTime;

      // Engine roar sweep: low rumble rises to a throaty mid-range
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(55, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.55);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.22 * this.volume, now + 0.15);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
      osc.start(now);
      osc.stop(now + 0.65);

      // High-pitched turbine whine underneath
      const osc2  = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(900, now);
      osc2.frequency.exponentialRampToValueAtTime(2200, now + 0.55);
      gain2.gain.setValueAtTime(0.0001, now);
      gain2.gain.linearRampToValueAtTime(0.06 * this.volume, now + 0.1);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
      osc2.start(now);
      osc2.stop(now + 0.65);

      // Brief noise burst — air rushing
      const noise     = this.createNoiseBuffer(ctx, 0.5);
      const nSrc      = ctx.createBufferSource();
      const nGain     = ctx.createGain();
      const nFilter   = ctx.createBiquadFilter();
      nSrc.buffer     = noise;
      nFilter.type    = "bandpass";
      nFilter.frequency.value = 800;
      nFilter.Q.value = 0.8;
      nSrc.connect(nFilter);
      nFilter.connect(nGain);
      nGain.connect(ctx.destination);
      nGain.gain.setValueAtTime(0.0001, now);
      nGain.gain.linearRampToValueAtTime(0.12 * this.volume, now + 0.08);
      nGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
      nSrc.start(now);
      nSrc.stop(now + 0.55);
    } catch (_) {}
  }

  // ── Continuous engine drone while wheel spins ─────────────────────────────
  // startTick / stopTick replaced by a living engine sound that
  // runs continuously and speeds up via rampEngineSpeed()
  startTick(speedMs: number = 80): void {
    this.stopTick();
    if (!this.enabled) return;
    try {
      const ctx = this.getCtx();
      const now = ctx.currentTime;

      // --- Primary engine oscillator (sawtooth = propeller chop) ----------
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      // Low-pass to soften the sawtooth into an engine rumble
      const lpf  = ctx.createBiquadFilter();
      lpf.type   = "lowpass";
      lpf.frequency.value = 420;
      lpf.Q.value = 1.2;

      osc.type = "sawtooth";
      // Base frequency — lower = slower/takeoff, higher = cruising
      const baseFreq = Math.max(40, Math.min(120, 8000 / speedMs));
      osc.frequency.setValueAtTime(baseFreq, now);

      osc.connect(lpf);
      lpf.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.18 * this.volume, now + 0.3);
      osc.start(now);

      this.engineOsc  = osc;
      this.engineGain = gain;

      // --- Harmonic layer (one octave up, softer) --------------------------
      const osc2  = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type   = "sawtooth";
      osc2.frequency.setValueAtTime(baseFreq * 2, now);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      gain2.gain.setValueAtTime(0.0001, now);
      gain2.gain.linearRampToValueAtTime(0.07 * this.volume, now + 0.4);
      osc2.start(now);

      this.engineOsc2  = osc2;
      this.engineGain2 = gain2;

      // --- Continuous noise layer (air/wind texture) ----------------------
      const loopDur = 4;
      const nBuf    = this.createNoiseBuffer(ctx, loopDur);
      const nSrc    = ctx.createBufferSource();
      const nGain   = ctx.createGain();
      const nFilter = ctx.createBiquadFilter();
      nSrc.buffer = nBuf;
      nSrc.loop   = true;
      nFilter.type = "bandpass";
      nFilter.frequency.value = 600;
      nFilter.Q.value = 0.5;
      nSrc.connect(nFilter);
      nFilter.connect(nGain);
      nGain.connect(ctx.destination);
      nGain.gain.setValueAtTime(0.0001, now);
      nGain.gain.linearRampToValueAtTime(0.06 * this.volume, now + 0.5);
      nSrc.start(now);

      this.noiseSource = nSrc;
      this.noiseGain   = nGain;

      this.engineRunning = true;
    } catch (_) {}
  }

  // Call this as the wheel accelerates (p 0→1) to pitch the engine up
  private _lastRampTime = 0;
  rampEngineSpeed(progress: number): void {
    if (!this.engineOsc || !this.engineRunning) return;
    try {
      const ctx  = this.getCtx();
      const now  = ctx.currentTime;
      if (now - this._lastRampTime < 0.05) return; // throttle updates
      this._lastRampTime = now;

      // Frequency sweeps from ~50 Hz (idle) up to ~160 Hz (full speed)
      const freq = 50 + progress * 110;
      this.engineOsc.frequency.linearRampToValueAtTime(freq, now + 0.15);
      if (this.engineOsc2) {
        this.engineOsc2.frequency.linearRampToValueAtTime(freq * 2, now + 0.15);
      }
    } catch (_) {}
  }

  stopTick(): void {
    if (!this.engineRunning) return;
    try {
      const ctx = this.getCtx();
      const now = ctx.currentTime;
      const fade = now + 0.4;

      if (this.engineGain) {
        this.engineGain.gain.linearRampToValueAtTime(0.0001, fade);
      }
      if (this.engineGain2) {
        this.engineGain2.gain.linearRampToValueAtTime(0.0001, fade);
      }
      if (this.noiseGain) {
        this.noiseGain.gain.linearRampToValueAtTime(0.0001, fade);
      }

      setTimeout(() => {
        try { this.engineOsc?.stop();  } catch (_) {}
        try { this.engineOsc2?.stop(); } catch (_) {}
        try { this.noiseSource?.stop(); } catch (_) {}
        this.engineOsc    = null;
        this.engineGain   = null;
        this.engineOsc2   = null;
        this.engineGain2  = null;
        this.noiseSource  = null;
        this.noiseGain    = null;
      }, 450);
    } catch (_) {}
    this.engineRunning = false;
  }

  // ── Engine spooling down as wheel decelerates ────────────────────────────
  slowTick(durationMs: number): void {
    if (!this.enabled) return;
    try {
      const ctx  = this.getCtx();
      const now  = ctx.currentTime;
      const dur  = durationMs / 1000;

      // Pitch the existing engine down if still running
      if (this.engineOsc && this.engineRunning) {
        this.engineOsc.frequency.linearRampToValueAtTime(28, now + dur * 0.8);
        if (this.engineOsc2) {
          this.engineOsc2.frequency.linearRampToValueAtTime(56, now + dur * 0.8);
        }
        if (this.engineGain) {
          this.engineGain.gain.linearRampToValueAtTime(0.08 * this.volume, now + dur * 0.5);
          this.engineGain.gain.linearRampToValueAtTime(0.0001, now + dur);
        }
        if (this.engineGain2) {
          this.engineGain2.gain.linearRampToValueAtTime(0.0001, now + dur * 0.7);
        }
        if (this.noiseGain) {
          this.noiseGain.gain.linearRampToValueAtTime(0.0001, now + dur * 0.6);
        }
      } else {
        // Engine already stopped — play a short deceleration puff
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(110, now);
        osc.frequency.linearRampToValueAtTime(30, now + dur);
        gain.gain.setValueAtTime(0.12 * this.volume, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        osc.start(now);
        osc.stop(now + dur + 0.05);
      }
    } catch (_) {}
  }

  // ── Win / loss sounds ────────────────────────────────────────────────────
  playWin(points: number): void {
    if (!this.enabled) return;
    if (points === 0) {
      // Engine stall / abort — descending tones
      this.playTone(260, 0.18, "sawtooth", 0.22, 0);
      this.playTone(200, 0.18, "sawtooth", 0.22, 0.2);
      this.playTone(140, 0.35, "sawtooth", 0.22, 0.4);
    } else if (points >= 30) {
      // Landing fanfare — triumphant ascending chord
      [440, 554, 659, 880, 1108].forEach((f, i) => {
        this.playTone(f, 0.22, "sine", 0.28, i * 0.1);
      });
      // Turbine whine celebration
      try {
        const ctx  = this.getCtx();
        const now  = ctx.currentTime + 0.55;
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(1800, now);
        osc.frequency.exponentialRampToValueAtTime(3200, now + 0.3);
        gain.gain.setValueAtTime(0.08 * this.volume, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.4);
      } catch (_) {}
    } else {
      // Normal win — short altitude ping
      this.playTone(523, 0.14, "sine", 0.22, 0);
      this.playTone(659, 0.16, "sine", 0.22, 0.12);
      this.playTone(784, 0.22, "sine", 0.22, 0.26);
    }
  }

  // ── Cockpit button click ─────────────────────────────────────────────────
  playClick(): void {
    // Mechanical switch click
    this.playTone(1200, 0.03, "square", 0.12);
    this.playTone(600,  0.04, "square", 0.08, 0.03);
  }

  // ── Countdown beep (radio altimeter style) ───────────────────────────────
  playBeep(countdownValue: number): void {
    const freq = countdownValue <= 3 ? 1100 : 660;
    this.playTone(freq, 0.09, "sine", 0.18);
    if (countdownValue <= 3) {
      // Double-beep urgency
      this.playTone(freq, 0.07, "sine", 0.14, 0.13);
    }
  }

  destroy(): void {
    this.stopTick();
    try { this.ctx?.close(); } catch (_) {}
  }
}

export const audioManager = new AudioManager();