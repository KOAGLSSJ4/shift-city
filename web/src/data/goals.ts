export type GoalKind = 'trips' | 'food' | 'distance' | 'arcade' | 'story' | 'cars' | 'nearmiss';
export interface GoalDef { id: string; name: string; goal: number; reward: number; xp: number; kind: GoalKind }

// v4's seven goals (same ids so claimed state migrates) plus two new ones.
export const GOALS: GoalDef[] = [
  { id: 'first', name: 'First shift: complete 1 job', goal: 1, reward: 75, xp: 70, kind: 'trips' },
  { id: 'five', name: 'Busy day: complete 5 jobs', goal: 5, reward: 220, xp: 150, kind: 'trips' },
  { id: 'food', name: 'Courier: deliver 3 meals', goal: 3, reward: 120, xp: 90, kind: 'food' },
  { id: 'distance', name: 'Explorer: drive 10 km', goal: 10, reward: 160, xp: 120, kind: 'distance' },
  { id: 'arcade', name: 'Rush hour: score 500', goal: 500, reward: 140, xp: 100, kind: 'arcade' },
  { id: 'streak', name: 'Arcade pro: score 2,000', goal: 2000, reward: 400, xp: 260, kind: 'arcade' },
  { id: 'story', name: 'Rising star: finish 3 chapters', goal: 3, reward: 350, xp: 200, kind: 'story' },
  { id: 'garage', name: 'Upgrade: own 2 vehicles', goal: 2, reward: 150, xp: 120, kind: 'cars' },
  { id: 'nearmiss', name: 'Thread the needle: 25 near misses', goal: 25, reward: 200, xp: 150, kind: 'nearmiss' },
];
