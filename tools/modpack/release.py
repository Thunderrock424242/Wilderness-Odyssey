"""Deterministic CurseForge ZIPs: references only, no redistributed mod JARs."""
import hashlib
import json
from pathlib import Path
import zipfile

from .common import PackError, digest, outside_repo, read_json, safe_path, write_text
from .pack import asset_bytes, included, validate


def package(root, lock, output, side='client'):
    root = Path(root)
    output = outside_repo(root, output)
    if output.exists():
        raise PackError('Release output already exists; choose a new filename.')
    for mod in lock['mods']:
        if included(mod,side) and (mod['source']['kind'] != 'curseforge' or not mod['source'].get('verified')):
            raise PackError(f'{mod["id"]}: CurseForge export requires verified project/file IDs. Non-CurseForge redistribution requires separate author approval and is not implemented.')
    validation = validate(root,lock,side)
    if validation['errors']:
        raise PackError('Release blocked:\n'+'\n'.join(validation['errors']))
    manifest = {'minecraft':{'version':lock['minecraft'],'modLoaders':[{'id':'neoforge-'+lock['neoforge'],'primary':True}]},
        'manifestType':'minecraftModpack','manifestVersion':1,'name':lock['name'], 'version':lock['version'],
        'author':'Thunderrock424242','overrides':'overrides',
        'files':sorted([{'projectID':m['source']['project_id'],'fileID':m['source']['file_id'],'required':True}
            for m in lock['mods'] if included(m,side)],key=lambda f:(f['projectID'],f['fileID']))}
    entries = {'manifest.json':(json.dumps(manifest,indent=2,sort_keys=True)+'\n').encode()}
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
    return {'status':'packaged','sha256':sha,'file':str(output),'publishing':'Manual approval required; no publication performed.'}
