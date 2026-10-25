"""Read metadata, never import or execute code from installed JARs."""
import io
import json
from pathlib import Path
import re
import tomllib
import zipfile

from .common import PackError

MAX_METADATA = 4 * 1024 * 1024
MAX_NESTED = 64 * 1024 * 1024


def _read(jar, name, limit=MAX_METADATA):
    info = jar.getinfo(name)
    if info.file_size > limit:
        raise PackError(f'Oversized embedded metadata: {name}')
    return jar.read(info)


def inspect_jar(path):
    result = {'provides': [], 'requires': [], 'conflicts': [], 'loaders': [],
              'side': 'unknown', 'issues': []}
    inspected_bytes, nested_count = 0, 0

    def read(jar,name,limit=MAX_METADATA):
        nonlocal inspected_bytes
        remaining=128*1024*1024-inspected_bytes
        if remaining <= 0:
            raise PackError('Aggregate metadata inspection limit reached.')
        data=_read(jar,name,min(limit,remaining))
        inspected_bytes += len(data)
        return data

    def inspect(stream, depth=0):
        nonlocal nested_count
        if depth:
            nested_count += 1
            if nested_count > 128:
                raise PackError('Nested JAR inspection count limit reached.')
        if depth > 4:
            result['issues'].append('Nested JAR depth exceeds inspection limit; review dependencies.')
            return
        with zipfile.ZipFile(stream) as jar:
            names = set(jar.namelist())
            manifest = {}
            if 'META-INF/MANIFEST.MF' in names:
                text = read(jar, 'META-INF/MANIFEST.MF').decode('utf-8', errors='replace')
                manifest = dict(re.findall(r'^([\w-]+): (.*)$', text, re.M))
            toml = next((n for n in ('META-INF/neoforge.mods.toml', 'META-INF/mods.toml') if n in names), None)
            if toml:
                data = tomllib.loads(read(jar, toml).decode('utf-8'))
                loader = 'neoforge' if 'neoforge' in toml else 'forge'
                result['loaders'].append(loader)
                for mod in data.get('mods', []):
                    version = str(mod.get('version', 'unknown'))
                    if version == '${file.jarVersion}':
                        version = manifest.get('Implementation-Version', 'unknown').strip()
                    result['provides'].append({'id': str(mod['modId']), 'version': version, 'embedded': depth > 0})
                for owner, dependencies in data.get('dependencies', {}).items():
                    for dep in dependencies:
                        kind = dep.get('type', 'required' if loader == 'neoforge' or dep.get('mandatory') else 'optional')
                        item = {'id': str(dep['modId']), 'version': str(dep.get('versionRange', '*')),
                                'side': str(dep.get('side', 'BOTH')).lower(), 'owner': owner}
                        if kind == 'required':
                            result['requires'].append(item)
                        elif kind in ('incompatible', 'discouraged'):
                            result['conflicts'].append({**item, 'kind': kind})
            elif 'fabric.mod.json' in names:
                data = json.loads(read(jar, 'fabric.mod.json'))
                result['loaders'].append('fabric')
                result['provides'].append({'id': data['id'], 'version': str(data.get('version', 'unknown')), 'embedded': depth > 0})
                for provided in data.get('provides', []):
                    result['provides'].append({'id': provided, 'version': str(data.get('version', 'unknown')), 'embedded': depth > 0})
                if depth == 0:
                    result['side'] = {'*': 'both', 'client': 'client', 'server': 'server'}.get(data.get('environment', '*'), 'unknown')
                for mod_id, constraint in data.get('depends', {}).items():
                    result['requires'].append({'id': mod_id, 'version': constraint, 'side': 'both', 'owner': data['id']})
                for mod_id, constraint in data.get('breaks', {}).items():
                    result['conflicts'].append({'id': mod_id, 'version': constraint, 'side': 'both', 'kind': 'incompatible'})
                for nested in data.get('jars', []):
                    inspect(io.BytesIO(read(jar, nested['file'], MAX_NESTED)), depth + 1)
            if 'META-INF/jarjar/metadata.json' in names:
                nested = json.loads(read(jar, 'META-INF/jarjar/metadata.json'))
                for child in nested.get('jars', []):
                    inspect(io.BytesIO(read(jar, child['path'], MAX_NESTED)), depth + 1)

    try:
        inspect(Path(path))
    except (OSError, ValueError, KeyError, zipfile.BadZipFile, RecursionError) as exc:
        result['issues'].append(f'JAR metadata inspection incomplete ({type(exc).__name__}); manual review required.')
    # Shared libraries without a mod descriptor can be legitimate; never invent IDs.
    if not result['provides']:
        result['issues'].append('No recognized mod metadata; review the file manually.')
    result['loaders'] = sorted(set(result['loaders']))
    return result
