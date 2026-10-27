export const BALANCE = {
  arcadePointsPerUnit: 100,
  cashPerUnit: 5,
  xpPerJob: 30,
  xpPerStoryChapter: 55,
  arcadeXpPerPoints: 1500, // one XP per this many arcade points…
  arcadeXpMin: 2,          // …at least this much for any scoring run…
  arcadeXpMax: 15,         // …and at most this (a city job gives 30)
  baseFare: 7,
  farePerMetre: 0.045,
  pickupRadius: 8,
  stopSpeed: 2.5,     // m/s — must be slower than this to board
  boardTime: 0.6,     // seconds stopped inside the zone
};
