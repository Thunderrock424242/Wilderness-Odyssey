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
    date: 'WAKE DAY 1',
    survivor: 'UNKNOWN',
    body: "I stepped outside today for the first time. The air is clean - cleaner than I remember. The trees are enormous. Something is watching me from the treeline. I don't think it's hostile. I hope it's not hostile.",
    status: 'STATUS: ALIVE',
    tone: 'safe',
  },
  {
    id: 'LOG #0047',
    date: 'SURFACE DAY 39',
    survivor: 'MARA V.',
    body: "Found the old city today. Or what's left of it. Vines as thick as my arm have split the highway clean in half. In the middle of the intersection - a flower I've never seen. Glowing faintly blue. The scanner went haywire near it. I took a sample. I probably shouldn't have.",
    status: 'STATUS: INFECTED',
    tone: 'warn',
  },
  {
    id: 'LOG #0112',
    date: 'SURFACE DAY 126',
    survivor: 'COLE R.',
    body: "The old excavation site is closer than I thought. You can feel it before you see it - a low hum in your chest, like the world has a heartbeat. The wildlife won't go near it. I'm going anyway. The anomaly readings are off every chart I have. There's something beneath it that used to be a building. Used to be.",
    status: 'STATUS: MISSING',
    tone: 'danger',
  },
  {
    id: 'LOG #0203',
    date: 'SURFACE DAY 228',
    survivor: 'DR. ANIS H.',
    body: "The rift opened on its own. I wasn't even near the shard when it activated - it simply appeared. Through it I saw our forest in the wrong place, repeating into a violet haze. Echo Earth. I documented the opening. Then something on the other side looked back.",
    status: 'STATUS: UNSTABLE',
    tone: 'warn',
  },
  {
    id: 'LOG #0318',
    date: 'SURFACE DAY 350',
    survivor: '"WREN"',
    body: "Met another survivor today. First human contact in 14 months. She said she came from the coast - that there's a settlement there, maybe 200 people. She also said not everyone who left for the excavation zone came back wrong. Some came back changed. That's different.",
    status: 'STATUS: ALIVE',
    tone: 'safe',
  },
  {
    id: 'LOG #0419',
    date: 'DATE CORRUPTED',
    survivor: '[REDACTED]',
    body: `${block(20)} the accelerator was the key ${block(16)} meteor material was the lock ${block(8)} there was another Earth ${block(12)} Beal and Nathan kept the proof ${block(36)}`,
    status: 'ACCESS: DENIED',
    tone: 'danger',
    locked: true,
  },
];
