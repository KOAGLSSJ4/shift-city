// Original Shift City car designs (fictional; not based on any real model). Each body type is a
// set of curves plus a details pass that draws its lights, grille, intakes and aero.
import type { BodyType } from '../data/vehicles';
import type { CarDesign, Kit, Pts, RimStyle } from './CarBody';

const TAU = Math.PI * 2;
const spokes = (n: number, width: number, offset = 0, hub?: number): RimStyle =>
  ({ spokes: Array.from({ length: n }, (_, i) => offset + (i * TAU) / n), width, hub });
const pairs = (n: number, gap: number, width: number): RimStyle =>
  ({ spokes: Array.from({ length: n }, (_, i) => (i * TAU) / n).flatMap((a) => [a - gap, a + gap]), width });

/** Rear number plate + reversing lens, shared by most designs. */
function plate(k: Kit, y: number) {
  k.rrect('rear', -0.26, y, 0.26, y + 0.12, 0.015, 'plate');
}

/** Body types drawn with the lofted builder (all of them, the Classic included). */
export type DesignBody = BodyType;

export const DESIGNS: Record<DesignBody, CarDesign> = {
  // Shift Classic: the starter. A compact, friendly hatch with a retro face (round lamps, chrome bar)
  classic: {
    L: 3.9, W: 1.74, H: 1.48, wb: 2.48, wr: 0.315, rim: 0.66, tireW: 0.2,
    rimStyle: spokes(8, 0.04, 0, 0.28), rimColor: 0xc9cdd2, accent: 0x2a2a2a,
    top: [[-1.95, 0.9], [-1.9, 1.0], [-1.78, 1.03], [-1.0, 1.01], [0.3, 0.97], [0.95, 0.94], [1.35, 0.9], [1.7, 0.85], [1.87, 0.78], [1.95, 0.68]],
    bottom: [[-1.95, 0.42], [-1.8, 0.26], [-1.45, 0.19], [1.4, 0.19], [1.8, 0.27], [1.95, 0.42]],
    hw: [[-1.95, 0.78], [-1.8, 0.85], [-1.2, 0.87], [1.0, 0.87], [1.6, 0.86], [1.85, 0.81], [1.95, 0.72]],
    waist: 0.62, nTop: 5, nBot: 9, tumble: 0.1, fender: 0.03,
    roof: [[-1.82, 1.02], [-1.74, 1.2], [-1.58, 1.4], [-1.35, 1.47], [-0.3, 1.48], [0.15, 1.46], [0.5, 1.26], [0.95, 0.95]],
    gw: 0.99, gTumble: 0.22, gn: 5, roofF: 0.15, roofR: -1.3, roofStyle: 'paint', bPillar: -0.3, cPillar: -1.3, chromeTrim: true,
    details(k) {
      // round lamps in chrome rings, a chrome grille bar and a black lower intake
      k.ellipse('front', 0.6, 0.74, 0.11, 0.1, 'chrome', { mirror: true });
      k.ellipse('front', 0.6, 0.74, 0.09, 0.08, 'lens', { mirror: true, lift: 0.006 });
      k.ellipse('front', 0.6, 0.74, 0.055, 0.05, 'head', { mirror: true, lift: 0.012 });
      k.rrect('front', -0.4, 0.68, 0.4, 0.78, 0.04, 'decal');
      k.ribbon('front', [[-0.4, 0.73], [0.4, 0.73]], 0.02, 'chrome', { lift: 0.01 });
      k.rrect('front', -0.5, 0.3, 0.5, 0.46, 0.05, 'decal');
      k.rrect('rear', 0.5, 0.82, 0.76, 0.97, 0.04, 'tail', { mirror: true });
      plate(k, 0.5);
      k.rrect('rear', -0.6, 0.3, 0.6, 0.4, 0.04, 'decal');
      k.ribbon('side', [[-1.25, 0.45], [1.2, 0.45]], 0.035, 'chrome');
      k.rrect('side', 0.05, 0.9, 0.2, 0.93, 0.01, 'chrome');
    },
  },
  // Kite Pico: modern five-door city hatch: short bonnet, upright cabin, swept LED eyes
  hatch: {
    L: 4.0, W: 1.76, H: 1.47, wb: 2.55, wr: 0.315, rim: 0.68, tireW: 0.2,
    rimStyle: spokes(5, 0.06, 0, 0.26), rimColor: 0xd9dde2, accent: 0x2a2a2a,
    top: [[-2.0, 0.88], [-1.95, 0.99], [-1.82, 1.04], [-1.0, 1.01], [0.3, 0.96], [1.0, 0.92], [1.4, 0.86], [1.75, 0.8], [1.92, 0.73], [2.0, 0.63]],
    bottom: [[-2.0, 0.42], [-1.85, 0.26], [-1.5, 0.19], [1.45, 0.19], [1.85, 0.27], [2.0, 0.4]],
    hw: [[-2.0, 0.78], [-1.85, 0.855], [-1.2, 0.88], [1.0, 0.88], [1.65, 0.86], [1.9, 0.8], [2.0, 0.7]],
    waist: 0.62, nTop: 5, nBot: 9, tumble: 0.1, fender: 0.025, cladY: 0.3,
    roof: [[-1.86, 1.03], [-1.72, 1.2], [-1.5, 1.36], [-1.2, 1.42], [-0.3, 1.46], [0.15, 1.44], [0.55, 1.22], [1.0, 0.93]],
    gw: 0.99, gTumble: 0.24, gn: 4.5, roofF: 0.2, roofR: -1.35, roofStyle: 'paint', bPillar: -0.35, cPillar: -1.3,
    details(k) {
      // swept headlights with an LED brow, slim grille and a wide lower intake
      k.poly('front', [[0.36, 0.72], [0.8, 0.7], [0.76, 0.78], [0.4, 0.8]], 'lens', { mirror: true });
      k.ribbon('front', [[0.4, 0.775], [0.74, 0.76]], 0.018, 'head', { mirror: true, lift: 0.01 });
      k.rrect('front', -0.34, 0.66, 0.34, 0.74, 0.03, 'decal');
      k.rrect('front', -0.52, 0.3, 0.52, 0.48, 0.05, 'decal');
      k.ribbon('front', [[-0.34, 0.7], [0.34, 0.7]], 0.012, 'chrome', { lift: 0.01 });
      k.poly('rear', [[0.48, 0.86], [0.8, 0.84], [0.8, 0.95], [0.52, 0.97]], 'tail', { mirror: true });
      k.ribbon('rear', [[-0.48, 0.9], [0.48, 0.9]], 0.02, 'decal');
      plate(k, 0.5);
      k.rrect('rear', -0.62, 0.3, 0.62, 0.4, 0.04, 'decal');
      k.ribbon('side', [[-1.3, 0.44], [1.25, 0.44]], 0.04, 'trim');
      k.rrect('side', 0.1, 0.9, 0.25, 0.93, 0.01, 'chrome');
      k.rrect('side', -0.95, 0.91, -0.8, 0.94, 0.01, 'chrome');
    },
  },
  // Lumen: calm, modern family saloon with slim LED eyes and a full-width light bar
  sedan: {
    L: 4.75, W: 1.83, H: 1.45, wb: 2.8, wr: 0.33, rim: 0.68,
    rimStyle: spokes(10, 0.035), rimColor: 0xc8ccd2, accent: 0x303030,
    top: [[-2.375, 0.84], [-2.33, 0.98], [-2.15, 1.05], [-1.55, 1.06], [-1.0, 1.03], [0.3, 0.98], [1.15, 0.95], [1.65, 0.9], [2.05, 0.83], [2.27, 0.74], [2.375, 0.63]],
    bottom: [[-2.375, 0.42], [-2.2, 0.26], [-1.8, 0.18], [1.8, 0.18], [2.2, 0.26], [2.375, 0.4]],
    hw: [[-2.375, 0.8], [-2.15, 0.89], [-1.4, 0.915], [1.0, 0.915], [1.9, 0.9], [2.2, 0.84], [2.375, 0.74]],
    waist: 0.62, nTop: 5, nBot: 9, tumble: 0.1, fender: 0.025,
    roof: [[-1.52, 1.04], [-1.28, 1.2], [-0.98, 1.37], [-0.62, 1.44], [0.2, 1.45], [0.55, 1.38], [0.95, 1.16], [1.18, 0.97]],
    gw: 0.99, gTumble: 0.24, gn: 4.5, roofF: 0.3, roofR: -0.65, roofStyle: 'paint', bPillar: -0.12, cPillar: -0.85,
    details(k) {
      k.poly('front', [[0.4, 0.64], [0.82, 0.63], [0.77, 0.71], [0.44, 0.705]], 'lens', { mirror: true });
      k.ribbon('front', [[0.44, 0.685], [0.78, 0.675]], 0.022, 'head', { mirror: true, lift: 0.01 });
      k.rrect('front', -0.36, 0.5, 0.36, 0.62, 0.04, 'decal');
      k.ribbon('front', [[-0.36, 0.585], [0.36, 0.585]], 0.012, 'chrome', { lift: 0.01 });
      k.rrect('front', -0.58, 0.3, 0.58, 0.42, 0.05, 'decal');
      k.poly('rear', [[0.38, 0.88], [0.86, 0.86], [0.82, 0.95], [0.4, 0.96]], 'tail', { mirror: true });
      k.ribbon('rear', [[-0.38, 0.92], [0.38, 0.92]], 0.02, 'tail');
      plate(k, 0.58);
      k.rrect('rear', -0.6, 0.3, 0.6, 0.4, 0.04, 'decal');
      k.ribbon('side', [[-1.6, 0.9], [1.4, 0.88]], 0.015, 'chrome', { lift: 0.004 });
      k.rrect('side', 0.1, 0.89, 0.25, 0.92, 0.01, 'chrome');
      k.rrect('side', -0.95, 0.9, -0.8, 0.93, 0.01, 'chrome');
    },
  },
  // Halden Summit: upright executive SUV, big grille, roof rails, wraparound tails
  suv: {
    L: 4.95, W: 1.98, H: 1.8, wb: 2.95, wr: 0.39, rim: 0.66, tireW: 0.26,
    rimStyle: pairs(5, 0.12, 0.05), rimColor: 0x55595f, accent: 0x9a9a9a,
    top: [[-2.475, 1.0], [-2.43, 1.13], [-2.2, 1.16], [-1, 1.15], [0.9, 1.12], [1.6, 1.08], [2.2, 1.0], [2.42, 0.86], [2.475, 0.75]],
    bottom: [[-2.475, 0.5], [-2.3, 0.3], [-1.9, 0.24], [1.9, 0.24], [2.35, 0.32], [2.475, 0.45]],
    hw: [[-2.475, 0.9], [-2.25, 0.97], [-1, 0.99], [1, 0.99], [2.1, 0.97], [2.475, 0.88]],
    waist: 0.55, nTop: 4.5, nBot: 8, tumble: 0.06, fender: 0.02, cladY: 0.42,
    roof: [[-2.4, 1.14], [-2.36, 1.5], [-2.2, 1.74], [-1.9, 1.79], [0.4, 1.8], [0.8, 1.66], [1.35, 1.18], [1.45, 1.1]],
    gw: 0.93, gTumble: 0.06, gn: 5, roofF: 0.45, roofR: -2.0, roofStyle: 'paint', bPillar: -0.05, cPillar: -1.15, dPillar: -2.05,
    details(k) {
      k.rrect('front', -0.42, 0.52, 0.42, 0.88, 0.06, 'decal');
      for (let y = 0.58; y < 0.86; y += 0.06) k.ribbon('front', [[-0.4, y], [0.4, y]], 0.012, 'chrome', { lift: 0.01 });
      k.poly('front', [[0.46, 0.84], [0.86, 0.86], [0.84, 0.94], [0.46, 0.92]], 'lens', { mirror: true });
      k.ribbon('front', [[0.48, 0.9], [0.83, 0.905]], 0.02, 'head', { mirror: true, lift: 0.01 });
      k.rrect('front', -0.6, 0.3, 0.6, 0.42, 0.03, 'chrome');
      k.poly('rear', [[0.45, 0.92], [0.94, 0.9], [0.9, 1.0], [0.5, 1.02]], 'tail', { mirror: true });
      plate(k, 0.7);
      k.rrect('rear', -0.6, 0.3, 0.6, 0.42, 0.03, 'chrome');
      k.cyl('chrome', 0.04, 0.12, 0.5, 0.36, -2.47, 'z', true);
      for (const m of [1, -1]) k.tube('trim', [[0.55 * m, 1.73, 0.2], [0.57 * m, 1.76, -0.05], [0.57 * m, 1.76, -1.5], [0.55 * m, 1.73, -1.72]], 0.02);
      k.rrect('side', 0.15, 1.02, 0.32, 1.05, 0.01, 'chrome');
      k.rrect('side', -1.05, 1.02, -0.88, 1.05, 0.01, 'chrome');
    },
  },
  // Aeris Silk: electric four-door GT; light bars front and back, glass roof, aero wheels
  gt: {
    L: 4.95, W: 1.95, H: 1.38, wb: 2.95, wr: 0.36, rim: 0.7, tireW: 0.25,
    rimStyle: { spokes: spokes(5, 0.09).spokes, width: 0.09, hub: 0.32 }, rimColor: 0x8d9299, accent: 0xd8d8d8,
    top: [[-2.475, 0.8], [-2.42, 0.9], [-2.2, 0.93], [-1.5, 0.9], [0, 0.84], [1.0, 0.79], [1.8, 0.71], [2.3, 0.6], [2.475, 0.48]],
    bottom: [[-2.475, 0.36], [-2.25, 0.2], [-1.8, 0.13], [1.8, 0.13], [2.3, 0.2], [2.475, 0.3]],
    hw: [[-2.475, 0.8], [-2.2, 0.93], [-1.4, 0.975], [0, 0.95], [1.4, 0.97], [2.2, 0.9], [2.475, 0.75]],
    waist: 0.45, nTop: 3.4, nBot: 7, tumble: 0.12, fender: 0.03,
    roof: [[-2.2, 0.93], [-1.8, 1.06], [-1.0, 1.3], [-0.4, 1.38], [0.15, 1.38], [0.55, 1.28], [1.15, 0.86], [1.25, 0.77]],
    gw: 0.92, gTumble: 0.24, roofF: 0.2, roofR: -0.6, roofStyle: 'glass', bPillar: -0.25, cPillar: -1.05,
    details(k) {
      k.poly('front', [[0.48, 0.49], [0.86, 0.49], [0.8, 0.555], [0.52, 0.56]], 'lens', { mirror: true });
      k.ribbon('front', [[0.0, 0.535], [0.8, 0.525]], 0.014, 'head', { mirror: true, lift: 0.01 });
      k.rrect('front', -0.45, 0.24, 0.45, 0.33, 0.04, 'decal');
      k.ribbon('rear', [[-0.8, 0.76], [0.8, 0.76]], 0.035, 'tail');
      k.ribbon('rear', [[-0.8, 0.73], [0.8, 0.73]], 0.01, 'decal');
      plate(k, 0.5);
      k.poly('rear', [[-0.7, 0.24], [0.7, 0.24], [0.6, 0.36], [-0.6, 0.36]], 'decal');
      k.ribbon('side', [[-1.55, 0.3], [1.55, 0.3]], 0.06, 'decal');
      k.rrect('side', 0.1, 0.8, 0.26, 0.815, 0.006, 'trim');
      k.rrect('side', -1.0, 0.8, -0.84, 0.815, 0.006, 'trim');
    },
  },
  // Furia V12: sharp wedge supercar, Y-shaped lights, louvred engine cover
  super: {
    L: 4.6, W: 2.0, H: 1.15, wb: 2.7, wr: 0.35, rim: 0.74, tireW: 0.3,
    rimStyle: pairs(5, 0.1, 0.045), rimColor: 0x1e1f22, accent: 0xf4c219,
    top: [[-2.3, 0.82], [-2.2, 0.9], [-1.6, 0.92], [-0.6, 0.86], [0.6, 0.76], [1.4, 0.66], [2.0, 0.52], [2.3, 0.38]],
    bottom: [[-2.3, 0.3], [-2.1, 0.14], [-1.6, 0.1], [1.7, 0.1], [2.2, 0.14], [2.3, 0.2]],
    hw: [[-2.3, 0.88], [-2.0, 0.99], [-1.3, 1.0], [0, 0.95], [1.3, 0.98], [2.0, 0.93], [2.3, 0.78]],
    waist: 0.45, nTop: 5, nBot: 8, tumble: 0.14, fender: 0.02,
    roof: [[-1.9, 0.91], [-1.4, 1.02], [-0.7, 1.13], [-0.2, 1.15], [0.1, 1.12], [0.9, 0.78], [1.0, 0.71]],
    gw: 0.86, gTumble: 0.25, roofF: -0.05, roofR: -0.6, roofStyle: 'black', cPillar: -0.85,
    details(k) {
      k.poly('front', [[0.5, 0.4], [0.86, 0.42], [0.82, 0.47], [0.56, 0.46]], 'lens', { mirror: true });
      k.ribbon('front', [[0.52, 0.41], [0.66, 0.44], [0.83, 0.44]], 0.016, 'head', { mirror: true, lift: 0.01 });
      k.ribbon('front', [[0.66, 0.44], [0.69, 0.465]], 0.016, 'head', { mirror: true, lift: 0.01 });
      k.poly('front', [[0.15, 0.18], [0.75, 0.18], [0.85, 0.36], [0.55, 0.36], [0.35, 0.28], [0.15, 0.28]], 'decal', { mirror: true });
      k.box('carbon', 1.6, 0.025, 0.25, 0, 0.12, 2.1);
      k.poly('side', [[-1.05, 0.48], [-0.55, 0.62], [-0.5, 0.42], [-0.85, 0.3]], 'decal');
      for (let i = 0; i < 6; i++) k.ribbon('top', [[-0.4, -1.0 - i * 0.14], [0.4, -1.0 - i * 0.14]], 0.05, 'decal');
      k.poly('rear', [[0.45, 0.72], [0.88, 0.7], [0.84, 0.78], [0.55, 0.8]], 'tail', { mirror: true });
      k.ribbon('rear', [[0.45, 0.72], [0.55, 0.8]], 0.03, 'decal', { mirror: true, lift: 0.01 });
      k.poly('rear', [[-0.8, 0.14], [0.8, 0.14], [0.7, 0.38], [-0.7, 0.38]], 'decal');
      for (const x of [-0.45, -0.15, 0.15, 0.45]) k.box('carbon', 0.02, 0.2, 0.3, x, 0.24, -2.2);
      k.cyl('chrome', 0.055, 0.15, 0.1, 0.5, -2.26, 'z', true);
      k.box('carbon', 1.4, 0.02, 0.18, 0, 0.88, -2.2, [0.12, 0, 0]);
    },
  },
  // Stellato 12: Italian-style front-engine V12 berlinetta. Long bonnet, cabin set far back,
  // egg-crate grille, flank vents, quad round tail lamps. Original design, no real model or badge.
  gtv12: {
    L: 4.7, W: 1.97, H: 1.27, wb: 2.72, wr: 0.36, rim: 0.73, tireW: 0.29,
    rimStyle: pairs(5, 0.11, 0.04), rimColor: 0xc9ccd1, accent: 0xf2c200,
    top: [[-2.35, 0.84], [-2.28, 0.92], [-1.9, 0.95], [-1.2, 0.9], [-0.2, 0.84], [0.8, 0.8], [1.6, 0.72], [2.1, 0.6], [2.3, 0.48], [2.35, 0.4]],
    bottom: [[-2.35, 0.32], [-2.15, 0.15], [-1.7, 0.12], [1.7, 0.12], [2.2, 0.16], [2.35, 0.24]],
    hw: [[-2.35, 0.8], [-2.05, 0.96], [-1.4, 0.985], [-0.5, 0.92], [0.6, 0.93], [1.5, 0.97], [2.1, 0.9], [2.35, 0.74]],
    waist: 0.45, nTop: 3, nBot: 7, tumble: 0.14, fender: 0.045,
    roof: [[-2.0, 0.94], [-1.5, 1.04], [-0.9, 1.22], [-0.4, 1.27], [0.0, 1.25], [0.6, 0.92], [0.75, 0.81]],
    gw: 0.86, gTumble: 0.24, roofF: -0.15, roofR: -0.6, roofStyle: 'paint', cPillar: -1.05,
    details(k) {
      // wide oval egg-crate grille
      k.rrect('front', -0.46, 0.18, 0.46, 0.36, 0.09, 'decal');
      for (const y of [0.23, 0.27, 0.31]) k.ribbon('front', [[-0.42, y], [0.42, y]], 0.008, 'trim', { lift: 0.01 });
      for (let x = -0.36; x <= 0.37; x += 0.09) k.ribbon('front', [[x, 0.2], [x, 0.34]], 0.008, 'trim', { lift: 0.01 });
      k.ribbon('front', [[-0.4, 0.37], [0, 0.385], [0.4, 0.37]], 0.012, 'chrome', { lift: 0.008 });
      // swept headlights climbing the wings
      k.poly('front', [[0.48, 0.42], [0.84, 0.47], [0.8, 0.53], [0.52, 0.47]], 'lens', { mirror: true });
      k.ribbon('front', [[0.52, 0.435], [0.82, 0.49]], 0.016, 'head', { mirror: true, lift: 0.01 });
      k.box('carbon', 1.1, 0.02, 0.16, 0, 0.13, 2.12);
      // flank vent behind the front wheel and a sill line
      k.poly('side', [[0.62, 0.62], [0.95, 0.66], [0.9, 0.5], [0.66, 0.46]], 'decal');
      for (const y of [0.52, 0.57, 0.62]) k.ribbon('side', [[0.66, y], [0.92, y + 0.02]], 0.012, 'paint', { lift: 0.012 });
      k.ribbon('side', [[-1.4, 0.24], [1.3, 0.24]], 0.04, 'carbon', { lift: 0.005 });
      // quad round tail lamps, diffuser, quad pipes
      for (const x of [0.38, 0.62]) {
        k.ellipse('rear', x, 0.7, 0.085, 0.085, 'lens', { mirror: true });
        k.ellipse('rear', x, 0.7, 0.062, 0.062, 'tail', { mirror: true, lift: 0.01 });
      }
      k.poly('rear', [[-0.72, 0.14], [0.72, 0.14], [0.62, 0.34], [-0.62, 0.34]], 'decal');
      for (const x of [-0.3, 0, 0.3]) k.box('carbon', 0.02, 0.17, 0.26, x, 0.22, -2.27);
      for (const x of [0.48, 0.6]) k.cyl('chrome', 0.042, 0.14, x, 0.27, -2.3, 'z', true);
      plate(k, 0.44);
    },
  },
  // Ardente R9: curvy mid-engine hybrid; strong haunches, twin round tail lamps, side scoops
  hybrid: {
    L: 4.55, W: 1.95, H: 1.2, wb: 2.65, wr: 0.35, rim: 0.72, tireW: 0.29,
    rimStyle: spokes(5, 0.06, 0, 0.22), rimColor: 0xb8bcc2, accent: 0x111111,
    top: [[-2.275, 0.84], [-2.2, 0.92], [-1.5, 0.95], [-0.8, 0.86], [0.4, 0.78], [1.2, 0.72], [1.9, 0.6], [2.2, 0.45], [2.275, 0.36]],
    bottom: [[-2.275, 0.3], [-2.05, 0.14], [-1.6, 0.11], [1.7, 0.11], [2.15, 0.15], [2.275, 0.22]],
    hw: [[-2.275, 0.82], [-2.0, 0.95], [-1.3, 0.975], [-0.3, 0.9], [0.9, 0.94], [1.9, 0.9], [2.275, 0.74]],
    waist: 0.45, nTop: 3, nBot: 7, tumble: 0.12, fender: 0.05,
    roof: [[-1.95, 0.94], [-1.3, 1.08], [-0.6, 1.19], [-0.15, 1.2], [0.15, 1.17], [0.85, 0.83], [0.95, 0.74]],
    gw: 0.84, gTumble: 0.26, roofF: 0.0, roofR: -0.5, roofStyle: 'paint', cPillar: -0.75,
    details(k) {
      k.poly('front', [[0.45, 0.43], [0.84, 0.46], [0.8, 0.51], [0.5, 0.48]], 'lens', { mirror: true });
      k.ribbon('front', [[0.48, 0.445], [0.81, 0.48]], 0.018, 'head', { mirror: true, lift: 0.01 });
      k.rrect('front', -0.5, 0.2, 0.5, 0.34, 0.06, 'decal');
      k.rrect('front', 0.58, 0.24, 0.82, 0.4, 0.05, 'decal', { mirror: true });
      k.box('carbon', 1.5, 0.02, 0.2, 0, 0.13, 2.1);
      k.poly('side', [[-1.2, 0.62], [-0.55, 0.66], [-0.6, 0.38], [-0.95, 0.3], [-1.15, 0.42]], 'decal');
      for (const x of [0.4, 0.64]) {
        k.ellipse('rear', x, 0.72, 0.1, 0.075, 'lens', { mirror: true });
        k.ellipse('rear', x, 0.72, 0.075, 0.055, 'tail', { mirror: true, lift: 0.01 });
      }
      k.poly('rear', [[-0.75, 0.13], [0.75, 0.13], [0.65, 0.36], [-0.65, 0.36]], 'decal');
      for (const x of [-0.3, 0, 0.3]) k.box('carbon', 0.02, 0.18, 0.28, x, 0.22, -2.17);
      for (const x of [0.12, 0.25]) k.cyl('chrome', 0.045, 0.15, x, 0.56, -2.24, 'z', true);
      k.box('paint', 1.3, 0.02, 0.16, 0, 0.94, -2.16, [0.25, 0, 0]);
    },
  },
  // Sovereign: long-bonnet chauffeur limousine, tall chrome grille, coach-built proportions
  royal: {
    L: 5.6, W: 2.0, H: 1.62, wb: 3.5, wr: 0.41, rim: 0.7, tireW: 0.26,
    rimStyle: spokes(14, 0.03, 0, 0.2), rimColor: 0xe6e8ea, accent: 0x777777,
    top: [[-2.8, 0.9], [-2.76, 1.02], [-2.4, 1.04], [-1.5, 1.03], [0, 1.02], [1.6, 1.02], [2.4, 1.0], [2.72, 0.92], [2.8, 0.8]],
    bottom: [[-2.8, 0.42], [-2.6, 0.24], [-2.1, 0.17], [2.1, 0.17], [2.6, 0.24], [2.8, 0.38]],
    hw: [[-2.8, 0.86], [-2.5, 0.97], [-1, 1.0], [1, 1.0], [2.5, 0.98], [2.8, 0.9]],
    waist: 0.55, nTop: 5, nBot: 8, tumble: 0.06,
    roof: [[-1.95, 1.03], [-1.75, 1.25], [-1.4, 1.52], [-1.0, 1.6], [0.5, 1.62], [0.85, 1.55], [1.35, 1.12], [1.45, 1.02]],
    gw: 0.92, gTumble: 0.08, gn: 4.5, roofF: 0.7, roofR: -1.15, roofStyle: 'paint', bPillar: -0.2, cPillar: -1.3, chromeTrim: true,
    details(k) {
      k.rrect('front', -0.32, 0.42, 0.32, 0.92, 0.02, 'chrome');
      k.rrect('front', -0.28, 0.46, 0.28, 0.88, 0.01, 'decal', { lift: 0.01 });
      for (let x = -0.24; x <= 0.241; x += 0.06) k.ribbon('front', [[x, 0.47], [x, 0.87]], 0.014, 'chrome', { lift: 0.014 });
      k.rrect('front', 0.42, 0.8, 0.86, 0.9, 0.02, 'lens', { mirror: true });
      k.ribbon('front', [[0.45, 0.83], [0.83, 0.83]], 0.02, 'head', { mirror: true, lift: 0.01 });
      k.ribbon('front', [[0.45, 0.87], [0.83, 0.87]], 0.012, 'head', { mirror: true, lift: 0.01 });
      k.rrect('front', -0.7, 0.28, 0.7, 0.36, 0.03, 'decal');
      k.rrect('rear', 0.5, 0.76, 0.84, 0.9, 0.02, 'tail', { mirror: true });
      k.ribbon('rear', [[-0.5, 0.88], [0.5, 0.88]], 0.025, 'chrome');
      plate(k, 0.56);
      k.ribbon('side', [[-2.3, 0.97], [2.3, 0.97]], 0.018, 'chrome', { lift: 0.004 });
      k.ribbon('side', [[-1.7, 0.3], [1.7, 0.3]], 0.03, 'chrome', { lift: 0.004 });
      for (const z of [0.3, -0.95]) k.rrect('side', z, 0.9, z + 0.18, 0.93, 0.01, 'chrome');
      k.cyl('chrome', 0.045, 0.1, 0.55, 0.32, -2.8, 'z', true);
    },
  },
  // Vortex: long-tail hypercar, narrow canopy, shark fin, swan-neck wing
  hyper: {
    L: 4.55, W: 2.04, H: 1.12, wb: 2.72, wr: 0.36, rim: 0.74, tireW: 0.32,
    rimStyle: spokes(10, 0.028, 0.1, 0.26), rimColor: 0x2b2d31, accent: 0x2a6fe0,
    top: [[-2.275, 0.86], [-2.2, 0.92], [-1.6, 0.9], [-0.8, 0.8], [0.2, 0.7], [1.2, 0.6], [1.9, 0.46], [2.275, 0.3]],
    bottom: [[-2.275, 0.26], [-2.05, 0.12], [-1.6, 0.09], [1.7, 0.09], [2.15, 0.11], [2.275, 0.16]],
    hw: [[-2.275, 0.9], [-1.9, 1.02], [-1.3, 1.02], [-0.2, 0.88], [0.9, 0.98], [1.7, 0.99], [2.275, 0.8]],
    waist: 0.42, nTop: 3.6, nBot: 8, tumble: 0.2, fender: 0.04,
    roof: [[-1.7, 0.89], [-1.0, 1.04], [-0.5, 1.11], [-0.1, 1.12], [0.3, 1.05], [0.9, 0.73], [1.0, 0.62]],
    gw: 0.78, gTumble: 0.28, roofF: -0.2, roofR: -0.5, roofStyle: 'black', cPillar: -0.8,
    details(k) {
      for (let i = 0; i < 4; i++) k.rrect('front', 0.46 + i * 0.08, 0.3 + i * 0.012, 0.52 + i * 0.08, 0.33 + i * 0.012, 0.01, 'head', { mirror: true, lift: 0.01 });
      k.poly('front', [[0.42, 0.28], [0.84, 0.31], [0.8, 0.37], [0.44, 0.34]], 'lens', { mirror: true });
      k.poly('front', [[0.0, 0.14], [0.4, 0.14], [0.5, 0.25], [0.0, 0.25]], 'decal', { mirror: true });
      k.box('carbon', 1.7, 0.025, 0.3, 0, 0.1, 2.08);
      k.poly('side', [[-1.35, 0.7], [-0.45, 0.62], [-0.5, 0.3], [-1.2, 0.26]], 'decal');
      k.ribbon('side', [[-1.65, 0.16], [1.55, 0.16]], 0.07, 'carbon', { lift: 0.006 });
      k.ribbon('rear', [[-0.85, 0.62], [0.85, 0.62]], 0.03, 'tail');
      k.poly('rear', [[-0.8, 0.14], [0.8, 0.14], [0.7, 0.4], [-0.7, 0.4]], 'decal');
      for (const x of [-0.5, -0.25, 0, 0.25, 0.5]) k.box('carbon', 0.02, 0.26, 0.4, x, 0.24, -2.1);
      k.cyl('chrome', 0.06, 0.12, 0.0, 0.5, -2.26, 'z');
      k.box('carbon', 0.02, 0.18, 1.1, 0, 0.95, -1.3);
      k.wing('carbon', 1.9, 0.38, 1.22, -2.0, 0.32, 0.4);
    },
  },
};

/** Garage line-up names live in data/vehicles.ts; this is just a sanity hook for tests. */
export const DESIGN_BODIES = Object.keys(DESIGNS) as DesignBody[];
export type { Pts };
