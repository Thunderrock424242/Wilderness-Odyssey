"""Deterministic packwiz projection and conservative static validation."""
import hashlib
import json
from pathlib import Path
import re
import tomllib

from .common import PackError, digest, safe_path, tracked_files, write_text

ASSET_ROOTS = {'config', 'defaultconfigs', 'kubejs', 'scripts', 'datapacks', 'resourcepacks', 'shaderpacks'}
PRIVATE_NAMES = re.compile(r'(^|/)(\.env(?:\..*)?|.*\.(?:log|bak|local|key|pem)|.*_log\.txt|servers\.dat|options\.txt|resourceful-config-web\.json|.*(?:account|credential|session|authme).*)$', re.I)
SECRET = re.compile(r'''(?im)(?:^|[{,])\s*["']?(password|token|secret|discord[_-]?token|access[_-]?token|refresh[_-]?token|api[_-]?key|client[_-]?secret|authorization)["']?\s*[:=]\s*["']?([^\s"',}#]+)''')


def asset_bytes(path):
    data = Path(path).read_bytes()
    # Mirrors the text assets' .gitattributes policy without rewriting the source.
    if Path(path).suffix.lower() not in ('.zip','.png','.ogg','.nbt','.jpg','.jpeg','.woff','.ttf') and b'\x00' not in data:
        data = data.replace(b'\r\n',b'\n')
    return data


def asset_paths(root, paths=None):
    if paths is None:
        paths = tracked_files(root)
        previous = Path(root)/'modpack/assets.json'
        if previous.exists():
            from .common import read_json
            paths += [p for p in read_json(previous) if safe_path(root,p).is_file()]
    return [p for p in sorted(set(paths))
            if p.split('/')[0] in ASSET_ROOTS and not PRIVATE_NAMES.search(p)]


def _q(value):
    return json.dumps(value, ensure_ascii=False)


def included(mod, side):
    # A current client-profile import is a client installation candidate. Unknown
    # server eligibility never silently promotes a mod to universal distribution.
    return mod.get('side') in (side,'both') or (side == 'client' and mod.get('side') == 'unknown')


def mod_toml(mod):
    source = mod['source']
    if source['kind'] == 'manual':
        return None
    scope = 'client' if mod['side'] == 'unknown' else mod['side']
    result = '# Generated: server eligibility is unreviewed when inventory side=unknown.\n'
    result += f'name = {_q(mod["id"])}\nfilename = {_q(mod["filename"])}\nside = {_q(scope)}\npin = true\n\n[download]\nhash-format = "sha256"\nhash = {_q(mod["sha256"])}\n'
    if source['kind'] == 'curseforge' and source.get('verified'):
        result += f'mode = "metadata:curseforge"\n\n[update.curseforge]\nproject-id = {int(source["project_id"])}\nfile-id = {int(source["file_id"])}\n'
    elif source['kind'] in ('url', 'modrinth') and source.get('url'):
        result += f'url = {_q(source["url"])}\n'
        if source['kind'] == 'modrinth':
            result += f'\n[update.modrinth]\nmod-id = {_q(source["project_id"])}\nversion = {_q(source["version_id"])}\n'
    else:
        return None
    return result


def projection(root, lock, assets):
    files, index = {}, 'hash-format = "sha256"\n'
    indexed = []
    for path in asset_paths(root, assets):
        full = safe_path(root, path)
        if not full.is_file():
            raise PackError(f'Missing custom content: {path}')
        indexed.append((path, hashlib.sha256(asset_bytes(full)).hexdigest(), False))
    for mod in lock['mods']:
        if not re.fullmatch(r'[a-z0-9_-]+', mod['id']):
            raise PackError('Mod inventory IDs must use lowercase letters, digits, hyphens or underscores.')
        safe_path(root, 'mods/' + mod['filename'])
        content = mod_toml(mod)
        if content:
            path = f'mods/{mod["id"]}.pw.toml'
            files[path] = content
            indexed.append((path, hashlib.sha256(content.encode()).hexdigest(), True))
    for path, sha, metafile in sorted(indexed):
        index += f'\n[[files]]\nfile = {_q(path)}\nhash = {_q(sha)}\n'
        if metafile:
            index += 'metafile = true\n'
    files['index.toml'] = index
    omitted=[m['id'] for m in lock['mods'] if mod_toml(m) is None]
    pack = '# Generated pinned client projection. Use tools.modpack for guarded reconstruction.\n'
    if omitted:
        pack += '# INCOMPLETE standalone packwiz installation: manual files are not in the packwiz index.\n'
        pack += '# Required manual files: '+', '.join(omitted)+'\n'
    pack += f'name = {_q(lock["name"])}\nauthor = "Thunderrock424242"\nversion = {_q(lock["version"])}\npack-format = "packwiz:1.1.0"\n\n[index]\nfile = "index.toml"\nhash-format = "sha256"\nhash = {_q(hashlib.sha256(index.encode()).hexdigest())}\n\n[versions]\nminecraft = {_q(lock["minecraft"])}\n'
    if lock.get('neoforge'):
        pack += f'neoforge = {_q(lock["neoforge"])}\n'
    files['pack.toml'] = pack
    return files


