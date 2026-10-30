// City layout constants and named destinations.
export const GRID = 10;           // blocks per side
export const PITCH = 64;          // metres between road centre-lines
export const HALF = (GRID * PITCH) / 2; // 320
export const ROAD_W = 14;         // carriageway width (2 lanes each way)
export const LANE_W = 3.5;
export const WALK_W = 4;          // sidewalk width
export const DRIVE_RIGHT = true;  // right-hand traffic

export const roadCoord = (k: number) => -HALF + k * PITCH;

/** Junctions (grid i, j) that are mini roundabouts: no traffic lights, traffic circles a raised island. */
export const ROUNDABOUTS: [number, number][] = [[5, 5], [2, 7], [8, 3], [3, 2]];
export const ISLAND_R = 3.2;  // raised centre island (m)
export const RING_R = 5.2;    // where traffic drives around it

/**
 * One-way streets: the road along `axis` at roadCoord(k) only carries traffic towards +axis (dir 1) or -axis (-1).
 * Chosen to avoid the roundabouts.
 */
/**
 * Ring road: a loop round the city RING_D from the centre (rounded corners of radius RING_CORNER), joined to the
 * grid by short link roads from the middle of each edge.
 */
export const RING_D = 375;
export const RING_CORNER = 55;

export const ONE_WAY: { axis: 'x' | 'z'; k: number; dir: 1 | -1 }[] = [
  { axis: 'x', k: 4, dir: 1 },
  { axis: 'z', k: 6, dir: -1 },
];

export interface Destination {
  name: string;
  /** Road segment: axis 'x' = road running along X at z=roadCoord(j), between i and i+1. */
  axis: 'x' | 'z';
  i: number;
  j: number;
  side: 1 | -1;    // which kerb the stop is on
  landmark: 'station' | 'apartments' | 'hospital' | 'mall' | 'campus' | 'hotel' | 'market' | 'oldtown' | 'park' | 'arts' | 'airport';
  /** Destinations off the grid (the airport on the ring road): the road edge [node a, node b] they're on. */
  edge?: [number, number];
  x: number;
  z: number;
}

function dest(name: string, axis: 'x' | 'z', i: number, j: number, side: 1 | -1, landmark: Destination['landmark']): Destination {
  const along = roadCoord(i) + PITCH / 2;
  const across = roadCoord(j) + side * (ROAD_W / 2 - LANE_W / 2);
  return axis === 'x'
    ? { name, axis, i, j, side, landmark, x: along, z: across }
    : { name, axis, i, j, side, landmark, x: across, z: along };
}

// The same ten places as v4, re-sited onto kerbs of the new road grid.
export const DESTINATIONS: Destination[] = [
  dest('Central Station', 'x', 4, 2, 1, 'station'),
  dest('Riverside Apartments', 'z', 7, 8, -1, 'apartments'),
  dest('City Hospital', 'x', 2, 7, -1, 'hospital'),
  dest('Westside Mall', 'z', 3, 1, 1, 'mall'),
  dest('University Quarter', 'x', 6, 1, 1, 'campus'),
  dest('Harbour Hotel', 'z', 5, 9, 1, 'hotel'),
  dest('Market Square', 'x', 4, 7, 1, 'market'),
  dest('Old Town', 'z', 8, 6, -1, 'oldtown'),
  dest('South Park', 'x', 1, 9, -1, 'park'),
  dest('Arts District', 'z', 5, 5, -1, 'arts'),
  // on the outer kerb of the ring road's east side, between the east and south link roads (ring nodes 122 → 123)
  { name: 'Airport', axis: 'z', i: -1, j: -1, side: 1, landmark: 'airport', x: RING_D + ROAD_W / 2 - LANE_W / 2, z: 190, edge: [122, 123] },
];
/** Destinations on the city grid (everything except the airport). */
export const GRID_DESTINATIONS = () => DESTINATIONS.filter((d) => !d.edge);

export const destinationByName = (n: string) => DESTINATIONS.find((d) => d.name === n)!;

export const RESTAURANTS = ['Burger House', 'Sushi Junction', 'Pizza Lab', 'Noodle Street', 'Green Bowl', 'Taco Yard'];
