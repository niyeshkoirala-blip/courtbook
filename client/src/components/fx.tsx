import { useEffect, useRef } from 'react';

/**
 * Visual FX shared across the app: the 3D animated background rendered
 * behind every page, and the scroll-reveal hook pages use for entrance
 * animations. Plain canvas 2D with manual perspective projection — no 3D
 * library needed for a background this size.
 */

/** Adds `.is-in` to every `.cb-reveal` inside as it scrolls into view. */
export function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const targets = root.querySelectorAll('.cb-reveal');
    // No IntersectionObserver → just show everything.
    if (!('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries, obs) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            obs.unobserve(e.target); // reveal once, then stop watching
          }
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px' },
    );
    targets.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return ref;
}

/**
 * Cursor spotlight: writes --mx/--my (pointer position, in %) onto whichever
 * `.cb-spot` element the pointer is over, so its CSS radial highlight tracks
 * the cursor. One delegated pointermove on the root — cheap regardless of how
 * many cards are on the page. Pair with the ref on the same subtree.
 */
export function useSpotlight<T extends HTMLElement = HTMLDivElement>(
  ref: React.RefObject<T | null>,
) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    function onMove(e: PointerEvent) {
      const card = (e.target as HTMLElement | null)?.closest<HTMLElement>('.cb-spot');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
      card.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
    }
    root.addEventListener('pointermove', onMove);
    return () => root.removeEventListener('pointermove', onMove);
  }, [ref]);
}

/* ------------------------------------------------------------------ Bg3d */

const FOCAL = 400; // perspective focal length (px)
const DEPTH = 1400; // how deep the particle field extends
const FLOOR_Y = 260; // world-units below the camera where the court floor sits

interface Particle {
  x: number;
  y: number;
  z: number;
  r: number;
  hue: 'turf' | 'mint' | 'white';
}

const PARTICLE_RGB = { turf: '190,242,100', mint: '255,106,61', white: '242,244,234' };

function makeParticle(z?: number): Particle {
  const hues: Particle['hue'][] = ['turf', 'turf', 'mint', 'white'];
  return {
    x: (Math.random() - 0.5) * 2400,
    y: (Math.random() - 0.65) * 1100, // biased upward, floor owns the bottom
    z: z ?? Math.random() * DEPTH + 60,
    r: Math.random() * 2 + 0.8,
    hue: hues[Math.floor(Math.random() * hues.length)] ?? 'turf',
  };
}

/**
 * Fixed full-screen 3D scene behind all content: a floodlit court floor
 * receding to the horizon, particles drifting toward the camera, and a
 * slow mouse parallax. Renders one static frame under reduced motion and
 * pauses entirely while the tab is hidden.
 */