def generate(root, lock, assets=None):
    root = Path(root)
    assets = asset_paths(root, assets)
    files = projection(root, lock, assets)
    # Only files produced by this tool are owned here. Never touch mods/list/assets.
    previous = root/'modpack/generated-files.json'
    if previous.exists():
        from .common import read_json
        for name in read_json(previous):
            if name not in files and re.fullmatch(r'mods/[a-z0-9_-]+\.pw\.toml', name):
                path = safe_path(root, name)
                if path.exists():
                    path.unlink()
    for name, content in files.items():
        full = safe_path(root, name)
        full.parent.mkdir(parents=True, exist_ok=True)
        write_text(full,content)
    from .common import write_json
    write_json(previous, sorted(files))
    write_json(root/'modpack/assets.json', assets)


def version_satisfies(version, constraint):
    """Return True/False only for understood numeric Maven bounds; None is unknown."""
    if constraint in ('*', '', None):
        return True
    if not isinstance(constraint, str) or not re.fullmatch(r'\d+(?:\.\d+)*', str(version)):
        return None
    def numeric(value):
        return tuple(int(p) for p in value.split('.'))
    def cmp(a, b):
        a, b = numeric(a), numeric(b)
        n = max(len(a), len(b))
        return (a+(0,)*(n-len(a)) > b+(0,)*(n-len(b))) - (a+(0,)*(n-len(a)) < b+(0,)*(n-len(b)))
    exact = re.fullmatch(r'\[(\d+(?:\.\d+)*)\]', constraint)
    if exact:
        return cmp(str(version), exact[1]) == 0
    bound = re.fullmatch(r'([\[(])(\d+(?:\.\d+)*)?,(\d+(?:\.\d+)*)?([\])])', constraint)
    if not bound:
        return None
    left, lo, hi, right = bound.groups()
    return (not lo or cmp(str(version), lo) >= (0 if left == '[' else 1)) and (not hi or cmp(str(version), hi) <= (0 if right == ']' else -1))


def dependency_satisfies(lock, mod_id, version, constraint):
    """Mirror the verified FML matrix, without widening unrelated constraints.

    FML 4.0.45 VersionSupportMatrix accepts Minecraft 1.21 and NeoForge
    21.0.166 aliases on Minecraft 1.21.1. Verified source:
    https://github.com/neoforged/FancyModLoader/blob/44982c69cddbb01b27318dfcac0b3c707b3e94a9/loader/src/main/java/net/neoforged/fml/loading/VersionSupportMatrix.java
    The two legacy pins below have this exact FML dependency in their POMs.
    Unknown/new FML versions require review instead of inheriting this matrix.
    """
    match = version_satisfies(version, constraint)
    fml = lock.get('fml', {'21.1.256':'4.0.45', '21.1.262':'4.0.45'}.get(lock.get('neoforge')))
    if match is True or lock.get('minecraft') != '1.21.1' or fml != '4.0.45':
        return match
    aliases = {'minecraft':'1.21', 'neoforge':'21.0.166'}
    if mod_id in aliases and version == lock.get(mod_id):
        alias_match = version_satisfies(aliases[mod_id], constraint)
        if alias_match is True:
            return True
    return match


