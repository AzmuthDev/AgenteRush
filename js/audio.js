/**
 * RUSH_VERSO // OBERHEIM & MOOG ANALOG SYNTHESIS ENGINE
 * Web Audio API synthesizer for retro-futuristic sound effects without external audio assets.
 */

class SynthAudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem('rush_audio_muted') === 'true';
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('rush_audio_muted', this.muted);
    return this.muted;
  }

  isMuted() {
    return this.muted;
  }

  /**
   * Sound when user transmits a message
   * Moog Taurus/Minimoog style punchy synth blip with resonant filter sweep
   */
  playTransmitSound() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;

      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.12);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, now);
      filter.frequency.exponentialRampToValueAtTime(2800, now + 0.08);
      filter.frequency.exponentialRampToValueAtTime(400, now + 0.16);
      filter.Q.value = 5.0;

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.19);
    } catch (e) {
      console.warn('Audio playback error:', e);
    }
  }

  /**
   * Sound when response arrives
   * Oberheim 8-Voice / Subdivisions style synth triad chime (F# - A# - C# chord progression)
   */
  playReceiveSound() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    try {
      const freqs = [370.0, 466.16, 554.37, 739.99]; // F#4, A#4, C#5, F#5
      const now = this.ctx.currentTime;

      freqs.forEach((freq, idx) => {
        const noteStart = now + (idx * 0.045);
        const osc = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, noteStart);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1200, noteStart);
        filter.frequency.exponentialRampToValueAtTime(2400, noteStart + 0.08);
        filter.frequency.exponentialRampToValueAtTime(800, noteStart + 0.35);
        filter.Q.value = 3.5;

        gain.gain.setValueAtTime(0.001, noteStart);
        gain.gain.exponentialRampToValueAtTime(0.08, noteStart + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, noteStart + 0.4);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(noteStart);
        osc.stop(noteStart + 0.42);
      });
    } catch (e) {
      console.warn('Audio playback error:', e);
    }
  }

  /**
   * Click / Relay sound for buttons
   */
  playClickSound() {
    if (this.muted) return;
    this.ensureContext();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.04);

      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.05);
    } catch (e) {
      // Ignore
    }
  }
}

// Attach globally
window.SynthAudioEngine = SynthAudioEngine;
