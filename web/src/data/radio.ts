// Car radio: stations and their tracks. To add your own song: put the MP3 in web/public/music/,
// add one line below (title, artist, file, station, licence) and push. It ships with the next build and
// shows up in the in-game Credits. Only add music you made or have the rights to use.
export type StationId = 'chill' | 'drive' | 'hype' | 'off';
export interface RadioTrack { title: string; artist: string; file: string; station: Exclude<StationId, 'off'>; licence: string }

export const STATIONS: { id: StationId; name: string }[] = [
  { id: 'drive', name: 'Drive 101' },
  { id: 'chill', name: 'Chill FM' },
  { id: 'hype', name: 'Hype Radio' },
  { id: 'off', name: 'Radio off' },
];

export const RADIO_TRACKS: RadioTrack[] = [
  { title: 'City In The Rearview', artist: 'HoliznaCC0', file: 'music/city_rearview.mp3', station: 'drive', licence: 'CC0' },
  { title: 'Families', artist: 'HoliznaCC0', file: 'music/menu_families.mp3', station: 'drive', licence: 'CC0' },
  { title: 'Autumn', artist: 'HoliznaCC0', file: 'music/city_autumn.mp3', station: 'chill', licence: 'CC0' },
  { title: 'Dream Pop', artist: 'HoliznaCC0', file: 'music/city_dreampop.mp3', station: 'chill', licence: 'CC0' },
  { title: 'Cool Highway', artist: 'MintoDog', file: 'music/arcade_cool_highway.mp3', station: 'hype', licence: 'CC0' },
  { title: 'Cool Highway (Climax)', artist: 'MintoDog', file: 'music/arcade_cool_highway_climax.mp3', station: 'hype', licence: 'CC0' },
];

export const tracksFor = (s: StationId) => RADIO_TRACKS.filter((t) => t.station === s);
export const stationName = (s: StationId) => STATIONS.find((x) => x.id === s)?.name ?? 'Radio';
export const nextStation = (s: StationId): StationId => STATIONS[(STATIONS.findIndex((x) => x.id === s) + 1) % STATIONS.length].id;
