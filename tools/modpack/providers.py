"""Bounded HTTPS downloads; CurseForge restrictions are never bypassed."""
import ipaddress
import json
import os
from pathlib import Path
import socket
import urllib.error
import urllib.parse
import urllib.request

from .common import PackError

USER_AGENT = 'WildernessOdyssey-PackQA/1.0 (github.com/Thunderrock424242/Wilderness-Odyssey)'


def validate_url(url):
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.port not in (None,443):
        raise PackError('Downloads require a public HTTPS URL without credentials or custom ports.')
    if parsed.hostname.lower() in ('localhost',) or parsed.hostname.lower().endswith(('.local','.internal')):
        raise PackError('Private network download URLs are not allowed.')
    try:
        address = ipaddress.ip_address(parsed.hostname)
    except ValueError:
        address = None
    if address is not None and not address.is_global:
        raise PackError('Private network download URLs are not allowed.')
    return parsed


def _public_url(url):
    parsed = validate_url(url)
    try:
        addresses = socket.getaddrinfo(parsed.hostname,443,type=socket.SOCK_STREAM)
    except OSError as exc:
        raise PackError('Download DNS lookup failed.') from exc
    if not addresses or any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
        raise PackError('Download resolves to a private network address.')


class SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        _public_url(newurl)
        if req.has_header('X-api-key'):
            raise PackError('Authenticated API redirects are not followed.')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch(url, target=None, api_key=None, max_bytes=1024*1024*1024):
    _public_url(url)
    headers = {'User-Agent':USER_AGENT}
    if api_key:
        if urllib.parse.urlsplit(url).hostname != 'api.curseforge.com':
            raise PackError('API key is only sent to the official CurseForge API.')
        headers['x-api-key'] = api_key
    request = urllib.request.Request(url,headers=headers)
    try:
        with urllib.request.build_opener(SafeRedirect()).open(request,timeout=30) as response:
            size, chunks = 0, []
            stream = Path(target).open('wb') if target else None
            try:
                while True:
                    block = response.read(1024*1024)
                    if not block:
                        break
                    size += len(block)
                    if size > max_bytes:
                        raise PackError('Download exceeds configured size limit.')
                    if stream:
                        stream.write(block)
                    else:
                        chunks.append(block)
            finally:
                if stream:
                    stream.close()
            return b''.join(chunks) if target is None else size
    except (OSError, urllib.error.URLError) as exc:
        # Do not reflect URLs, query tokens, headers, or credentials into reports.
        raise PackError(f'Download failed ({type(exc).__name__}); verify availability or supply --local-mods.') from exc


def download_url(mod):
    source = mod['source']
    if source['kind'] == 'curseforge':
        key = os.environ.get('CURSEFORGE_API_KEY')
        if not key:
            raise PackError(f'{mod["id"]}: set CURSEFORGE_API_KEY privately or supply the exact file using --local-mods.')
        project, file = source['project_id'], source['file_id']
        project_data = json.loads(fetch(f'https://api.curseforge.com/v1/mods/{int(project)}',api_key=key,max_bytes=4*1024*1024))['data']
        if project_data.get('allowModDistribution') is not True:
            raise PackError(f'{mod["id"]}: author restricts third-party downloads; use CurseForge then --local-mods.')
        data = json.loads(fetch(f'https://api.curseforge.com/v1/mods/{int(project)}/files/{int(file)}',api_key=key,max_bytes=4*1024*1024))['data']
        if data.get('modId') != project or data.get('id') != file or data.get('isAvailable') is not True or not data.get('downloadUrl'):
            raise PackError(f'{mod["id"]}: pinned CurseForge file is unavailable/restricted; supply --local-mods.')
        return data['downloadUrl']
    if source['kind'] in ('url','modrinth') and source.get('permission') == 'author-approved':
        return source['url']
    raise PackError(f'{mod["id"]}: manual source; obtain the exact author-provided file and use --local-mods.')
