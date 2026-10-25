// City layout constants and named destinations.
export const GRID = 10;           // blocks per side
export const PITCH = 64;          // metres between road centre-lines
export const HALF = (GRID * PITCH) / 2; // 320
export const ROAD_W = 14;         // carriageway width (2 lanes each way)
export const LANE_W = 3.5;
export const WALK_W = 4;          // sidewalk width
export const DRIVE_RIGHT = true;  // right-hand traffic

export const roadCoord = (k: number) => -HALF + k * PITCH;

export interface Destination {
  name: string;
  /** Road segment: axis 'x' = road running along X at z=roadCoord(j), between i and i+1. */
  axis: 'x' | 'z';
  i: number;
  j: number;
  side: 1 | -1;    // which kerb the stop is on
  landmark: 'station' | 'apartments' | 'hospital' | 'mall' | 'campus' | 'hotel' | 'market' | 'oldtown' | 'park' | 'arts';
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
];

export const destinationByName = (n: string) => DESTINATIONS.find((d) => d.name === n)!;

export const RESTAURANTS = ['Burger House', 'Sushi Junction', 'Pizza Lab', 'Noodle Street', 'Green Bowl', 'Taco Yard'];
