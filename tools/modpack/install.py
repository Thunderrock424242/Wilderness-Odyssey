"""Reconstruct pinned bytes into a new disposable directory only."""
import os
from pathlib import Path
import shutil
import tempfile

from .common import PackError, digest, disjoint_profile, empty_destination, outside_repo, safe_path
from .pack import asset_bytes, included, validate
from .providers import download_url, fetch


def install(root, lock, destination, side='client', local_mods=None, cache=None, offline=False, selected=None):
    root = Path(root).resolve()
    destination = empty_destination(root, destination)
    cache = outside_repo(root, cache or Path(tempfile.gettempdir())/'wilderness-odyssey-cache')
    disjoint_profile(local_mods,destination,cache)
    if local_mods:
        local_mods = Path(local_mods).resolve()
        if destination.is_relative_to(local_mods) or local_mods.is_relative_to(destination):
            raise PackError('Source mod directory and installation destination must be disjoint.')
    if side not in ('client','server'):
        raise PackError('Install side must be client or server.')
    result = validate(root, lock, side=side)
    if result['errors']:
        raise PackError('Pack validation blocked installation:\n' + '\n'.join(result['errors']))
    mods = [m for m in lock['mods'] if included(m,side) and (selected is None or m['id'] in selected)]
    cache.mkdir(parents=True, exist_ok=True)
    sources = []
    # Resolve all bytes before writing any installation. Rehash cache hits every time.
    for mod in mods:
        candidate = safe_path(cache, mod['sha256'] + '.jar')
        if candidate.exists() and digest(candidate) != mod['sha256']:
            raise PackError(f'Corrupted cache entry for {mod["id"]}; remove that cache file and retry.')
        if not candidate.exists():
            local = safe_path(local_mods, mod['filename']) if local_mods else None
            if local and local.is_file():
                if digest(local) != mod['sha256']:
                    raise PackError(f'SHA-256 mismatch for {mod["filename"]}; this is not the pinned version.')
                # Keep live-profile files read-only even for manual sources.
                sources.append((mod,local))
                continue
            if offline:
                raise PackError(f'{mod["id"]}: pinned file unavailable offline; obtain the exact version and supply --local-mods.')
            url = download_url(mod)
            fd, tempname = tempfile.mkstemp(prefix='download-',dir=cache)
            os.close(fd)
            temporary = Path(tempname)
            try:
                fetch(url,temporary,max_bytes=min(mod['size']+1024,1024*1024*1024))
                if digest(temporary) != mod['sha256']:
                    raise PackError(f'SHA-256 mismatch downloading {mod["id"]}; file rejected.')
                temporary.replace(candidate)
            finally:
                temporary.unlink(missing_ok=True)
        sources.append((mod,candidate))
    destination.parent.mkdir(parents=True, exist_ok=True)
    # A failed staging copy leaves the requested destination empty/absent.
    with tempfile.TemporaryDirectory(prefix='wo-install-',dir=destination.parent) as temporary:
        stage = Path(temporary)
        for mod, source in sources:
            target = safe_path(stage,'mods/'+mod['filename'])
            target.parent.mkdir(parents=True,exist_ok=True)
            shutil.copyfile(source,target)
            if digest(target) != mod['sha256']:
                raise PackError(f'Source changed during installation: {mod["id"]}')
        from .common import read_json
        for name in read_json(root/'modpack/assets.json'):
            source, target = safe_path(root,name), safe_path(stage,name)
            target.parent.mkdir(parents=True,exist_ok=True)
            target.write_bytes(asset_bytes(source))
        # No process is launched here, and no existing destination is modified.
        if destination.exists():
            if any(destination.iterdir()):
                raise PackError('Destination changed during installation; refusing to replace it.')
            destination.rmdir()
        stage.rename(destination)
    return {'destination':str(destination), 'side':side,'mod_files':len(mods), 'status':'installed',
            'coverage':'Pinned files reconstructed; Minecraft has not been launched.'}
