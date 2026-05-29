// Corresponds to shared site metadata and terminal version output.

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

};
