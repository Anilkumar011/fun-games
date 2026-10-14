import { Flock, CRUISE_SPEED } from './flock.mjs';

const canvas = document.querySelector('#field');
const wrap = document.querySelector('#canvas-wrap');
const context = canvas.getContext('2d');
const countInput = document.querySelector('#count');
const message = document.querySelector('#message');
const pauseButton = document.querySelector('#pause');
const palette = ['#315f4c', '#527958', '#78946d', '#3d7267', '#b78954'];
let flock;
let paused = matchMedia('(prefers-reduced-motion: reduce)').matches;
let previousTime = 0;
let accumulator = 0;
let lastStats = 0;

function syncControls() {
  countInput.max = flock.capacity;
  countInput.value = flock.birds.length;
  document.querySelector('#live-count').textContent = flock.birds.length;
  document.querySelector('#count-help').textContent = `1–${flock.capacity} kites · one kite-width of breathing room`;
  for (const button of document.querySelectorAll('[data-count]')) {
    button.setAttribute('aria-pressed', Number(button.dataset.count) === flock.birds.length);
    button.disabled = Number(button.dataset.count) > flock.capacity;
  }
  updateStats();
}

function updateStats() {
  document.querySelector('#group-count').textContent = flock.groups.length;
  document.querySelector('#groups-label').textContent = flock.groups.length === 1 ? 'group' : 'groups';
  document.querySelector('#speed').textContent = CRUISE_SPEED;
}

function resize() {
  const bounds = wrap.getBoundingClientRect();
  const pixelRatio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(bounds.width * pixelRatio);
  canvas.height = Math.round(bounds.height * pixelRatio);
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  if (!flock) flock = new Flock(bounds.width, bounds.height, 12);
  else if (flock.resize(bounds.width, bounds.height)) {
    message.textContent = `This smaller canvas has room for ${flock.capacity} kites. The count has been adjusted to keep them comfortably spaced.`;
  }
  syncControls();
  render();
}

function render() {
  context.clearRect(0, 0, flock.width, flock.height);
  for (let i = 0; i < flock.birds.length; i++) {
    const b = flock.birds[i];
    context.save();
    context.translate(b.x, b.y);
    context.rotate(b.angle);
    context.fillStyle = palette[i % palette.length];
    context.beginPath();
    context.moveTo(7, 0);
    context.lineTo(-.6, 4.8);
    context.lineTo(-5.6, 0);
    context.lineTo(-.6, -4.8);
    context.closePath();
    context.fill();
    // One quiet facet makes the silhouette read as a kite instead of a dot.
    context.fillStyle = '#ffffff26';
    context.beginPath();
    context.moveTo(7, 0); context.lineTo(-.6, -4.8); context.lineTo(-5.6, 0);
    context.closePath(); context.fill();
    context.restore();
  }
}

function setPaused(value) {
  paused = value;
  accumulator = 0;
  pauseButton.setAttribute('aria-pressed', paused);
  document.querySelector('#pause-label').textContent = paused ? 'Resume' : 'Pause';
  document.querySelector('#pause-icon').textContent = paused ? '▷' : 'Ⅱ';
  document.querySelector('#state-label').textContent = paused ? 'AT REST' : 'IN FLIGHT';
  document.querySelector('.live-dot').style.background = paused ? '#b78954' : '#6b9467';
  document.querySelector('#paused-overlay').hidden = !paused;
}

function reset(count) {
  flock.reset(count);
  accumulator = 0;
  syncControls(); render();
  message.textContent = `A fresh arrangement of ${flock.birds.length} ${flock.birds.length === 1 ? 'kite' : 'kites'}.`;
}

document.querySelector('#count-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!countInput.reportValidity()) return;
  reset(Number(countInput.value));
});
for (const button of document.querySelectorAll('[data-count]')) {
  button.addEventListener('click', () => reset(Number(button.dataset.count)));
}
document.querySelector('#reset').addEventListener('click', () => reset(flock.birds.length));
pauseButton.addEventListener('click', () => setPaused(!paused));
document.addEventListener('visibilitychange', () => { previousTime = 0; accumulator = 0; });

function frame(now) {
  const elapsed = previousTime ? Math.min((now - previousTime) / 1000, .05) : 0;
  previousTime = now;
  if (!paused && !document.hidden) {
    accumulator += elapsed;
    while (accumulator >= 1 / 120) { flock.step(1 / 120); accumulator -= 1 / 120; }
    render();
    if (now - lastStats > 300) { updateStats(); lastStats = now; }
  }
  requestAnimationFrame(frame);
}

resize();
new ResizeObserver(resize).observe(wrap);
setPaused(paused);
requestAnimationFrame(frame);
