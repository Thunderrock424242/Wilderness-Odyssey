// Corresponds to the Survivor Logs section.
export type SurvivorLogTone = 'safe' | 'warn' | 'danger';

export type SurvivorLog = {
  id: string;
  date: string;
  survivor: string;
  body: string;
  status: string;
  tone: SurvivorLogTone;
  locked?: boolean;
};

const block = (length: number) => '\u2588'.repeat(length);

export const SURVIVOR_LOGS: SurvivorLog[] = [
  {
    id: 'LOG #0001',
    date: 'DAY 18,263',
    survivor: 'UNKNOWN',
    body: "I stepped outside today for the first time. The air is clean - cleaner than I remember. The trees are enormous. Something is watching me from the treeline. I don't think it's hostile. I hope it's not hostile.",
    status: 'STATUS: ALIVE',
    tone: 'safe',
  },
  {
    id: 'LOG #0047',
    date: 'DAY 18,301',
    survivor: 'MARA V.',
    body: "Found the old city today. Or what's left of it. Vines as thick as my arm have split the highway clean in half. In the middle of the intersection - a flower I've never seen. Glowing faintly blue. The scanner went haywire near it. I took a sample. I probably shouldn't have.",
    status: 'STATUS: INFECTED',
    tone: 'warn',
  },
  {
    id: 'LOG #0112',
    date: 'DAY 18,388',
    survivor: 'COLE R.',
    body: "The crater is closer than I thought. You can feel it before you see it - a low hum in your chest, like the world has a heartbeat. The wildlife won't go near it. I'm going anyway. The anomaly readings are off every chart I have. There's something in there that used to be a building. Used to be.",
    status: 'STATUS: MISSING',
    tone: 'danger',
  },
  {
    id: 'LOG #0203',
    date: 'DAY 18,490',
    survivor: 'DR. ANIS H.',
    body: "The portal opened on its own. I wasn't even near the shard when it activated - it simply appeared. A door to somewhere else, shimmering like heat haze. I documented its dimensions. Then I looked through. I regret looking through.",
    status: 'STATUS: UNSTABLE',
    tone: 'warn',
  },
  {
    id: 'LOG #0318',
    date: 'DAY 18,612',
    survivor: '"WREN"',
    body: "Met another survivor today. First human contact in 14 months. She said she came from the coast - that there's a settlement there, maybe 200 people. She also said not everyone who left for the crater came back wrong. Some came back changed. That's different.",
    status: 'STATUS: ALIVE',
    tone: 'safe',
  },
  {
    id: 'LOG #0419',
    date: 'DAY ???',
    survivor: '[REDACTED]',
    body: `${block(20)} the meteor didn't arrive by accident ${block(16)} they knew ${block(8)} we were never supposed to ${block(12)} the anomaly isn't anomaly at all ${block(36)}`,
    status: 'ACCESS: DENIED',
    tone: 'danger',
    locked: true,
  },
];
