// Story v1.1 "The Week": five days in Shift City, told in comic panels, with evening choices and stats that
// change the driving. Upbeat with real stakes, more good endings than bad, no personal/family storyline.
// Plain data so it can be exported for the Unreal version later.

/** One comic panel: who's in it, a big icon for the art, and what they say (or a caption). */
export interface Panel { who: string; art: string; text: string; tone?: 'warm' | 'cool' | 'night' | 'gold' }

export interface WeekJob {
  a: string; b: string; food: boolean; price: number;
  passenger: string; intro: string; outro: string;
  bonusTime?: number;
  /** Story flag set when this job is done well (4.5+ stars). */
  flag?: string;
}

/** Effects of an evening choice. Money is added to the wallet; energy 0-100; rating nudges the week's rating. */
export interface Effect { money?: number; energy?: number; rating?: number; flag?: string }
export interface Choice { label: string; hint: string; effect: Effect; reply: string }

export interface WeekDay {
  title: string;
  panels: Panel[];
  jobs: WeekJob[];
  evening: { prompt: string; panel: Panel; choices: Choice[] };
}

export const WEEK_TITLE = 'THE WEEK';
export const WEEK_GOAL = 450; // the car lease due Friday night

export const WEEK: WeekDay[] = [
  {
    title: 'MONDAY · NEW IN TOWN',
    panels: [
      { who: 'Shift City', art: '🌆', text: 'Monday, 7:02 am. The city is waking up, and so is your driver app.', tone: 'warm' },
      { who: 'Ava Sterling', art: '💼', text: '"Shift Fleet is picking ONE Driver of the Week. Premium contract on Friday. Impress me."', tone: 'gold' },
      { who: 'You', art: '🚗', text: 'The car lease is due Friday night: $450. Five days. Let\'s go.', tone: 'cool' },
    ],
    jobs: [
      { a: 'Central Station', b: 'Arts District', food: false, price: 32, passenger: 'Maya, gallery curator',
        intro: '"New driver? Good. My gallery opens Friday and I need someone reliable all week."', outro: '"Smooth ride. Same time tomorrow?"', flag: 'maya' },
      { a: 'Market Square', b: 'University Quarter', food: true, price: 36, passenger: 'Noodle Street kitchen', bonusTime: 95,
        intro: 'Mrs. Okafor: "Ramen for the study group. They tip in gratitude, not cash. Hurry!"', outro: 'The study group sends a photo: six empty bowls.', flag: 'okafor' },
    ],
    evening: {
      prompt: 'Monday night. The app pings: late airport run, good money.',
      panel: { who: 'Driver app', art: '📱', text: '"Late request near the Harbour Hotel. +$45 if you take it now."', tone: 'night' },
      choices: [
        { label: 'Take the late run', hint: '+$45 · −25 energy', effect: { money: 45, energy: -25 }, reply: 'Home at midnight, $45 richer and very tired.' },
        { label: 'Call it a night', hint: '+15 energy', effect: { energy: 15 }, reply: 'You sleep like a parked car.' },
      ],
    },
  },
  {
    title: 'TUESDAY · THE DINNER RUSH',
    panels: [
      { who: 'Mrs. Okafor', art: '🍜', text: '"My delivery boy quit! Tuesday is noodle night. Can you help?"', tone: 'warm' },
      { who: 'Leo', art: '🎸', text: '"And I\'ve got a gig at the Riverside. Amp, guitar, me. Nervous!"', tone: 'cool' },
    ],
    jobs: [
      { a: 'Market Square', b: 'Riverside Apartments', food: true, price: 40, passenger: 'Noodle Street kitchen', bonusTime: 100,
        intro: 'Mrs. Okafor: "Twelve bowls for Riverside. Don\'t spill a drop!"', outro: '"Perfect! You\'re hired. Unofficially."', flag: 'okafor' },
      { a: 'University Quarter', b: 'Riverside Apartments', food: false, price: 34, passenger: 'Leo, music student',
        intro: '"Careful over the bumps, the guitar was my grandpa\'s… I mean, it\'s vintage."', outro: '"Made it for soundcheck! Come to the show sometime."', flag: 'leo' },
      { a: 'Old Town', b: 'Westside Mall', food: false, price: 30, passenger: 'Tunde, shop owner',
        intro: '"Mall closes in 20. My stock delivery is stuck there."', outro: '"Lifesaver. Five stars, obviously."' },
    ],
    evening: {
      prompt: 'Leo texts: "Gig\'s tonight! Free entry for my driver."',
      panel: { who: 'Leo', art: '🎤', text: '"Come for one song? It\'d mean a lot."', tone: 'night' },
      choices: [
        { label: 'Go to Leo\'s gig', hint: '−10 energy · Leo remembers', effect: { energy: -10, flag: 'leo' }, reply: 'He dedicates a song "to the best driver in Shift City".' },
        { label: 'Drive the evening surge', hint: '+$40 · −20 energy', effect: { money: 40, energy: -20 }, reply: 'Surge pricing pays. Your eyes are heavy.' },
        { label: 'Rest', hint: '+20 energy', effect: { energy: 20 }, reply: 'Early night. Tomorrow-you says thanks.' },
      ],
    },
  },
  {
    title: 'WEDNESDAY · RUSH HOUR',
    panels: [
      { who: 'Radio', art: '📻', text: '"Traffic is heavy across the city. Drivers, patience pays today."', tone: 'cool' },
      { who: 'Mr. Okafor', art: '⏱️', text: '"I\'m pitching to Ava Sterling at noon. If I\'m late, I\'m done."', tone: 'gold' },
    ],
    jobs: [
      { a: 'Harbour Hotel', b: 'Old Town', food: false, price: 62, passenger: 'Mr. Okafor, consultant', bonusTime: 85,
        intro: '"Old Town. As fast as is legal. Faster if possible. Kidding! Mostly."', outro: '"Two minutes early. I owe you one."', flag: 'mrokafor' },
      { a: 'Arts District', b: 'Central Station', food: false, price: 28, passenger: 'Maya, gallery curator',
        intro: '"Picking up a painting from the train. It\'s worth more than this car."', outro: '"Not a scratch. You\'re hired for Friday."', flag: 'maya' },
    ],
    evening: {
      prompt: 'Maya calls: "The gallery needs hands tonight. I can\'t pay much."',
      panel: { who: 'Maya', art: '🖼️', text: '"Help me hang the show? Pizza is on me."', tone: 'night' },
      choices: [
        { label: 'Help Maya set up', hint: '−15 energy · Maya remembers', effect: { energy: -15, flag: 'maya' }, reply: 'The show looks amazing. Maya writes your name on the thank-you wall.' },
        { label: 'Take night rides', hint: '+$50 · −25 energy', effect: { money: 50, energy: -25 }, reply: 'The night crowd tips well. You yawn at every red light.' },
        { label: 'Rest', hint: '+20 energy', effect: { energy: 20 }, reply: 'A quiet night in. You feel human again.' },
      ],
    },
  },
  {
    title: 'THURSDAY · THE NIGHT SHIFT',
    panels: [
      { who: 'Rosa', art: '🏥', text: '"I\'m a night nurse. The bus broke down and my shift starts in fifteen."', tone: 'night' },
      { who: 'Ava Sterling', art: '📊', text: '"I\'ve been watching the ratings. Tomorrow I ride with the top three drivers."', tone: 'gold' },
    ],
    jobs: [
      { a: 'South Park', b: 'City Hospital', food: false, price: 58, passenger: 'Rosa, night nurse', bonusTime: 95,
        intro: '"Please hurry, but don\'t make me need the hospital myself."', outro: '"On time! My patients thank you. I thank you."', flag: 'rosa' },
      { a: 'City Hospital', b: 'Market Square', food: true, price: 38, passenger: 'Noodle Street kitchen', bonusTime: 100,
        intro: 'Mrs. Okafor: "Night shift at the hospital ordered forty dumplings. Go!"', outro: 'The whole ward cheers when you walk in.', flag: 'okafor' },
    ],
    evening: {
      prompt: 'Friday is the big day. How do you prepare?',
      panel: { who: 'You', art: '🌙', text: 'One more day. The lease, the contract, the gallery opening…', tone: 'night' },
      choices: [
        { label: 'Wash and polish the car', hint: '−10 energy · +0.1 rating', effect: { energy: -10, rating: 0.1 }, reply: 'It gleams. Passengers will notice.' },
        { label: 'One more shift', hint: '+$55 · −30 energy', effect: { money: 55, energy: -30 }, reply: 'Cash in hand. Sleep? What\'s sleep?' },
        { label: 'Sleep early', hint: '+30 energy', effect: { energy: 30 }, reply: 'Eight full hours. You wake up ready.' },
      ],
    },
  },
  {
    title: 'FRIDAY · DRIVER OF THE WEEK',
    panels: [
      { who: 'Shift City', art: '🎉', text: 'Friday. The city fair is on, the gallery opens tonight, and the lease is due at midnight.', tone: 'warm' },
      { who: 'Ava Sterling', art: '💼', text: '"Today I\'m your passenger. Drive like the contract depends on it. Because it does."', tone: 'gold' },
    ],
    jobs: [
      { a: 'Arts District', b: 'Riverside Apartments', food: false, price: 110, passenger: 'Ava Sterling, investor',
        intro: '"No bumps, no drama. Show me what a week in this city taught you."', outro: '"Hm. Let\'s talk tonight."', flag: 'ava' },
      { a: 'Riverside Apartments', b: 'Arts District', food: false, price: 40, passenger: 'Maya, gallery curator',
        intro: '"Opening night! Get me there before the doors open!"', outro: '"You came through all week. Come in, you\'re a guest tonight."', flag: 'maya' },
    ],
    evening: {
      prompt: 'Friday night. Everyone you drove this week is at the gallery.',
      panel: { who: 'Shift City', art: '🌃', text: 'Music from Leo, dumplings from Mrs. Okafor, art on the walls. And Ava Sterling, walking your way.', tone: 'night' },
      choices: [
        { label: 'Hear what Ava has to say', hint: 'See how your week ends', effect: {}, reply: '' },
      ],
    },
  },
];

export interface Ending { id: string; title: string; art: string; text: string; good: boolean }

export const ENDINGS: Record<string, Ending> = {
  driver: { id: 'driver', title: 'DRIVER OF THE WEEK', art: '🏆', good: true,
    text: 'Ava hands you a contract: premium rides, guaranteed hours, your face on the Shift Fleet billboard. The lease? Paid twice over.' },
  favourite: { id: 'favourite', title: 'THE CITY\'S FAVOURITE', art: '💛', good: true,
    text: 'Ava picked someone else, but nobody at the party cares. Mrs. Okafor names a dish after you, Leo wrote you a song, Maya hung your photo on the wall. You\'re part of this city now.' },
  steady: { id: 'steady', title: 'LEASE PAID, LESSON LEARNED', art: '🔑', good: true,
    text: 'No billboard this time, but the lease is paid, the car is yours for another month and the app says your rating is climbing. Next week is going to be good.' },
  burnout: { id: 'burnout', title: 'RUNNING ON EMPTY', art: '🪫', good: false,
    text: 'You fall asleep at the gallery before Ava finds you. The lease is short and so is your patience. Rest, regroup, and try The Week again: the city will still be here.' },
};
