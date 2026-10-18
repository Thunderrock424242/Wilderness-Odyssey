"""New, bounded, sanitized text bundles. Private originals are never modified."""
import hashlib
from itertools import islice
import json
import os
from pathlib import Path
import re

from .common import PackError, no_links, safe_path
from .evidence import _read_file


_NAMES={'report.md','report.json','samples.json','resources.json','incidents.json','timeline.jsonl',
        'server.log','latest.log','installer.log','java-version.log'}
_PATTERN=re.compile(r'(?:jcmd-\d+-(?:heap|threads|native)\.log|qa-gc\.log(?:\.\d+)?|hs_err_pid\d+\.log|crash-[\w.-]+\.txt)\Z')


def sanitize(text):
    # Read bounded complete strings before redaction so chunk boundaries cannot
    # split a credential. A partial last line still consumes its whole suffix.
    text=re.sub(r'(?im)^.*(?:\bauthorization\s*:|\b[\w.-]{0,80}(?:token|password|secret|api[_-]?key)[\"\']?\s*[:=]).*$', '[credential line removed]',text)
    text=re.sub(r'(?i)(https?://)[^\s/]+@',r'\1[credentials]@',text)
    text=re.sub(r'(https?://[^\s?\#"<>]+)[?\#][^\s"<>]*',r'\1?[query removed]',text)
    text=re.sub(r'(?i)\b[A-Z]:[\\/][^\r\n"<>|]*','[private path]',text)
    text=re.sub(r'/(?:home|Users)/[^\s"<>]+','[private path]',text)
    return text


def _encoded(value):
    return (json.dumps(value,ensure_ascii=True,separators=(',',':'),allow_nan=False)+'\n').encode()


def export_reports(reports,destination,max_bytes=32*1024**2):
    reports=no_links(reports).resolve(); destination=no_links(destination).resolve()
    if type(max_bytes) is not int or max_bytes<256 or max_bytes>32*1024**2:
        raise PackError('Export byte budget must be between 256 bytes and 32 MiB.')
    if not reports.is_dir() or reports.is_relative_to(destination) or destination.is_relative_to(reports):
        raise PackError('Export requires disjoint input and new output directories.')
    if destination.exists(): raise PackError('Export output must be a new directory.')
    candidates=[]; omitted=0
    for directory in ('','artifacts','artifacts/logs','artifacts/crash-reports','logs','crash-reports'):
        folder=safe_path(reports,directory) if directory else reports
        if not folder.is_dir(): continue
        with os.scandir(folder) as entries:
            for index,entry in enumerate(islice(entries,4097)):
                if index==4096: omitted+=1; break
                if entry.name in _NAMES or _PATTERN.fullmatch(entry.name):
                    if entry.is_file(follow_symlinks=False):
                        candidates.append(((directory+'/' if directory else '')+entry.name,entry.name))
                    else: omitted+=1
                else: omitted+=1
    destination.mkdir(parents=True,exist_ok=False)
    records=[]; used=0
    reserve=min(16384,max_bytes//2)
    # Summary first, then incident/thread evidence, then larger logs.
    candidates.sort(key=lambda item:(0 if item[1]=='report.md' else 1 if item[1]=='report.json'
        else 2 if 'threads' in item[1] else 3 if item[1]=='timeline.jsonl' else 4,item[0]))
    for relative,name in candidates[:128]:
        remaining=max_bytes-reserve-used
        if remaining<128: omitted+=1; continue
        try:
            record=_read_file(safe_path(reports,relative),min(4*1024**2,remaining))
            text=record['text']
            if '\n[Evidence middle omitted]\n' in text:
                head,tail=text.split('\n[Evidence middle omitted]\n',1)
                # The tail can start inside a credential value or personal path.
                tail=tail.partition('\n')[2]
                text=head+'\n[Evidence middle and partial tail line omitted]\n'+tail
            text=sanitize(text)
            data=text.encode('utf-8')
            truncated=record['partial']
            if len(data)>remaining:
                data=data[:max(0,remaining-40)].decode('utf-8',errors='ignore').encode()+b'\n[Export truncated]\n'
                truncated=True
            # JSON may be sanitized/truncated as text; label it accurately.
            target=relative+'.txt' if name.endswith(('.json','.jsonl')) else relative
            output=safe_path(destination,target); output.parent.mkdir(parents=True,exist_ok=True)
            with output.open('xb') as stream: stream.write(data)
            used+=len(data)
            records.append({'file':target,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),
                            'sanitized':True,'partial':truncated})
        except (OSError,ValueError): omitted+=1
    omitted+=max(0,len(candidates)-128)
    manifest={'schema':1,'files':records,'omitted_count':omitted,
              'coverage':'Sanitized allowlisted text only; omitted, binary and private originals remain local.'}
    data=_encoded(manifest)
    # A small cap may not fit every detailed file entry. Counts stay accurate.
    hidden=0
    while len(data)+used>max_bytes and manifest['files']:
        manifest['files']=manifest['files'][:-1]; hidden+=1
        manifest['manifest_entries_omitted']=hidden; data=_encoded(manifest)
    if len(data)+used>max_bytes:
        manifest={'schema':1,'files':[],'omitted_count':omitted,'manifest_entries_omitted':len(records)}
        data=_encoded(manifest)
    with (destination/'manifest.json').open('xb') as stream: stream.write(data)
    return {'files':[r['file'] for r in records]+['manifest.json'],'bytes':used+len(data),
            'omitted':omitted,'manifest':'manifest.json'}
