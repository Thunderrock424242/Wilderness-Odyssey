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
    version: '0.1.0',
    released: 'Unreleased',
    mcVersion: '1.21.1',
    loader: 'NeoForge',
    status: 'UNRELEASED - first alpha in development',
    curseforge: 'https://www.curseforge.com/minecraft',
  },

  website: {
    version: '0.6.0',
    updated: '2026-06-20',
    author: 'Thunderrock424242',
  },

};
