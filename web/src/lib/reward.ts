import confetti from 'canvas-confetti';

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Chuva de pepitas: usada quando uma resposta é aceita ou o nível sobe. */
export function celebrate(kind: 'achado' | 'nivel' = 'achado') {
  if (reduced()) return;
  const colors = ['#F2B705', '#FBE7A1', '#D99E00', '#0F4C4C', '#F5F8F3'];
  if (kind === 'nivel') {
    confetti({ particleCount: 160, spread: 100, startVelocity: 45, origin: { y: 0.6 }, colors, scalar: 1.1 });
    setTimeout(() => confetti({ particleCount: 80, angle: 60, spread: 70, origin: { x: 0, y: 0.7 }, colors }), 250);
    setTimeout(() => confetti({ particleCount: 80, angle: 120, spread: 70, origin: { x: 1, y: 0.7 }, colors }), 400);
    return;
  }
  confetti({ particleCount: 90, spread: 70, startVelocity: 38, origin: { y: 0.7 }, colors, shapes: ['circle', 'square'], scalar: 0.9 });
}

export function sparkle(x: number, y: number) {
  if (reduced()) return;
  confetti({ particleCount: 18, spread: 50, startVelocity: 18, gravity: 0.8, ticks: 60, origin: { x: x / window.innerWidth, y: y / window.innerHeight }, colors: ['#F2B705', '#FBE7A1'], scalar: 0.7 });
}
