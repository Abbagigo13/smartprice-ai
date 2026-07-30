// Ambient background animation: a few soft, blurred light blobs in the
// site's brass/emerald/ink palette, slowly drifting and breathing —
// inspired by prism light-refraction backgrounds, but themed to match
// the ledger/appraisal-desk aesthetic instead of a generic rainbow.

const canvas = document.getElementById("bgCanvas");
if (canvas) {
  const ctx = canvas.getContext("2d");
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  const colors = [
    "rgba(201, 162, 39, 0.16)",   // brass
    "rgba(116, 168, 136, 0.14)",  // fair/emerald
    "rgba(90, 143, 166, 0.12)",   // under/blue
  ];

  let width, height, dpr;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  resize();
  window.addEventListener("resize", resize);

  const blobs = colors.map((color, i) => ({
    color,
    baseX: 0.2 + i * 0.3,
    baseY: 0.15 + (i % 2) * 0.5,
    radius: 0.35 + i * 0.05,
    speed: 0.00006 + i * 0.00002,
    phase: i * 2.1,
  }));

  function draw(time) {
    ctx.clearRect(0, 0, width, height);

    blobs.forEach((blob) => {
      const t = time * blob.speed + blob.phase;
      const x = (blob.baseX + Math.sin(t) * 0.08) * width;
      const y = (blob.baseY + Math.cos(t * 0.8) * 0.08) * height;
      const r = blob.radius * Math.max(width, height);

      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, blob.color);
      gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    });

    if (!prefersReducedMotion) {
      requestAnimationFrame(draw);
    }
  }

  if (prefersReducedMotion) {
    draw(0);
  } else {
    requestAnimationFrame(draw);
  }
}