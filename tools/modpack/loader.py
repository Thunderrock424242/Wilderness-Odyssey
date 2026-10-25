"""Explicit, reviewable NeoForge 1.21.1 pins from the official Maven repository."""
from copy import deepcopy
import os
from pathlib import Path
import re
import ssl
import subprocess
import sys
import urllib.error
import xml.etree.ElementTree as ET

from .common import PackError, read_json, safe_path, write_json
from .pack import generate
from .providers import fetch

MAVEN = 'https://maven.neoforged.net/releases/net/neoforged/neoforge'
METADATA = MAVEN + '/maven-metadata.xml'


def official_metadata(url, max_bytes):
    try:
        return fetch(url,max_bytes=max_bytes)
    except PackError as error:
        cause = error.__cause__
        if (sys.platform != 'win32' or not isinstance(cause,urllib.error.URLError)
                or not isinstance(cause.reason,ssl.SSLCertVerificationError)):
            raise
        # Windows' native certificate chain builder can resolve chains that
        # Python/OpenSSL rejects. Keep certificate verification enabled, forbid
        # redirects, and limit this fallback to small official loader metadata.
        if not url.startswith(MAVEN+'/') or max_bytes > 4*1024*1024:
            raise
        curl = Path(os.environ.get('SystemRoot',r'C:\Windows'))/'System32/curl.exe'
        if not curl.is_file():
            raise
        result = subprocess.run([str(curl),'--disable','--fail','--silent','--show-error','--proto','=https',
            '--max-time','30','--max-filesize',str(max_bytes),url],capture_output=True,timeout=35)
        if result.returncode or len(result.stdout) > max_bytes:
            raise PackError('Official metadata TLS verification/download failed with both Python and Windows.') from error
        return result.stdout


def latest_stable(data):
    versions = [v.text for v in ET.fromstring(data).findall('./versioning/versions/version')
                if v.text and re.fullmatch(r'21\.1\.\d+',v.text)]
    if not versions:
        raise PackError('Official metadata contains no stable NeoForge build for Minecraft 1.21.1.')
    return max(versions,key=lambda v:int(v.rsplit('.',1)[1]))


def check_loader(root, lock, *, latest=False, version=None, apply=False):
    if lock.get('minecraft') != '1.21.1' or bool(latest) == bool(version):
        raise PackError('Select --latest or --version for Minecraft 1.21.1.')
    try:
        selected = latest_stable(official_metadata(METADATA,max_bytes=4*1024*1024)) if latest else version
        if not re.fullmatch(r'21\.1\.\d+',selected):
            raise PackError('Only stable NeoForge 21.1.x pins for Minecraft 1.21.1 are supported.')
        base = MAVEN + '/' + selected + '/neoforge-' + selected
        sha = official_metadata(base+'-installer.jar.sha256',max_bytes=256).decode('ascii').strip().lower()
        if not re.fullmatch('[a-f0-9]{64}',sha):
            raise PackError('Official installer SHA-256 is malformed; no pin was changed.')
        pom = ET.fromstring(official_metadata(base+'.pom',max_bytes=4*1024*1024))
        fml = [d.findtext('{*}version') for d in pom.findall('./{*}dependencies/{*}dependency')
               if d.findtext('{*}groupId') == 'net.neoforged.fancymodloader'
               and d.findtext('{*}artifactId') == 'loader']
        if len(fml) != 1 or not re.fullmatch(r'\d+(?:\.\d+)+',fml[0] or ''):
            raise PackError('Official POM does not identify one exact FML version; no pin was changed.')
    except (ET.ParseError,UnicodeError) as exc:
        raise PackError('Official loader metadata could not be parsed; no pin was changed.') from exc
    updated = deepcopy(lock)
    updated['migration'].setdefault('profile_neoforge',lock['neoforge'])
    updated.update(neoforge=selected,fml=fml[0],loader_policy={
        'mode':'explicit','minecraft':'1.21.1','version':selected,'fml':fml[0],
        'metadata_url':METADATA,'pom_url':base+'.pom'})
    tool_path = safe_path(root,'qa/tool-lock.json')
    tools = read_json(tool_path) if tool_path.exists() else {}
    tools.setdefault('neoforge',{})[selected] = {'url':base+'-installer.jar','sha256':sha}
    if apply:
        # Fetch/parse all remote evidence before changing local metadata.
        generate(root,updated)
        write_json(tool_path,tools)
        write_json(safe_path(root,'modpack/lock.json'),updated)
    return {'minecraft':'1.21.1','previous':lock['neoforge'],'selected':selected,
            'fml':fml[0],'installer':tools['neoforge'][selected],'applied':apply,
            'profile_neoforge':updated['migration']['profile_neoforge'],
            'profile_writes':0,'metadata_url':METADATA,
            'coverage':'Official version/checksum metadata only; Minecraft launch and mod compatibility remain unverified.'}
