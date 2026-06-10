export interface CrashAnalysis {
  likelyCause: string;
  confidence: 'low' | 'medium' | 'high';
  confidenceScore: number;
  signals: string[];
  nextSteps: string[];
  redactedLog: string;
}

interface CrashRule {
  name: string;
  patterns: RegExp[];
  score: number;
  nextSteps: string[];
}

const rules: CrashRule[] = [
  {
    name: 'Wrong Java version',
    patterns: [
      /UnsupportedClassVersionError/i,
      /class file version \d+/i,
      /compiled by a more recent version of the Java Runtime/i,
      /requires Java (?:version )?\d+/i
    ],
    score: 0.92,
    nextSteps: [
      'Check the recommended Java version in /status.',
      'Point your launcher at the correct Java install.',
      'Relaunch the pack after changing Java.'
    ]
  },
  {
    name: 'Missing required mod or dependency',
    patterns: [
      /missing (?:or unsupported )?mandatory dependencies/i,
      /requires .+ but .+ is not installed/i,
      /missing mods?/i,
      /mod .+ requires/i
    ],
    score: 0.86,
    nextSteps: [
      'Reinstall or repair the modpack profile from the launcher.',
      'Avoid manually deleting mods from the pack.',
      'If this is a server, verify the server and client are on the same pack version.'
    ]
  },
  {
    name: 'Duplicate mod file',
    patterns: [
      /DuplicateModsFound/i,
      /duplicate mod/i,
      /found duplicate mods/i,
      /Mod .+ is present multiple times/i
    ],
    score: 0.88,
    nextSteps: [
      'Open the mods folder and remove duplicate jar files.',
      'Repair the profile if the launcher supports it.',
      'Keep only the mod versions included with the pack.'
    ]
  },
  {
    name: 'Wrong NeoForge/Forge version',
    patterns: [
      /wrong (?:neo)?forge version/i,
      /requires (?:neo)?forge/i,
      /net\.neoforged\.fml/i,
      /Loading errors encountered.*(?:forge|neoforge)/is
    ],
    score: 0.8,
    nextSteps: [
      'Use the loader version bundled with the modpack.',
      'Do not swap Forge/NeoForge versions manually.',
      'Repair or reinstall the profile if the loader changed.'
    ]
  },
  {
    name: 'Client/server mod mismatch',
    patterns: [
      /mismatched mod channel list/i,
      /incompatible mod set/i,
      /requires channel .+ to be present/i,
      /registry remapping failed/i,
      /failed to synchronize registry data/i
    ],
    score: 0.82,
    nextSteps: [
      'Make sure the client and server use the same Wilderness Oddesy version.',
      'Remove extra client-only mods from the server.',
      'Ask staff whether the server updated before your client did.'
    ]
  },
  {
    name: 'Out of memory',
    patterns: [
      /OutOfMemoryError/i,
      /Java heap space/i,
      /GC overhead limit exceeded/i,
      /unable to create native thread/i
    ],
    score: 0.93,
    nextSteps: [
      'Allocate the recommended RAM from /status.',
      'Close other heavy applications before launching.',
      'Avoid allocating all system RAM; leave memory for Windows and the launcher.'
    ]
  },
  {
    name: 'Entity ticking crash',
    patterns: [
      /Ticking entity/i,
      /Entity being ticked/i,
      /Exception ticking world entities/i,
      /at net\.minecraft\.world\.entity/i
    ],
    score: 0.78,
    nextSteps: [
      'Tell staff what mob or entity was nearby.',
      'Include the world, dimension, and coordinates if safe to share.',
      'Avoid re-entering the area until staff can inspect the crash.'
    ]
  },
  {
    name: 'World generation crash',
    patterns: [
      /Exception generating new chunk/i,
      /ChunkGenerator/i,
      /NoiseBasedChunkGenerator/i,
      /BiomeSource/i,
      /Feature placement/i,
      /worldgen/i
    ],
    score: 0.76,
    nextSteps: [
      'Note the dimension and what area you were exploring.',
      'If this happened on world creation, try a different seed and report both results.',
      'Send the report ID to staff so they can compare generation signatures.'
    ]
  },
  {
    name: 'Datapack loading error',
    patterns: [
      /Failed to load datapacks/i,
      /Errors in currently selected datapacks/i,
      /Couldn't load tag/i,
      /ReloadableResourceManager/i,
      /not a json object/i
    ],
    score: 0.8,
    nextSteps: [
      'Repair the modpack profile to restore bundled datapacks.',
      'Remove manually added datapacks while testing.',
      'If this is a server, confirm server datapacks match the pack release.'
    ]
  },
  {
    name: 'Mixin conflict',
    patterns: [
      /Mixin apply failed/i,
      /MixinTransformerError/i,
      /InvalidMixinException/i,
      /InjectionError/i,
      /Mixin prepare failed/i
    ],
    score: 0.84,
    nextSteps: [
      'Remove extra mods not included in the pack and retry.',
      'Repair the profile to restore exact mod versions.',
      'Share the report ID with staff; mixin errors often need a pack-side fix.'
    ]
  },
  {
    name: 'Renderer/OpenGL/GPU issue',
    patterns: [
      /OpenGL/i,
      /GLFW/i,
      /LWJGL/i,
      /RenderSystem/i,
      /Tesselator/i,
      /BufferBuilder/i,
      /graphics driver/i,
      /(?:iris|oculus|embeddium|sodium)/i
    ],
    score: 0.72,
    nextSteps: [
      'Update GPU drivers from NVIDIA, AMD, or Intel.',
      'Try launching without shaders.',
      'Lower render distance and test again.'
    ]
  },
  {
    name: 'Structure generation issue',
    patterns: [
      /StructureTemplate/i,
      /Jigsaw/i,
      /PoolElementStructurePiece/i,
      /structure generation/i,
      /while placing structure/i
    ],
    score: 0.77,
    nextSteps: [
      'Report the structure name or nearby biome if known.',
      'Include the dimension and coordinates if safe to share.',
      'Avoid the area until staff can reproduce the generation issue.'
    ]
  },
  {
    name: 'Wilderness Oddesy mod/API crash',
    patterns: [
      /wilderness[ _-]?oddes[yi]/i,
      /WildernessOddes[yi]/i,
      /com\.[\w.]*wilderness[\w.]*/i,
      /net\.[\w.]*wilderness[\w.]*/i
    ],
    score: 0.87,
    nextSteps: [
      'This looks related to Wilderness Oddesy code or content.',
      'Keep the generated crash report ID and notify staff.',
      'Include what you were doing near rifts, anomalies, cryo facilities, structures, mobs, or custom items.'
    ]
  }
];

