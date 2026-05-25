export type ReleaseNote = {
  version: string;
  date: string;
  entries: string[];
};

export type WildernessConfig = {
  modpack: {
    version: string;
    released: string;
    mcVersion: string;
    loader: string;
    status: string;
    curseforge: string;
  };
  website: {
    version: string;
    updated: string;
    author: string;
  };
  modpackLog: ReleaseNote[];
  websiteLog: ReleaseNote[];
};

export const WO_CONFIG: WildernessConfig = {
  modpack: {
    version: '0.4.2-alpha',
    released: '2025-11-14',
    mcVersion: '1.21.1',
    loader: 'NeoForge',
    status: 'ALPHA - active development',
    curseforge: 'https://www.curseforge.com/minecraft',
  },

  website: {
    version: '0.5.0',
    updated: '2026-05-09',
    author: 'Thunderrock424242',
  },

  modpackLog: [
    {
      version: '0.4.2-alpha',
      date: '2025-11-14',
      entries: [
        'Added anomaly saturation system - prolonged exposure now has consequences',
        'New biome: The Hollow Reaches (northwest quadrant)',
        '3 new creature variants near crater zones',
        'Fixed water physics desync on multiplayer servers',
        'Optimised SPH fluid simulation - about 18% performance improvement',
      ],
    },
  ],

  websiteLog: [
    {
      version: '0.5.0',
      date: '2026-05-09',
      entries: [
        'Full cinematic redesign - movie trailer aesthetic',
        'Interactive Bunker OS terminal with command system',
        'Survivor Logs section with 6 recovered diary entries',
        'Full-width cinematic gallery slideshow with Ken Burns effect',
        'Version checker and changelog system added to terminal',
        'Scroll progress bar, parallax hero, glitch title effect',
        'Split into index.html, style.css, and readable TypeScript modules',
      ],
    },
  ],
};
