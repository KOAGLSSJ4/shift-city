// Heading-up circular minimap with roads, route, destinations and traffic.
import { DESTINATIONS, GRID, ISLAND_R, ROAD_W, ROUNDABOUTS, roadCoord } from '../data/world';
import type { Pt } from '../world/RoadNetwork';

export class Minimap {
  private g: CanvasRenderingContext2D;
  constructor(private canvas: HTMLCanvasElement, private round = true) { this.g = canvas.getContext('2d')!; }

  draw(pos: Pt, heading: number, route: Pt[] | null, target: Pt | null, traffic: Pt[], targetColor: string, surge: (Pt & { r: number }) | null = null) {
    const c = this.canvas, g = this.g, W = c.width, H = c.height, S = 0.55; // px per metre
    g.clearRect(0, 0, W, H);
    g.save();
    if (this.round) { g.beginPath(); g.arc(W / 2, H / 2, W / 2, 0, Math.PI * 2); g.clip(); }
    g.fillStyle = '#16242f'; g.fillRect(0, 0, W, H);
    g.translate(W / 2, H * 0.6);
    // heading-up: forward (+heading) points to the top of the map; world +X is left of +Z
    g.rotate(heading + Math.PI);
    g.scale(S, S);
    g.translate(-pos.x, -pos.z);
    g.fillStyle = '#273a49';
    const lo = roadCoord(0) - 7, hi = roadCoord(GRID) + 7;
    // blocks
    g.fillStyle = '#1e3140';
    for (let i = 0; i < GRID; i++) for (let j = 0; j < GRID; j++) g.fillRect(roadCoord(i) + 7, roadCoord(j) + 7, 50, 50);
    g.strokeStyle = '#5f7486'; g.lineWidth = ROAD_W;
    g.beginPath();
    for (let k = 0; k <= GRID; k++) { const r = roadCoord(k); g.moveTo(lo, r); g.lineTo(hi, r); g.moveTo(r, lo); g.lineTo(r, hi); }
    g.stroke();
    // roundabout islands
    g.fillStyle = '#2f5a3a';
    for (const [i, j] of ROUNDABOUTS) { g.beginPath(); g.arc(roadCoord(i), roadCoord(j), ISLAND_R + 1.5, 0, 7); g.fill(); }
    // surge zone: a glowing orange patch, like the real app's heat map
    if (surge) {
      const grad = g.createRadialGradient(surge.x, surge.z, 0, surge.x, surge.z, surge.r);
      grad.addColorStop(0, '#ff8a3d88'); grad.addColorStop(1, '#ff8a3d00');
      g.fillStyle = grad; g.beginPath(); g.arc(surge.x, surge.z, surge.r, 0, 7); g.fill();
    }
    // route
    if (route && route.length > 1) {
      g.strokeStyle = '#4cc3ff'; g.lineWidth = 7; g.lineJoin = 'round'; g.lineCap = 'round';
      g.beginPath(); g.moveTo(route[0].x, route[0].z);
      for (const p of route) g.lineTo(p.x, p.z);
      g.stroke();
    }
    for (const d of DESTINATIONS) { g.fillStyle = '#ffffff55'; g.beginPath(); g.arc(d.x, d.z, 5, 0, 7); g.fill(); }
    g.fillStyle = '#c0c8d0';
    for (const t of traffic) g.fillRect(t.x - 2, t.z - 2, 4, 4);
    if (target) { g.fillStyle = targetColor; g.beginPath(); g.arc(target.x, target.z, 11, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 3; g.stroke(); }
    g.restore();
    // player arrow (always pointing up)
    g.save(); g.translate(W / 2, H * 0.6);
    g.fillStyle = '#4cf0af'; g.strokeStyle = '#04140d'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, -11); g.lineTo(8, 9); g.lineTo(0, 4); g.lineTo(-8, 9); g.closePath(); g.fill(); g.stroke();
    g.restore();
    // clamp target to the rim when off-map
    if (target) {
      const dx = target.x - pos.x, dz = target.z - pos.z;
      const fx = Math.sin(heading), fz = Math.cos(heading);
      const ahead = dx * fx + dz * fz, left = dx * fz - dz * fx; // +X is left of +Z
      const sx = -left * S, sy = -ahead * S;
      const r = Math.hypot(sx, sy), R = Math.min(W, H) / 2 - 10;
      if (r > R - 20) {
        g.fillStyle = targetColor;
        g.beginPath(); g.arc(W / 2 + (sx / r) * R, H * 0.6 + (sy / r) * R, 7, 0, 7); g.fill();
      }
    }
  }
}
