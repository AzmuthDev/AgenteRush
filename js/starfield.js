/**
 * RUSH_VERSO // STARFIELD & CYGNUS X-1 COSMIC CANVAS
 * Real-time dynamic starfield with depth, twinkling, and occasional comets.
 */

class Starfield {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d');
    this.stars = [];
    this.comets = [];
    this.numStars = 220;
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.animationId = null;

    this.init();
  }

  init() {
    this.resize();
    window.addEventListener('resize', () => this.resize());

    // Generate stars
    this.stars = [];
    for (let i = 0; i < this.numStars; i++) {
      this.stars.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        radius: Math.random() * 1.5 + 0.3,
        alpha: Math.random() * 0.8 + 0.2,
        twinkleSpeed: (Math.random() * 0.02 + 0.005) * (Math.random() > 0.5 ? 1 : -1),
        // Rush signature colors: white, soft gold, faint crimson red
        color: this.getStarColor()
      });
    }

    this.animate();
    this.scheduleComet();
  }

  getStarColor() {
    const r = Math.random();
    if (r < 0.7) return '255, 255, 255';       // Diamond white
    if (r < 0.85) return '255, 183, 3';       // Synth gold
    if (r < 0.95) return '0, 240, 255';       // Signals cyan
    return '255, 23, 68';                     // Red star of Syrinx
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  scheduleComet() {
    const nextCometTime = Math.random() * 6000 + 4000; // Every 4 to 10 seconds
    setTimeout(() => {
      this.spawnComet();
      this.scheduleComet();
    }, nextCometTime);
  }

  spawnComet() {
    const startX = Math.random() * this.width * 0.8;
    const startY = Math.random() * (this.height * 0.4);
    const length = Math.random() * 120 + 80;
    const speed = Math.random() * 8 + 6;

    this.comets.push({
      x: startX,
      y: startY,
      length: length,
      speed: speed,
      dx: speed,
      dy: speed * 0.45,
      alpha: 1,
      color: Math.random() > 0.4 ? '255, 23, 68' : '255, 183, 3'
    });
  }

  animate() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Draw and update stars
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      s.alpha += s.twinkleSpeed;
      if (s.alpha > 1 || s.alpha < 0.15) {
        s.twinkleSpeed = -s.twinkleSpeed;
      }

      this.ctx.beginPath();
      this.ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(${s.color}, ${Math.max(0.1, Math.min(1, s.alpha))})`;
      this.ctx.fill();

      // Subtle glow for larger stars
      if (s.radius > 1.2) {
        this.ctx.beginPath();
        this.ctx.arc(s.x, s.y, s.radius * 2.2, 0, Math.PI * 2);
        this.ctx.fillStyle = `rgba(${s.color}, ${s.alpha * 0.15})`;
        this.ctx.fill();
      }
    }

    // Draw and update comets (Cygnus X-1 trajectory)
    for (let i = this.comets.length - 1; i >= 0; i--) {
      const c = this.comets[i];
      c.x += c.dx;
      c.y += c.dy;
      c.alpha -= 0.015;

      if (c.alpha <= 0 || c.x > this.width || c.y > this.height) {
        this.comets.splice(i, 1);
        continue;
      }

      const grad = this.ctx.createLinearGradient(c.x, c.y, c.x - c.length, c.y - (c.length * 0.45));
      grad.addColorStop(0, `rgba(${c.color}, ${c.alpha})`);
      grad.addColorStop(1, `rgba(${c.color}, 0)`);

      this.ctx.beginPath();
      this.ctx.moveTo(c.x, c.y);
      this.ctx.lineTo(c.x - c.length, c.y - (c.length * 0.45));
      this.ctx.strokeStyle = grad;
      this.ctx.lineWidth = 2;
      this.ctx.stroke();

      // Head spark
      this.ctx.beginPath();
      this.ctx.arc(c.x, c.y, 2, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(255, 255, 255, ${c.alpha})`;
      this.ctx.fill();
    }

    this.animationId = requestAnimationFrame(() => this.animate());
  }

  destroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
  }
}

// Attach globally
window.Starfield = Starfield;
