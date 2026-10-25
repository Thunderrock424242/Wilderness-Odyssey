"""Bounded saved-evidence readers and pure interpretation; never executes inputs."""
from copy import deepcopy
import hashlib
from itertools import islice
import json
import math
import os
from pathlib import Path
import re

from .common import PackError, no_links, safe_path
from .diagnostics import analyze_memory, classify, _number


MIB=1024**2
_PAUSE=re.compile(r'GC\((\d+)\)\s+(Pause (?:Young|Full|Mixed).*?)\s+(\d+(?:\.\d+)?)([KMG])->(\d+(?:\.\d+)?)([KMG])\((\d+(?:\.\d+)?)([KMG])\)\s+(\d+(?:\.\d+)?)ms\s*$')


def finding(code,category,evidence,next_step,*,severity='warning',confidence='medium',phase='unknown',window=None,limitations=None):
    return {'code':code,'category':category,'severity':severity,'phase':phase,'window':window,
            'confidence':confidence,'evidence':[str(x)[:500] for x in evidence[:8]],
            'limitations':limitations or ['Observed evidence does not establish a culprit or causal regression.'],
            'next_step':next_step}


def _bounded_lines(text):
    for line in islice(str(text).splitlines(),100_000):
        yield line[:16384]


def parse_gc(text,source='gc.log'):
    events={}; starts=set(); limitations=[]
    if 'Using G1' not in text and 'G1 ' not in text:
        return {'events':[],'limitations':['G1 collector identity is unavailable or unsupported.']}
    for line in _bounded_lines(text):
        gcid=re.search(r'GC\((\d+)\)',line)
        if gcid and 'gc,start' in line:
            starts.add(int(gcid[1]))
        match=_PAUSE.search(line)
        if not match:
            continue
        times=re.findall(r'\[(\d+(?:\.\d+)?)s\]',line)
        if not times:
            continue
        identity,label,before,unit_before,after,unit_after,total,unit_total,pause=match.groups()
        scale=lambda number,unit:float(number)*{'K':1024,'M':1024**2,'G':1024**3}[unit]
        collection='full' if 'Pause Full' in label else 'mixed' if '(Mixed)' in label or 'Pause Mixed' in label else 'young'
        elapsed=float(times[-1]); pause=float(pause)
        scaled=(scale(before,unit_before),scale(after,unit_after),scale(total,unit_total))
        if not all(math.isfinite(v) for v in (elapsed,pause,*scaled)):
            limitations.append('Nonfinite GC numeric field omitted.')
            continue
        key=(int(identity),elapsed,collection)
        events[key]={'id':int(identity),'elapsed_seconds':elapsed,'collection':collection,
            'heap_before_bytes':int(scaled[0]),'heap_after_bytes':int(scaled[1]),
            'heap_capacity_bytes':int(scaled[2]),'pause_ms':pause,
            'retained_live_set':False,'source':str(source)[:200]}
        if len(events)>=20000:
            limitations.append('GC event limit reached.'); break
    if starts-{e['id'] for e in events.values()}:
        limitations.append('Incomplete GC start events lack a complete pause end.')
    return {'events':sorted(events.values(),key=lambda e:e['elapsed_seconds']),'limitations':limitations}


def analyze_thread_dumps(dumps):
    observations=[]; deadlocks=[]; seen=set()
    for item in dumps[:6]:
        text=str(item.get('text',''))[:2*MIB]; source=str(item.get('source','thread dump'))[:200]
        if source in seen:
            continue
        seen.add(source)
        if re.search(r'Found (?:one|\d+) (?:Java-level )?deadlocks?',text,re.I):
            deadlocks.append(source)
        match=re.search(r'^"Server thread"[^\n]*\n(.*?)(?=\n"|\Z)',text,re.M|re.S)
        if match:
            frames=[line.strip().split(' ~[')[0][:500] for line in match[1].splitlines() if line.strip().startswith('at ')][:32]
            observations.append({'source':source,'frames':frames,'elapsed_seconds':item.get('elapsed_seconds')})
    findings=[]
    waiting=[o for o in observations if any('ChunkStorage.flushWorker' in x for x in o['frames'])]
    if len(waiting)>=2:
        findings.append(finding('repeated_chunk_flush_wait','hang',
            [o['source']+': '+next(x for x in o['frames'] if 'flushWorker' in x) for o in waiting],
            'Compare serialization workers, process CPU/I/O and save timing across these snapshots.',
            limitations=['Repeated sampled waits are not proof of deadlock or individual mod responsibility.']))
    if deadlocks:
        findings.append(finding('jvm_reported_deadlock','hang',deadlocks,
            'Inspect the JVM-reported locks and owning threads in the complete private dumps.',confidence='high'))
    return findings


_GROUPS=[('missing_registry_entry',r"Couldn't load tag|Unknown registry key|does not exist"),
         ('data_parse_error',r"Parsing error|Couldn't parse|Error parsing config|JsonParseException"),
         ('mixin_conflict',r'Method overwrite conflict|Mixin apply failed|InjectionError'),
         ('invalid_block_entity',r'Tried to load a (?:DUMMY )?block entity|not a valid block entity')]


