// ==========================================
// AUDIO MANAGER - Super Family 100
// ==========================================
class AudioManager {
  constructor() {
    this.ctx = null;
    this.bgmGain = null;
    this.sfxGain = null;
    this.isMuted = false;
    this.bgmPlaying = false;
    this.bgmInterval = null;
    this.barIndex = 0;
  }

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.value = 0.12;
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
      if (this.bgmGain) this.bgmGain.gain.value = 0.12;
      if (this.sfxGain) this.sfxGain.gain.value = 0.4;
    }
    return this.isMuted;
  }

  // --- BACKGROUND MUSIC ---
  startBGM() {
    if (this.bgmPlaying) return;
    this.init();
    this.bgmPlaying = true;
    this.barIndex = 0;
    this.playNextBar();
    this.bgmInterval = setInterval(() => {
      if (this.bgmPlaying) this.playNextBar();
    }, 3200);
  }

  stopBGM() {
    this.bgmPlaying = false;
    if (this.bgmInterval) { clearInterval(this.bgmInterval); this.bgmInterval = null; }
  }

  playNextBar() {
    if (!this.ctx || !this.bgmPlaying) return;
    const bars = [
      // Bar 1 - Upbeat intro
      { melody: [[392,0,.25],[440,0.3,.25],[523,0.6,.4],[659,1.1,.3],[587,1.5,.3],[523,1.8,.4],[440,2.3,.3],[392,2.7,.4]], bass: [[196,0,0.8],[220,0.8,0.8],[262,1.6,0.8],[196,2.4,0.8]] },
      // Bar 2 - Rising energy
      { melody: [[523,0,.3],[587,0.35,.3],[659,0.7,.4],[784,1.2,.5],[659,1.8,.3],[587,2.1,.3],[523,2.5,.5]], bass: [[262,0,0.8],[294,0.8,0.8],[330,1.6,0.8],[262,2.4,0.8]] },
      // Bar 3 - Playful bounce
      { melody: [[440,0,.2],[523,0.25,.2],[440,0.5,.2],[523,0.75,.2],[587,1.0,.4],[523,1.5,.3],[440,1.9,.3],[392,2.3,.4],[440,2.8,.3]], bass: [[220,0,0.8],[262,0.8,0.8],[294,1.6,0.8],[220,2.4,0.8]] },
      // Bar 4 - Resolution
      { melody: [[659,0,.4],[587,0.5,.3],[523,0.9,.4],[440,1.4,.3],[392,1.8,.3],[349,2.1,.3],[392,2.5,.5]], bass: [[330,0,0.8],[294,0.8,0.8],[262,1.6,0.8],[196,2.4,0.8]] },
      // Bar 5 - Funky groove
      { melody: [[523,0,.2],[0,0.2,.1],[523,0.3,.2],[587,0.6,.3],[659,1.0,.4],[587,1.5,.2],[523,1.8,.2],[587,2.1,.4],[523,2.6,.4]], bass: [[262,0,0.8],[247,0.8,0.8],[220,1.6,0.8],[196,2.4,0.8]] },
      // Bar 6 - Climax
      { melody: [[784,0,.4],[740,0.5,.3],[659,0.9,.3],[587,1.3,.3],[523,1.7,.4],[587,2.2,.3],[659,2.6,.4]], bass: [[196,0,0.8],[220,0.8,0.8],[247,1.6,0.8],[262,2.4,0.8]] },
      // Bar 7 - Cool down
      { melody: [[440,0,.3],[392,0.4,.3],[349,0.8,.4],[330,1.3,.3],[349,1.7,.3],[392,2.1,.4],[440,2.6,.4]], bass: [[175,0,0.8],[196,0.8,0.8],[220,1.6,0.8],[196,2.4,0.8]] },
      // Bar 8 - Loop back
      { melody: [[349,0,.3],[392,0.4,.3],[440,0.8,.4],[523,1.3,.5],[440,1.9,.3],[392,2.3,.3],[349,2.7,.4]], bass: [[175,0,0.8],[196,0.8,0.8],[220,1.6,0.8],[247,2.4,0.8]] },
    ];

    const bar = bars[this.barIndex % bars.length];
    this.barIndex++;
    const now = this.ctx.currentTime;

    // Melody
    bar.melody.forEach(([freq, offset, dur]) => {
      if (freq === 0) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.1, now + offset);
      gain.gain.setValueAtTime(0.1, now + offset + dur * 0.7);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + dur);
      osc.connect(gain);
      gain.connect(this.bgmGain);
      osc.start(now + offset);
      osc.stop(now + offset + dur + 0.05);
    });

    // Bass
    bar.bass.forEach(([freq, offset, dur]) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.07, now + offset);
      gain.gain.setValueAtTime(0.07, now + offset + dur * 0.6);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + dur);
      osc.connect(gain);
      gain.connect(this.bgmGain);
      osc.start(now + offset);
      osc.stop(now + offset + dur + 0.05);
    });

    // Light percussion (hi-hat style)
    for (let i = 0; i < 8; i++) {
      const noise = this.ctx.createOscillator();
      const nGain = this.ctx.createGain();
      noise.type = 'square';
      noise.frequency.value = 4000 + Math.random() * 2000;
      nGain.gain.setValueAtTime(0.015, now + i * 0.4);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.4 + 0.05);
      noise.connect(nGain);
      nGain.connect(this.bgmGain);
      noise.start(now + i * 0.4);
      noise.stop(now + i * 0.4 + 0.06);
    }
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
    [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
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
    [783.99, 659.25, 523.25, 392.00, 523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
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
