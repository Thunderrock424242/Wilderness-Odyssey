"""Deterministic CurseForge ZIPs and an explicit owner-supplied API override."""
import hashlib
import json
from pathlib import Path
import zipfile

from .common import PackError, digest, disjoint_profile, outside_repo, read_json, safe_path, write_text
from .pack import asset_bytes, included, validate


def package(root, lock, output, side='client', local_mods=None, include_owned_api=False):
    root = Path(root)
    output = outside_repo(root, output)
    if output.exists():
        raise PackError('Release output already exists; choose a new filename.')
    disjoint_profile(local_mods,output,output.with_suffix(output.suffix+'.sha256'))
    overrides = {}
    for mod in lock['mods']:
        if included(mod,side) and (mod['source']['kind'] != 'curseforge' or not mod['source'].get('verified')):
            if (mod['id'] != 'wildernessodysseyapi' or mod['source']['kind'] != 'manual'
                    or not any(p['id']=='wildernessodysseyapi' and not p.get('embedded') for p in mod.get('provides',[]))
                    or not include_owned_api or local_mods is None):
                raise PackError(f'{mod["id"]}: CurseForge export requires verified project/file IDs. For your own manual Wilderness Odyssey API only, provide --local-mods and explicit --include-owned-api authorization.')
            candidate = safe_path(local_mods,mod['filename'])
            data = candidate.read_bytes()
            if len(data) != mod['size'] or hashlib.sha256(data).hexdigest() != mod['sha256']:
                raise PackError('Owned API SHA-256/size does not match the pin; export was not created.')
            overrides['overrides/mods/'+mod['filename']] = data
    validation = validate(root,lock,side)
    if validation['errors']:
        raise PackError('Release blocked:\n'+'\n'.join(validation['errors']))
    manifest = {'minecraft':{'version':lock['minecraft'],'modLoaders':[{'id':'neoforge-'+lock['neoforge'],'primary':True}]},
        'manifestType':'minecraftModpack','manifestVersion':1,'name':lock['name'], 'version':lock['version'],
        'author':'Thunderrock424242','overrides':'overrides',
        'files':sorted([{'projectID':m['source']['project_id'],'fileID':m['source']['file_id'],'required':True}
            for m in lock['mods'] if included(m,side) and m['source']['kind']=='curseforge'],key=lambda f:(f['projectID'],f['fileID']))}
    entries = {'manifest.json':(json.dumps(manifest,indent=2,sort_keys=True)+'\n').encode()}
    entries.update(overrides)
    for name in read_json(root/'modpack/assets.json'):
        if name.lower().endswith('.jar'):
            raise PackError('A JAR may not be included in release overrides.')
        entries['overrides/'+name] = asset_bytes(safe_path(root,name))
    entries['overrides/modpack-lock.json'] = (json.dumps(lock,indent=2,sort_keys=True)+'\n').encode()
    checksums = ''.join(f'{hashlib.sha256(data).hexdigest()}  {name}\n' for name,data in sorted(entries.items()))
    entries['SHA256SUMS.txt'] = checksums.encode()
    output.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(output,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
        for name,data in sorted(entries.items()):
            info = zipfile.ZipInfo(name,date_time=(1980,1,1,0,0,0))
            info.create_system = 3
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info,data,compresslevel=9)
    sha = digest(output)
    write_text(output.with_suffix(output.suffix+'.sha256'),f'{sha}  {output.name}\n')
    return {'status':'packaged','sha256':sha,'file':str(output),'owned_api_bundled':bool(overrides),
            'publishing':'No publication performed; review this artifact before publishing.'}
