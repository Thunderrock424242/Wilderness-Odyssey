"""Small shared safety primitives. Never include secret values in diagnostics."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import tempfile


class PackError(ValueError):
    pass


def digest(path, algorithm='sha256'):
    result = hashlib.new(algorithm)
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(block)
    return result.hexdigest()


def safe_path(root, relative):
    if not isinstance(relative, str) or not relative or '\\' in relative:
        raise PackError(f'Unsafe relative path: {relative!r}')
    parts = relative.split('/')
    devices = re.compile(r'^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)', re.I)
    if PurePosixPath(relative).is_absolute() or re.match(r'^[a-zA-Z]:', relative) or any(
        p in ('', '.', '..') or p.endswith((' ', '.')) or devices.match(p)
        or re.search(r'[<>:"|?*\x00-\x1f]', p) for p in parts
    ):
        raise PackError(f'Unsafe relative path: {relative!r}')
    root = Path(root).resolve()
    current = root
    for part in parts:
        current /= part
        if current.is_symlink() or junction(current):
            raise PackError(f'Symlink/junction is not allowed: {relative}')
    if not current.resolve().is_relative_to(root):
        raise PackError(f'Path escapes root: {relative}')
    return current


def read_json(path):
    try:
        return json.loads(Path(path).read_text(encoding='utf-8-sig'))
    except (OSError, ValueError) as exc:
        raise PackError(f'Cannot read JSON {Path(path).name}: {type(exc).__name__}') from exc


def write_json(path, value):
    data = json.dumps(value, indent=2, ensure_ascii=False, sort_keys=True) + '\n'
    write_text(path,data)


def write_text(path, data):
    """Atomic replacement never writes through an existing hardlink or alias."""
    path = no_links(path)
    path.parent.mkdir(parents=True,exist_ok=True)
    fd,name = tempfile.mkstemp(prefix='.wo-write-',dir=path.parent)
    temporary = Path(name)
    try:
        with os.fdopen(fd,'w',encoding='utf-8',newline='\n') as stream:
            stream.write(data)
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def tracked_files(root):
    result = subprocess.run(['git', '-C', str(root), 'ls-files', '-z'],
                            capture_output=True, check=True)
    return sorted(p.decode('utf-8') for p in result.stdout.split(b'\0') if p)


def outside_repo(root, target):
    no_links(target)
    root, target = Path(root).resolve(), Path(target).resolve()
    if target.is_relative_to(root) or root.is_relative_to(target):
        raise PackError('Use a new destination outside the repository and its parent directories.')
    return target


def no_links(path):
    absolute = Path(os.path.abspath(path))
    for component in (absolute,*absolute.parents):
        if component.is_symlink() or junction(component):
            raise PackError('Symlink/junction path aliases are not allowed for source or output directories.')
    return absolute


def disjoint_profile(local_mods, *targets):
    if not local_mods:
        return
    source = no_links(local_mods).resolve()
    profile = source.parent if source.name.lower() == 'mods' and (source.parent/'minecraftinstance.json').is_file() else source
    for target in targets:
        target = Path(target).resolve()
        if target.is_relative_to(profile) or profile.is_relative_to(target):
            raise PackError('Live profile/source and destination, cache, or report directories must be disjoint.')


def empty_destination(root, target):
    target = outside_repo(root, target)
    if target.exists() and (not target.is_dir() or any(target.iterdir())):
        raise PackError('Destination must be a new or empty disposable directory.')
    if target.is_symlink() or junction(target):
        raise PackError('Destination cannot be a symlink/junction.')
    return target


def junction(path):
    # lstat reparse attributes are available on Python 3.11 Windows too.
    try:
        attributes = getattr(Path(path).lstat(),'st_file_attributes',0)
    except FileNotFoundError:
        return False
    return bool(attributes & 0x400)  # FILE_ATTRIBUTE_REPARSE_POINT
