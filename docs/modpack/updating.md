# Updating Wilderness Odyssey

Keep Minecraft **1.21.1**, Java **21**, and the **NeoForge 21.1.x** loader line.
The Git target is **21.1.262**, verified as the latest stable 21.1.x build on
2026-10-17 using [official Maven metadata](https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml).
"Latest" for another Minecraft version is not interchangeable with this pack.

## Mods and configs

1. Back up saves before testing updates. Prefer a duplicate CurseForge profile.
2. In CurseForge, update a small related group of mods and their dependencies,
   selecting **Minecraft 1.21.1 / NeoForge** files. Test that profile in the
   launcher, then close updates before scanning. Keep the previous working files
   until the update is verified; the importer never edits a profile.
3. Open a terminal in the PR checkout (or the target branch after merging) and
   preview changes. Replace the profile path if you used a duplicate:

```powershell
py -3 -m tools.modpack sync --profile 'C:\Users\mason\curseforge\minecraft\Instances\Wilderness Odyssey (1)' --reports "$env:TEMP\wo-update"
```

4. Read `sync.md` and `sync.json` in that report folder. Apply the reviewed scan:

```powershell
py -3 -m tools.modpack sync --profile 'C:\Users\mason\curseforge\minecraft\Instances\Wilderness Odyssey (1)' --reports "$env:TEMP\wo-update" --apply --copy-new-configs
py -3 -m tools.modpack validate --reports "$env:TEMP\wo-validation"
py -3 -m tools.modpack validate --side server --reports "$env:TEMP\wo-server-validation"
```

Existing Git configs are preserved. Review reported differences and edit intended
values in the checkout yourself. New shaders/resource packs and archive assets
need deliberate review before adding them. After custom-file changes run:

```powershell
py -3 -m tools.modpack reindex
py -3 -m tools.modpack validate --reports "$env:TEMP\wo-validation"
```

Changed JAR hashes invalidate old side/source/essential reviews. Read the warnings,
review the author's supported environments, and update the matching entry in
`modpack/review.json` with the **new exact SHA-256** and an evidence URL, then rerun
`sync --apply`. Never copy an old hash review onto unknown bytes just to pass CI.
Dependency sides and filenames alone do not prove dedicated-server support.

Review the Git diff, stage only the intended manifest/config/tool changes, commit,
push the feature branch and review its PR. Do not use `git add --all` in a checkout
containing unrelated changes. Git never needs the JARs, full profile, or ZIP.
`packwiz update` is not the version authority; this workflow imports your chosen
installed versions and pins exact IDs and hashes.

## Updating NeoForge

Check the newest stable loader **for Minecraft 1.21.1** without changing anything:

```powershell
py -3 -m tools.modpack loader --latest --reports "$env:TEMP\wo-loader"
```

Review its version, FML dependency and publisher installer checksum, then pin it:

```powershell
py -3 -m tools.modpack loader --latest --reports "$env:TEMP\wo-loader" --apply
```

For an exact repeatable selection, use `--version 21.1.262` instead of `--latest`.
The command updates Git metadata and the QA installer lock. In CurseForge, choose
the **same loader version** separately before client testing. The command does
not change your installation. Subsequent imports preserve this explicit Git pin
and record the actual profile loader separately as `migration.profile_neoforge`.
CI uses the exact pin and never floats to a newer version on its own.

The validator models FML 4.0.45's verified Minecraft 1.21.1 compatibility matrix.
If a later FML changes those rules, review the new official matrix before widening
any checks. A passing static check does not establish runtime compatibility.
On Windows, loader metadata may use the native certificate verifier if Python's
certificate chain fails; verification remains enabled and redirects/config files
are disabled for that bounded official-metadata fallback.

## Try a copy and export

Use a **new/empty destination** for every reconstruction:

```powershell
py -3 -m tools.modpack install --destination "$env:TEMP\wo-updated-client" --local-mods 'C:\Users\mason\curseforge\minecraft\Instances\Wilderness Odyssey (1)\mods' --offline
```

This reconstructs client files but does not install a launcher or start Minecraft.
See the [operations guide](README.md#actual-server-qa-and-conditional-isolation)
for disposable server QA, Java 21 and explicit Minecraft EULA acceptance.
Only promote a performance baseline after a successful real run.

For your own manual API, a local CurseForge export is available with explicit
owner authorization:

```powershell
py -3 -m tools.modpack package --output "$env:TEMP\Wilderness-Odyssey-updated.zip" --local-mods 'C:\Users\mason\curseforge\minecraft\Instances\Wilderness Odyssey (1)\mods' --include-owned-api
```

This includes your exact pinned API in overrides and references the other mods by
CurseForge file ID. Test-import that ZIP into a new launcher profile before
publishing. Keep exports outside Git; a successful local build does not publish
anything. Hosted release packaging still needs a verified source for the exact
manual API, so never substitute an older public API just to bypass that check.