def _schema_errors(lock):
    if not isinstance(lock,dict) or lock.get('schema') != 1 or not isinstance(lock.get('mods'),list):
        return ['Unsupported inventory schema; expected an object with schema=1 and mods array.']
    if any(not isinstance(lock.get(k),str) for k in ('name','version','minecraft')) or not isinstance(lock.get('migration'),dict):
        return ['Inventory name/version/Minecraft/migration fields are missing or malformed.']
    for index,mod in enumerate(lock['mods']):
        prefix=f'Inventory mods[{index}]'
        if not isinstance(mod,dict) or any(not isinstance(mod.get(k),str) for k in ('id','filename','sha256','side')):
            return [prefix+': id/filename/sha256/side must be strings.']
        if not isinstance(mod.get('source'),dict) or not isinstance(mod['source'].get('kind'),str):
            return [prefix+': source must identify a download kind.']
        if type(mod.get('size')) is not int or not isinstance(mod.get('essential',False),bool):
            return [prefix+': size/essential fields are malformed.']
        for key in ('provides','requires','conflicts'):
            values=mod.get(key,[])
            if not isinstance(values,list) or any(not isinstance(v,dict) or not isinstance(v.get('id'),str) for v in values):
                return [prefix+f': {key} must be an array of mod ID records.']
            if key == 'provides' and any(not isinstance(v.get('version'),str) for v in values):
                return [prefix+': provided versions must be strings.']
        if not isinstance(mod.get('issues',[]),list) or any(not isinstance(s,str) for s in mod.get('issues',[])):
            return [prefix+': inspection issues must be an array of strings.']
        projects=mod['source'].get('required_projects',[])
        if not isinstance(projects,list) or any(type(p) is not int for p in projects):
            return [prefix+': required provider projects must be an integer array.']
    return []