export function redactLog(logText: string): string {
  return logText
    .replace(/[A-Za-z0-9_-]{23,28}\.[A-Za-z0-9_-]{6,8}\.[A-Za-z0-9_-]{20,110}/g, '[redacted-token]')
    .replace(/\b[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, '[redacted-email]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[redacted-ip]')
    .replace(/\b(?:access|auth|session|refresh)?token\s*[:=]\s*["']?[^"'\s]+/gi, '[redacted-token]')
    .replace(/[A-Za-z]:\\Users\\[^\\\r\n]+/g, 'C:\\Users\\[redacted]')
    .replace(/\/home\/[^/\r\n]+/g, '/home/[redacted]')
    .replace(/\/Users\/[^/\r\n]+/g, '/Users/[redacted]');
}

export function analyzeCrashLog(logText: string): CrashAnalysis {
  const redactedLog = redactLog(logText).slice(0, 120_000);
  const matched = rules
    .map((rule) => ({
      rule,
      matches: rule.patterns.filter((pattern) => pattern.test(redactedLog)).length
    }))
    .filter((result) => result.matches > 0)
    .sort((a, b) => {
      const scoreDelta = b.rule.score - a.rule.score;
      return scoreDelta !== 0 ? scoreDelta : b.matches - a.matches;
    });

  if (matched.length === 0) {
    return {
      likelyCause: 'No known crash signature detected',
      confidence: 'low',
      confidenceScore: 0.25,
      signals: ['No configured parser rule matched this log.'],
      nextSteps: [
        'Make sure this is a full crash report or latest.log.',
        'Tell staff what you were doing right before the crash.',
        'Try reproducing on a clean modpack profile if you added extra mods.'
      ],
      redactedLog
    };
  }

  const top = matched[0];
  const score = Math.min(0.98, top.rule.score + Math.min(0.06, (top.matches - 1) * 0.02));

  return {
    likelyCause: top.rule.name,
    confidence: score >= 0.75 ? 'high' : score >= 0.5 ? 'medium' : 'low',
    confidenceScore: score,
    signals: matched.slice(0, 4).map((result) => `${result.rule.name} (${result.matches} signal${result.matches === 1 ? '' : 's'})`),
    nextSteps: top.rule.nextSteps,
    redactedLog
  };
}