def group_log_findings(text):
    groups={}
    for line in _bounded_lines(text):
        for code,pattern in _GROUPS:
            if re.search(pattern,line,re.I):
                identifiers=re.findall(r'\b[a-z][a-z0-9_.-]*:[a-z0-9_./-]+',line)
                key=(code,identifiers[-1] if identifiers else '')
                if key not in groups and len(groups)>=200:
                    continue
                group=groups.setdefault(key,finding(code,'configuration',[line],
                    'Review the affected registry/config/data definition against the exact pinned mods.'))
                group['count']=group.get('count',0)+1
                group['first']=group.get('first',line[:200]); group['last']=line[:200]
                break
    return list(groups.values())


def _read_file(path,limit):
    no_links(path)
    with path.open('rb') as stream:
        before=os.fstat(stream.fileno())
        if before.st_size>limit:
            marker=b'\n[Evidence middle omitted]\n'
            head_size=max(0,(limit-len(marker))//2)
            tail_size=max(0,limit-len(marker)-head_size)
            head=stream.read(head_size)
            stream.seek(max(0,before.st_size-tail_size))
            data=(head+marker+stream.read(tail_size))[:limit]
        else:
            data=stream.read(limit)
        after=os.fstat(stream.fileno())
    current=path.stat()
    partial=(before.st_size>limit or (before.st_size,before.st_mtime_ns,before.st_ino)!=(after.st_size,after.st_mtime_ns,after.st_ino)
             or (current.st_size,current.st_mtime_ns,current.st_ino)!=(after.st_size,after.st_mtime_ns,after.st_ino))
    text=data.decode('utf-8-sig',errors='replace')
    if '\ufffd' in text or any(len(line)>16384 for line in text.splitlines()):
        partial=True
    return {'text':'\n'.join(line[:16384] for line in text.splitlines()),'bytes':len(data),
            'partial':partial,'original_bytes':before.st_size,'sha256':hashlib.sha256(data).hexdigest(),
            'hash_basis':'captured_bytes'}


def read_evidence(input_path):
    path=no_links(input_path)
    if not path.exists():
        raise PackError('Evidence input does not exist.')
    root=path if path.is_dir() else path.parent
    result={'report':None,'logs':'','gc_logs':[],'thread_dumps':[],'limitations':[],'files':[]}
    candidates=[]
    if path.is_file():
        candidates=[(path.name,path)]
    else:
        for directory in ('','logs','artifacts','artifacts/logs','crash-reports','artifacts/crash-reports'):
            folder=safe_path(root,directory) if directory else root
            if not folder.is_dir(): continue
            with os.scandir(folder) as entries:
                for index,entry in enumerate(islice(entries,4097)):
                    if index==4096:
                        result['limitations'].append('Directory enumeration limit reached.'); break
                    if entry.is_file(follow_symlinks=False):
                        relative=(directory+'/' if directory else '')+entry.name
                        candidates.append((relative,safe_path(root,relative)))
    counts={}; total=0; primary=[]; crashes=[]; hashes=set()
    for relative,file in sorted(candidates,key=lambda p:(p[0]!='server.log',p[0])):
        name=file.name
        category=None; limit=0
        if name=='report.json': category='report'; limit=4*MIB
        elif name=='samples.json': category='samples'; limit=2*MIB
        elif name=='resources.json': category='resources'; limit=2*MIB
        elif name in ('server.log','latest.log','installer.log'): category='logs'; limit=8*MIB
        elif re.fullmatch(r'qa-gc\.log(?:\.\d+)?',name): category='gc'; limit=8*MIB
        elif re.fullmatch(r'jcmd-\d+-threads\.log',name): category='threads'; limit=2*MIB
        elif re.fullmatch(r'hs_err_pid\d+\.log',name): category='crash'; limit=2*MIB
        elif name.startswith('crash-') and name.endswith('.txt'): category='crash'; limit=MIB
        elif path.is_file() and file.suffix.lower() in ('.log','.txt'): category='logs'; limit=8*MIB
        if category is None: continue
        maximum={'report':1,'samples':1,'resources':1,'logs':3,'gc':4,'threads':6,'crash':4}[category]
        if counts.get(category,0)>=maximum:
            result['limitations'].append(category+' file count limit reached.'); continue
        counts[category]=counts.get(category,0)+1
        remaining=64*MIB-total
        if remaining<1024:
            result['limitations'].append('Total evidence byte budget reached.'); break
        try:
            record=_read_file(file,min(limit,remaining))
        except (OSError,ValueError) as error:
            result['limitations'].append(relative+': unavailable ('+type(error).__name__+').'); continue
        total+=record['bytes']
        result['files'].append({'source':relative,**{k:v for k,v in record.items() if k!='text'}})
        if record['partial']: result['limitations'].append(relative+': partial or concurrently changed input.')
        text=record['text']
        if category in ('report','samples','resources'):
            try:
                data=json.loads(text)
                if category=='report':
                    if not isinstance(data,dict) or type(data.get('schema',1)) is not int or data.get('schema',1) not in (1,2):
                        raise ValueError('Unknown report schema')
                    result['report']=data
                elif isinstance(data,list): result.setdefault(category,[]).extend(data[:1500])
            except (ValueError,RecursionError):
                result['limitations'].append(relative+': unknown schema or malformed JSON.')
        elif category=='gc': result['gc_logs'].append({'source':relative,'text':text})
        elif category=='threads': result['thread_dumps'].append({'source':relative,'text':text})
        elif record['sha256'] not in hashes:
            hashes.add(record['sha256'])
            if category=='logs' and not primary: primary.append(text)
            elif category=='crash': crashes.append(text)
    result['logs']='\n'.join(primary+crashes)
    result['limitations']=list(dict.fromkeys(result['limitations']))[:40]
    return result


def analyze_evidence(evidence):
    logs=str(evidence.get('logs',''))
    original=evidence.get('report')
    if isinstance(original,dict):
        result=deepcopy(original)
    else:
        result=classify(logs,None,evidence_only=True)
        result.update(crashed=False,isolation_eligible=False)
        result['coverage']=['Saved log observations; process exit and verified readiness were not supplied.']
    findings=group_log_findings(logs)+analyze_thread_dumps(evidence.get('thread_dumps',[]))
    events={}; limitations=list(evidence.get('limitations',[]))
    for item in evidence.get('gc_logs',[])[:4]:
        parsed=parse_gc(str(item.get('text','')),item.get('source','gc.log'))
        limitations.extend(parsed['limitations'])
        for event in parsed['events']:
            events[(event['id'],event['elapsed_seconds'],event['collection'])]=event
    ordered=sorted(events.values(),key=lambda e:e['elapsed_seconds'])
    pauses=sorted(e['pause_ms'] for e in ordered)
    total=sum(pauses)
    span=(max(e['elapsed_seconds'] for e in ordered)-min(e['elapsed_seconds']-e['pause_ms']/1000 for e in ordered)) if ordered else None
    gc={'count':len(ordered),'pause_total_ms':total if ordered else None,
        'pause_max_ms':max(pauses) if pauses else None,
        'pause_p95_ms':pauses[max(0,math.ceil(len(pauses)*.95)-1)] if pauses else None,
        'window_seconds':span,'pause_fraction':total/(span*1000) if span and span>0 else None}
    supplied_samples=evidence.get('samples',result.get('samples',[]))
    if not isinstance(supplied_samples,list):
        limitations.append('Malformed memory samples omitted.')
        supplied_samples=[]
    samples=supplied_samples[:1500]
    resources=evidence.get('resources',result.get('resources',[]))
    if not isinstance(resources,list):
        limitations.append('Malformed process resource samples omitted.'); resources=[]
    result['resources']=resources[:1500]
    native_times={row.get('elapsed_seconds') for row in resources[:1500]
                  if isinstance(row,dict) and _number(row.get('elapsed_seconds')) is not None}
    for index,row in enumerate(samples):
        if (isinstance(row,dict) and 'cpu_percent' in row and 'threads' in row
            and _number(row.get('elapsed_seconds')) is not None and row['elapsed_seconds'] in native_times):
            samples[index]={key:value for key,value in row.items() if key!='threads'}
            if 'Legacy native-thread samples normalized separately from Java thread counts.' not in limitations:
                limitations.append('Legacy native-thread samples normalized separately from Java thread counts.')
    samples.extend({'elapsed_seconds':row.get('elapsed_seconds'),'cpu_percent':row.get('cpu_percent')}
                   for row in resources[:1500] if isinstance(row,dict))
    for event in ordered:
        sample={'elapsed_seconds':event['elapsed_seconds'],'heap_used_bytes':event['heap_after_bytes']}
        if event['collection']=='full': sample['post_gc_heap_bytes']=event['heap_after_bytes']
        samples.append(sample)
    memory=analyze_memory(samples)
    memory['limitations'].append('Only complete full-GC end values feed post-GC growth analysis; no retained-object or repeat-workload proof.')
    if pauses and (max(pauses)>=200 or (span and span>=60 and len(pauses)>=4 and gc['pause_fraction']>=.10)):
        findings.append(finding('gc_pause_pressure','memory',[f'Maximum observed pause {max(pauses):.2f} ms.'],
            'Correlate GC pauses with workload, heap limits and allocation evidence; this is not a leak verdict.'))
    if memory['suspected_growth']:
        findings.append(finding('suspected_post_collection_growth','memory',memory['warnings'],
            'Repeat a comparable workload cycle and inspect retained objects before claiming a leak.'))
    result.update(findings=findings[:220],gc=gc,memory=memory,
        analysis={'limitations':list(dict.fromkeys(limitations))[:40],'input_files':evidence.get('files',[]),
                  'basis':'Provided local evidence only; no process or provider was contacted.'})
    return result
