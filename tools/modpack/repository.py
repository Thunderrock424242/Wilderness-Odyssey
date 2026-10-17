"""Reject tracked installation state, large artifacts, and nested mod binaries."""
from pathlib import Path
import re
import zipfile

from .common import tracked_files, safe_path
from .pack import SECRET


def audit_repository(root):
    errors, warnings = [], []
    private = re.compile(r'(^|/)(\.env(?:\..*)?|minecraftinstance\.json|launcher_accounts\.json|servers\.dat|.*\.(?:key|pem|hprof|jfr))$|(^|/)(saves|logs|crash-reports|playerdata|node_modules)(/|$)',re.I)
    for name in tracked_files(root):
        path = safe_path(root,name)
        if name.endswith('.env.example'):
            continue
        if private.search(name):
            errors.append(f'Private/local state is tracked: {name}')
        if path.suffix.lower() == '.jar':
            errors.append(f'Mod JAR is tracked: {name}')
        if path.stat().st_size > 95*1024*1024:
            errors.append(f'Tracked file exceeds the 95 MiB guard: {name}')
        if path.suffix.lower() in ('.zip','.mrpack'):
            if name.split('/')[0] not in ('resourcepacks','shaderpacks'):
                errors.append(f'Full pack/archive must stay outside Git: {name}')
            try:
                with zipfile.ZipFile(path) as archive:
                    if any(i.filename.lower().endswith('.jar') for i in archive.infolist()):
                        errors.append(f'Archive contains JAR binaries: {name}')
            except zipfile.BadZipFile:
                errors.append(f'Invalid tracked ZIP: {name}')
        if name.startswith(('config/','defaultconfigs/','kubejs/','scripts/')) and path.stat().st_size < 4*1024*1024:
            text = path.read_text(encoding='utf-8',errors='replace')
            for field in SECRET.finditer(text):
                if field[2].lower() not in ('none','null','false','changeme','example'):
                    errors.append(f'Potential nonempty credential field {field[1]} in {name}; value withheld.')
    return {'errors':sorted(set(errors)),'warnings':warnings,'scope':'Tracked working-tree files; not a complete historical secret scan.'}
