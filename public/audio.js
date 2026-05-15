// ==========================================
// AUDIO MANAGER - Super Family 100
// ==========================================
class AudioManager {
  constructor() {
    this.ctx = null;
    this.bgmNode = null;
    this.bgmGain = null;
    this.sfxGain = null;
    this.isMuted = false;
    this.bgmPlaying = false;
    this.bgmInterval = null;
  }

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = 0.15;
    this.bgmGain.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.4;
    this.sfxGain.connect(this.ctx.destination);
  }

  toggle() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      if (this.bgmGain) this.bgmGain.gain.value = 0;
      if (this.sfxGain) this.sfxGain.gain.value = 0;
    } else {
      if (this.bgmGain) this.bgmGain.gain.value = 0.15;
      if (this.sfxGain) this.sfxGain.gain.value = 0.4;
    }
    return this.isMuted;
  }

  // --- BACKGROUND MUSIC ---
  startBGM() {
    if (this.bgmPlaying) return;
    this.init();
    this.bgmPlaying = true;
    this.playBGMLoop();
  }

  stopBGM() {
    this.bgmPlaying = false;
    if (this.bgmInterval) {
      clearInterval(this.bgmInterval);
      this.bgmInterval = null;
    }
  }

  playBGMLoop() {
    if (!this.bgmPlaying) return;
    this.playBGMBar();
    this.bgmInterval = setInterval(() => {
      if (this.bgmPlaying) this.playBGMBar();
    }, 4000);
  }

  playBGMBar() {
    if (!this.ctx || !this.bgmPlaying) return;
    const now = this.ctx.currentTime;
    // Fun upbeat melody
    const notes = [
      [261.63, 0, 0.3],    // C4
      [329.63, 0.3, 0.3],  // E4
      [392.00, 0.6, 0.3],  // G4
      [523.25, 0.9, 0.5],  // C5
      [392.00, 1.5, 0.3],  // G4
      [440.00, 1.8, 0.3],  // A4
      [493.88, 2.1, 0.3],  // B4
      [523.25, 2.4, 0.5],  // C5
      [440.00, 3.0, 0.3],  // A4
      [349.23, 3.3, 0.5],  // F4
    ];

    notes.forEach(([freq, offset, dur]) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.08, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.01, now + offset + dur);
      osc.connect(gain);
      gain.connect(this.bgmGain);
      osc.start(now + offset);
      osc.stop(now + offset + dur + 0.1);
    });

    // Bass line
    const bass = [
      [130.81, 0, 1],    // C3
      [164.81, 1, 1],    // E3
      [174.61, 2, 1],    // F3
      [196.00, 3, 1],    // G3
    ];

    bass.forEach(([freq, offset, dur]) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.06, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.01, now + offset + dur);
      osc.connect(gain);
      gain.connect(this.bgmGain);
      osc.start(now + offset);
      osc.stop(now + offset + dur + 0.1);
    });
  }

  // --- SOUND EFFECTS ---
  playBuzzer() {
    this.init();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.2);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  playCorrect() {
    this.init();
    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.3, now + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.2);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + i * 0.1);
      osc.stop(now + i * 0.1 + 0.3);
    });
  }

  playWrong() {
    this.init();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.3);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  playStrike() {
    this.init();
    const now = this.ctx.currentTime;
    [300, 200].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.25, now + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.15 + 0.2);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + i * 0.15);
      osc.stop(now + i * 0.15 + 0.25);
    });
  }

  playRoundWin() {
    this.init();
    const now = this.ctx.currentTime;
    const melody = [523.25, 659.25, 783.99, 1046.50];
    melody.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.3, now + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.15 + 0.3);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + i * 0.15);
      osc.stop(now + i * 0.15 + 0.4);
    });
  }

  playGameOver() {
    this.init();
    const now = this.ctx.currentTime;
    const melody = [783.99, 659.25, 523.25, 392.00, 523.25, 659.25, 783.99, 1046.50];
    melody.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.25, now + i * 0.2);
      gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.2 + 0.35);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + i * 0.2);
      osc.stop(now + i * 0.2 + 0.4);
    });
  }

  playTick() {
    this.init();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 1000;
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  playCountdown() {
    this.init();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 600;
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.12);
  }
}

const audio = new AudioManager();