export function Bg3d() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0;
    let h = 0;
    let raf = 0;
    let scroll = 0; // floor scroll offset (world units)
    let camX = 0;
    let camY = 0;
    let targetX = 0;
    let targetY = 0;
    let last = performance.now();
    const particles: Particle[] = Array.from({ length: 130 }, () => makeParticle());

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function onPointer(e: PointerEvent) {
      targetX = (e.clientX / w - 0.5) * 60;
      targetY = (e.clientY / h - 0.5) * 30;
    }

    function drawFloor() {
      const cx = w / 2 - camX;
      // Vanishing line, capped so the pitch stays big on tall/wide monitors.
      // A pure fraction (0.54h) looks lush at 800px tall but shrinks to a thin
      // distant band on a 1080p+ screen; clamping the horizon no lower than
      // ~430px keeps the turf filling the lower half everywhere.
      const horizon = Math.min(h * 0.46, 430) - camY;
      const GRID = 130; // world spacing between lines

      // Floodlight pooling on the pitch around the vanishing point.
      const glow = ctx!.createRadialGradient(cx, horizon, 0, cx, horizon, w * 0.45);
      glow.addColorStop(0, 'rgba(190,242,100,0.08)');
      glow.addColorStop(1, 'rgba(190,242,100,0)');
      ctx!.fillStyle = glow;
      ctx!.fillRect(0, 0, w, h);

      // Mow stripes: perspective turf bands receding to the horizon. Two dark
      // cool-tinted shades alternate and scroll toward the camera — the
      // signature floodlit-pitch "3D turf" read, kept dark so it never fights
      // the content. `off`/`phase` slide the stripes so they appear to move.
      const off = scroll % GRID;
      const phase = Math.floor(scroll / GRID);
      const N = 30; // bands drawn from the near edge back to the horizon
      const yAt = (z: number) => horizon + (FOCAL * FLOOR_Y) / z;
      for (let k = 0; k < N; k++) {
        const zNear = k * GRID - off + 40;
        const zFar = (k + 1) * GRID - off + 40;
        if (zFar < 40) continue;
        const bottom = Math.min(yAt(zNear), h + 60);
        const top = Math.max(yAt(zFar), horizon);
        if (bottom <= top) continue;
        const depth = Math.max(0, 1 - zNear / (N * GRID)); // 1 near → 0 far
        const a = 0.8 + 0.2 * depth; // floodlit near, fading into the dark distance
        // Floodlit pitch-green mow bands — a night field seen in perspective.
        ctx!.fillStyle = (k + phase) % 2 === 0 ? `rgba(46,112,78,${a})` : `rgba(22,58,42,${a})`;
        ctx!.fillRect(0, top, w, bottom - top);
        // mow seam between bands — sells the striped-turf read.
        ctx!.strokeStyle = `rgba(190,235,205,${0.28 * depth})`;
        ctx!.lineWidth = 1;
        ctx!.beginPath();
        ctx!.moveTo(0, top);
        ctx!.lineTo(w, top);
        ctx!.stroke();
      }

      // Floodlight pooling on the near turf — brightens the field's center.
      const lite = ctx!.createRadialGradient(
        cx,
        horizon + h * 0.15,
        0,
        cx,
        horizon + h * 0.15,
        w * 0.55,
      );
      lite.addColorStop(0, 'rgba(150,225,175,0.14)');
      lite.addColorStop(1, 'rgba(150,225,175,0)');
      ctx!.fillStyle = lite;
      ctx!.fillRect(0, horizon - 10, w, h);

      // Painted white pitch lines: sidelines converging on the vanishing point.
      ctx!.lineWidth = 2;
      for (const s of [-1, 1]) {
        ctx!.strokeStyle = 'rgba(210,240,222,0.22)';
        ctx!.beginPath();
        ctx!.moveTo(cx, horizon);
        ctx!.lineTo(cx + s * w * 0.7, h + 40);
        ctx!.stroke();
      }

      // Halfway line + center circle — the court marks, flat on the turf.
      const midY = horizon + h * 0.2;
      ctx!.strokeStyle = 'rgba(210,240,222,0.2)';
      ctx!.beginPath();
      ctx!.moveTo(cx - w * 0.42, midY);
      ctx!.lineTo(cx + w * 0.42, midY);
      ctx!.stroke();
      ctx!.beginPath();
      ctx!.ellipse(cx, midY, w * 0.16, h * 0.05, 0, 0, Math.PI * 2);
      ctx!.stroke();
    }

    function drawParticles(dt: number) {
      for (const p of particles) {
        p.z -= dt * 26; // drift toward the camera
        p.y -= dt * 6; // and gently upward, like dust in floodlights
        if (p.z < 40) Object.assign(p, makeParticle(DEPTH));
        const s = FOCAL / p.z;
        const x = w / 2 + (p.x - camX * (1.6 - p.z / DEPTH)) * s;
        const y = h / 2 + (p.y - camY * (1.6 - p.z / DEPTH)) * s;
        if (x < -20 || x > w + 20 || y < -20 || y > h + 20) continue;
        const a = Math.min(0.7, (1 - p.z / DEPTH) * 0.8);
        ctx!.fillStyle = `rgba(${PARTICLE_RGB[p.hue]},${a})`;
        ctx!.beginPath();
        ctx!.arc(x, y, Math.min(p.r * s * 1.4, 4.5), 0, Math.PI * 2);
        ctx!.fill();
      }
    }

    function frame(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      camX += (targetX - camX) * 0.03;
      camY += (targetY - camY) * 0.03;
      scroll = (scroll + dt * 30) % (24 * 130);
      ctx!.clearRect(0, 0, w, h);
      drawFloor();
      drawParticles(dt);
      raf = requestAnimationFrame(frame);
    }

    function onVisibility() {
      if (document.hidden) {
        cancelAnimationFrame(raf);
      } else {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    }

    resize();
    window.addEventListener('resize', resize);
    if (reduced) {
      // Static composition: one frame, no loop, no listeners.
      drawFloor();
      drawParticles(0);
      return () => window.removeEventListener('resize', resize);
    }
    window.addEventListener('pointermove', onPointer);
    document.addEventListener('visibilitychange', onVisibility);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* aurora glow blobs, behind the canvas */}
      <div className="cb-aurora absolute -top-32 left-[8%] size-[480px] rounded-full bg-turf/20" />
      <div
        className="cb-aurora absolute -right-24 top-[38%] size-[420px] rounded-full bg-accent/12"
        style={{ animationDelay: '-9s' }}
      />
      <div
        className="cb-aurora absolute bottom-[-10%] left-[30%] size-[520px] rounded-full bg-mint/12"
        style={{ animationDelay: '-17s' }}
      />
      <canvas ref={canvasRef} className="absolute inset-0" />
      {/* vignette keeps edges dark so content stays readable */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 120% 95% at 50% 22%, transparent 58%, rgba(10,11,10,0.5) 100%)',
        }}
      />
      <div className="cb-noise absolute inset-0" />
    </div>
  );
}