def validate(root, lock, side='client', require_downloads=False):
    errors, warnings = [], []
    root = Path(root)
    schema_errors=_schema_errors(lock)
    if schema_errors:
        return {'errors':schema_errors, 'warnings':[], 'ready':False,'packwiz_complete':False}
    pending = lock.get('migration', {}).get('status') != 'imported'
    if pending:
        errors.append('Initial local profile migration is pending; no current installed pack has been imported.')
    if lock.get('minecraft') != '1.21.1' or lock.get('java') != 21:
        errors.append('This harness supports Minecraft 1.21.1 with Java 21 only.')
    if not re.fullmatch(r'21\.1\.\d+(?:-[a-zA-Z0-9.]+)?', str(lock.get('neoforge'))):
        errors.append('NeoForge must be verified from the current profile before installation.')
    if not lock['mods'] and not pending:
        errors.append('An imported pack must contain mods.')
    keys, filenames, providers, projects = set(), set(), {}, set()
    for m in lock['mods']:
        try:
            if m['id'] in keys:
                errors.append(f'Duplicate inventory ID: {m["id"]}')
            keys.add(m['id'])
            filename = m['filename']
            safe_path(root, 'mods/' + filename)
            if '/' in filename or not filename.lower().endswith('.jar'):
                raise PackError('Mod filenames must be plain JAR filenames.')
            if filename.casefold() in filenames:
                errors.append(f'Duplicate mod filename: {filename}')
            filenames.add(filename.casefold())
            if not re.fullmatch(r'[0-9a-f]{64}', m['sha256']) or not isinstance(m['size'], int) or m['size'] <= 0:
                errors.append(f'Invalid SHA-256/size for {m["id"]}')
            if m['side'] == 'unknown':
                (warnings if side == 'client' else errors).append(f'{m["id"]}: server eligibility is unknown; client projection only until a hash-bound review.')
            elif m['side'] not in ('client','server','both'):
                errors.append(f'{m["id"]}: invalid distribution side.')
            for issue in m.get('issues', []):
                warnings.append(f'{m["id"]}: {issue}')
            if not m.get('provides'):
                warnings.append(f'{m["id"]}: dependencies cannot be verified without recognized mod metadata.')
            source = m['source']
            if source['kind'] == 'curseforge':
                if not source.get('verified') or not all(type(source.get(k)) is int and source[k] > 0 for k in ('project_id','file_id')):
                    errors.append(f'{m["id"]}: CurseForge project/file identity is unverified.')
                projects.add(source.get('project_id'))
            elif source['kind'] == 'manual':
                (errors if require_downloads else warnings).append(f'{m["id"]}: manual download; use --local-mods with exact SHA-256 bytes.')
            elif source['kind'] in ('url','modrinth'):
                from .providers import validate_url
                validate_url(source.get('url',''))
                if source.get('permission') != 'author-approved':
                    errors.append(f'{m["id"]}: direct download requires a recorded author-approved source.')
                if source['kind'] == 'modrinth' and not all(source.get(k) for k in ('project_id','version_id')):
                    errors.append(f'{m["id"]}: missing pinned Modrinth IDs.')
            else:
                errors.append(f'{m["id"]}: unsupported source kind.')
            for provided in m.get('provides', []):
                providers.setdefault(provided['id'], []).append((m, provided))
        except (KeyError, TypeError, PackError) as exc:
            errors.append(f'Invalid mod record: {str(exc)}')
    builtin = {'minecraft':lock.get('minecraft'), 'neoforge':lock.get('neoforge'), 'java':'21', 'fabricloader': None}
    for mid, records in providers.items():
        active = [r for r in records if included(r[0],side)]
        top = [r for r in active if not r[1].get('embedded')]
        if len(top) > 1:
            errors.append(f'Duplicate mod ID: {mid}')
        elif len(active) > 1:
            warnings.append(f'Embedded library {mid} has multiple providers; loader selection requires runtime testing.')
    for m in lock['mods']:
        if not included(m,side):
            continue
        for dep in m.get('requires', []):
            if dep.get('side','both') not in (side,'both'):
                continue
            available = [(owner,p) for owner,p in providers.get(dep['id'],[]) if included(owner,side)]
            versions = [p['version'] for _,p in available] if available else ([builtin[dep['id']]] if builtin.get(dep['id']) is not None else [])
            if dep['id'] in ('fabricloader','fabric'):
                warnings.append(f'{m["id"]}: Fabric/connector dependency requires runtime verification.')
                continue
            if not versions:
                errors.append(f'{m["id"]}: missing {side} dependency {dep["id"]}')
            else:
                matches = [dependency_satisfies(lock,dep['id'],v,dep.get('version','*')) for v in versions]
                if all(match is False for match in matches):
                    errors.append(f'{m["id"]}: {dep["id"]} {", ".join(versions)} does not satisfy {dep["version"]}')
                elif len(versions) > 1 and any(match is not True for match in matches):
                    warnings.append(f'{m["id"]}: ambiguous {dep["id"]} provider version selection requires runtime verification.')
                elif any(match is None for match in matches):
                    warnings.append(f'{m["id"]}: cannot statically evaluate {dep["id"]} constraint {dep.get("version")!s}')
        for conflict in m.get('conflicts', []):
            if conflict.get('side','both') not in (side,'both'):
                continue
            matches = [(owner,p) for owner,p in providers.get(conflict['id'],[]) if included(owner,side)]
            if matches:
                match = version_satisfies(matches[0][1]['version'], conflict.get('version','*'))
                if match is True and conflict.get('kind') == 'incompatible':
                    errors.append(f'{m["id"]}: declared incompatible dependency {conflict["id"]}')
                elif match is not False:
                    warnings.append(f'{m["id"]}: potential declared conflict with {conflict["id"]}')
        for project in m.get('source', {}).get('required_projects', []):
            if project not in projects:
                warnings.append(f'{m["id"]}: required CurseForge project {project} not identified in inventory.')
    try:
        from .common import read_json
        assets = read_json(root/'modpack/assets.json')
        expected = projection(root, lock, assets)
        for name, content in expected.items():
            if safe_path(root,name).read_bytes() != content.encode():
                errors.append(f'Generated manifest/hash drift: {name}; run reindex after reviewing changes.')
        for name in assets:
            path = safe_path(root,name)
            if path.suffix in ('.toml','.json'):
                try:
                    text = path.read_text(encoding='utf-8-sig')
                    (tomllib.loads if path.suffix == '.toml' else json.loads)(text)
                except (ValueError, UnicodeError):
                    if path.suffix == '.json':
                        warnings.append(f'Not strict JSON: {name}; mod-specific relaxed parser/schema validation is required.')
                    else:
                        errors.append(f'Invalid {path.suffix} configuration syntax: {name}')
            if path.stat().st_size <= 4*1024*1024 and path.suffix not in ('.zip','.png','.ogg','.jpg'):
                for match in SECRET.finditer(path.read_text(encoding='utf-8', errors='replace')):
                    if match[2].lower() not in ('null','none','false','changeme','example','your_key_here'):
                        errors.append(f'Potential nonempty credential field {match[1]} in {name}; value withheld.')
        warnings.append('JSON5/JSONC/HOCON/YAML/SNBT and mod-specific schemas are not validated; runtime compatibility remains unproven.')
    except (OSError, PackError, ValueError, KeyError, TypeError) as exc:
        errors.append(f'Manifest integrity check failed: {type(exc).__name__}: {exc}')
    return {'errors':sorted(set(errors)), 'warnings':sorted(set(warnings)), 'ready':not errors,
            'packwiz_complete':all(mod_toml(m) is not None for m in lock['mods']),
            'migration_pending':pending, 'mod_files':len(lock['mods']),
            'coverage':'Static metadata/hash/config checks only; actual Minecraft/client compatibility not established.'}
