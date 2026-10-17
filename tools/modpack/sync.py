"""Read-only CurseForge profile scanning, hash-bound review, and change reporting."""
from pathlib import Path
import re

from .common import PackError, digest, junction, no_links, read_json
from .metadata import inspect_jar


def _source(addons, path, sha256, issues):
    candidates = []
    for addon in addons:
        file = addon.get('installedFile') or {}
        filename = addon.get('fileNameOnDisk') or file.get('fileNameOnDisk') or file.get('fileName')
        if filename != path.name:
            continue
        proofs = []
        for item in file.get('hashes') or []:
            algorithm = {1: 'sha1', 2: 'md5', 'sha256': 'sha256'}.get(item.get('algo', item.get('type')))
            if algorithm:
                actual = sha256 if algorithm == 'sha256' else digest(path, algorithm)
                proofs.append(actual.lower() == str(item.get('value', '')).lower())
        if proofs and all(proofs) and addon.get('addonID') and file.get('id'):
            candidates.append({'kind': 'curseforge', 'project_id': int(addon['addonID']),
                'file_id': int(file['id']), 'verified': True,
                'allow_distribution': addon.get('allowModDistribution') is True,
                'required_projects': sorted(d.get('modId',d.get('addonId')) for d in file.get('dependencies') or []
                                            if d.get('relationType', d.get('type')) == 3 and d.get('modId',d.get('addonId')))})
        else:
            issues.append('CurseForge filename candidate lacks matching provider hashes; identity remains unresolved.')
    unique = {(s['project_id'], s['file_id']): s for s in candidates}
    if len(unique) == 1:
        return next(iter(unique.values()))
    if unique:
        issues.append('Ambiguous provider identities for identical bytes; review required.')
    return {'kind': 'manual', 'verified': False,
            'instructions': 'Obtain this exact file from its author or your own installation; provide it using --local-mods. Do not redistribute without permission.'}


def scan_profile(profile, reviews=None, previous=None):
    profile = no_links(profile).resolve()
    if profile.is_symlink() or junction(profile):
        raise PackError('Profile root must not be a symlink/junction.')
    metadata = profile / 'minecraftinstance.json'
    if metadata.is_symlink() or junction(metadata):
        raise PackError('Profile metadata must not be a symlink/junction.')
    metadata_sha=digest(metadata)
    data = read_json(metadata)
    loader = str((data.get('baseModLoader') or {}).get('name', ''))
    match = re.fullmatch(r'neoforge-(21\.1\.\d+(?:-[a-zA-Z0-9.]+)?)', loader)
    if not match or data.get('gameVersion') != '1.21.1':
        raise PackError('Profile must explicitly identify Minecraft 1.21.1 and a NeoForge 21.1.x loader; no legacy fallback is used.')
    folder = profile/'mods'
    if not folder.is_dir() or folder.is_symlink() or junction(folder):
        raise PackError('Profile mods directory must be a real directory.')
    def snapshot():
        return sorted((p.name,p.stat().st_size,p.stat().st_mtime_ns) for p in folder.iterdir())
    before_files=snapshot()
    result = {'schema': 1, 'name': 'Wilderness Odyssey', 'version': (previous or {}).get('version', '0.1.0'),
              'minecraft': '1.21.1', 'neoforge': match[1], 'java': 21,
              'migration': {'status': 'imported', 'source': 'local-curseforge-profile'},
              'mods': [], 'disabled_files': []}
    reviews = reviews or {}
    used_ids, filenames = set(), set()
    for path in sorted(folder.iterdir(), key=lambda p: p.name.casefold()):
        if path.is_symlink() or junction(path):
            raise PackError('Symlink/junction in mods directory; remove the link from a separate copy before importing.')
        if path.is_dir():
            continue
        if path.suffix.lower() != '.jar':
            result['disabled_files'].append(path.name)
            continue
        if path.name.casefold() in filenames:
            raise PackError('Case-insensitive duplicate mod filenames cannot be installed on Windows.')
        filenames.add(path.name.casefold())
        before = path.stat()
        sha = digest(path)
        info = inspect_jar(path)
        source = _source(data.get('installedAddons') or [], path, sha, info['issues'])
        after = path.stat()
        if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
            raise PackError('A mod changed during scanning; close the launcher and retry.')
        primary = next((m['id'] for m in info['provides'] if not m['embedded']), '')
        fallback = f'cf-{source["project_id"]}' if source['kind'] == 'curseforge' else path.stem.lower()
        key = re.sub(r'[^a-z0-9_-]', '-', primary.lower() or fallback).strip('-') or sha[:16]
        if key in used_ids:
            key += '-' + sha[:12]
        if key in used_ids:
            raise PackError('Identical duplicate mod bytes/IDs found; review the profile.')
        used_ids.add(key)
        item = {'id': key, 'filename': path.name, 'sha256': sha, 'size': before.st_size,
                **info, 'source': source, 'essential': False}
        # Preserve only deliberate decisions bound to the exact same bytes.
        review = reviews.get(key, {})
        if review.get('sha256') == sha:
            if review.get('side') in ('client', 'server', 'both'):
                item['side'] = review['side']
            item['essential'] = review.get('essential') is True
            if isinstance(review.get('source'), dict):
                replacement = review['source']
                if replacement.get('kind') in ('manual', 'url', 'modrinth'):
                    item['source'] = replacement
        if review and review.get('sha256') != sha:
            item['issues'].append('Review was for different bytes; review side/source/essential decisions again.')
        result['mods'].append(item)
    if not result['mods']:
        raise PackError('No enabled JARs found; refusing to replace the pack with an empty scan.')
    if digest(metadata) != metadata_sha or snapshot() != before_files:
        raise PackError('Launcher metadata or mod directory changed during scanning; close updates and retry.')
    return result


def changes(old, new):
    before = {m['id']: m for m in (old or {}).get('mods', [])}
    after = {m['id']: m for m in new['mods']}
    return {'added': sorted(after.keys() - before.keys()), 'removed': sorted(before.keys() - after.keys()),
            'updated': sorted(k for k in before.keys() & after.keys() if before[k] != after[k]),
            'unresolved': sorted(k for k, m in after.items() if not m['source'].get('verified') or m['side'] == 'unknown' or m['issues']),
            'loader_before': (old or {}).get('neoforge'), 'loader_after': new['neoforge']}


def config_changes(root, profile):
    changes = []
    for folder in ('config', 'defaultconfigs', 'kubejs', 'scripts', 'datapacks', 'resourcepacks', 'shaderpacks'):
        base = Path(profile)/folder
        if not base.is_dir() or base.is_symlink() or junction(base):
            continue
        for source in sorted(base.rglob('*')):
            if source.is_symlink() or junction(source):
                raise PackError('Linked custom content is not imported.')
            if source.is_file():
                relative = source.relative_to(profile).as_posix()
                target = Path(root)/relative
                state = 'new' if not target.exists() else ('different' if digest(source) != digest(target) else 'same')
                if state != 'same':
                    changes.append({'file': relative, 'status': state})
    return changes
