"""Comparable-run indicators; baseline creation is an explicit maintainer command."""
import math
import re
from copy import deepcopy
from .common import PackError

METRICS = {'startup_seconds':1.25,'save_flush_seconds':1.25,'avg_mspt':1.20,'worst_mspt':1.30}
CONTEXT = ('scenario','seed','minecraft','neoforge','java_major','java_build','heap_mb','profiling',
           'soak_seconds','startup_timeout_seconds','active_processors','report_schema','readiness_protocol','os_cpu','monitor')


def _number(value):
    try: return isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value) and value > 0
    except OverflowError: return False


def _verified(report):
    required=['startup','soak','shutdown']
    if report.get('context',{}).get('scenario')=='save-flush': required.append('workload')
    return (report.get('schema')==2 and report.get('readiness',{}).get('verified') is True
            and report.get('readiness',{}).get('protocol')==2
            and report.get('context',{}).get('report_schema')==2
            and report.get('context',{}).get('readiness_protocol')==2
            and report.get('context',{}).get('scenario') in ('startup-soak','save-flush')
            and all(report.get('phases',{}).get(p,{}).get('status') in ('passed','succeeded') for p in required))


def _content_changes(current,old):
    changes={}
    for group in ('mods','assets'):
        new=current.get(group,{}) or {}; before=old.get(group,{}) or {}
        changes[group]={'added':sorted(new.keys()-before.keys()),'removed':sorted(before.keys()-new.keys()),
                        'changed':sorted(k for k in new.keys()&before.keys() if new[k]!=before[k])}
    changes['inventory_changed']=current.get('inventory_sha256')!=old.get('inventory_sha256')
    changes['assets_changed']=current.get('assets_sha256')!=old.get('assets_sha256')
    return changes


def baseline_from(report, commit):
    if report.get('dirty') is not False or report.get('source_dirty') is True:
        raise PackError('Baseline requires a clean committed source checkout; rerun QA after committing reviewed changes.')
    if report.get('category') != 'success' or not _verified(report):
        raise PackError('Baseline requires a successful actual startup, soak and graceful shutdown report.')
    if not isinstance(commit,str) or not re.fullmatch(r'[0-9a-f]{40}',commit) or report.get('source_commit')!=commit:
        raise PackError('A verified full source commit is required for a baseline.')
    context = report.get('context',{})
    if any(context.get(k) is None for k in CONTEXT):
        raise PackError('Baseline requires a complete workload context.')
    metrics = {k:report.get('metrics',{}).get(k) for k in METRICS if _number(report.get('metrics',{}).get(k))}
    if not metrics:
        raise PackError('No measured metrics are available for a baseline.')
    content=report.get('content',{})
    if any(not isinstance(content.get(k),str) or not re.fullmatch('[a-f0-9]{64}',content[k]) for k in ('inventory_sha256','assets_sha256')):
        raise PackError('Baseline requires exact inventory and indexed asset fingerprints.')
    return {'schema':2,'commit':commit,'context':{k:deepcopy(context[k]) for k in CONTEXT},'metrics':metrics,'content':deepcopy(content),
            'coverage':'Single-run indicators only. Repeated runs and retention evidence are needed for causal or memory-leak conclusions.'}


def compare(report,baseline):
    missing = [k for k in CONTEXT if k not in report.get('context',{}) or report['context'].get(k) != baseline.get('context',{}).get(k)]
    result = {'status':'inconclusive','confirmed_failure':False,'indicators':[],
              'limitations':['Single-run noise is not a confirmed regression. Unmeasured MSPT/client/GPU metrics are not inferred.'],
              'baseline_commit':baseline.get('commit')}
    result['content_changes']=_content_changes(report.get('content',{}),baseline.get('content',{}))
    if missing or report.get('category') != 'success' or not _verified(report) or baseline.get('schema')!=2:
        result['reason'] = 'Workload context differs or the current run did not succeed: '+', '.join(missing)
        return result
    for key,threshold in METRICS.items():
        old,new = baseline.get('metrics',{}).get(key),report.get('metrics',{}).get(key)
        if _number(old) and _number(new):
            result['indicators'].append({'metric':key,'baseline':old,'current':new,'ratio':new/old,'warning':new/old > threshold})
    if not result['indicators']:
        result['reason']='No comparable measured metrics.'
    else:
        result['status']='warning' if any(m['warning'] for m in result['indicators']) else 'within_thresholds'
        result['reason']='Measured indicators compared; no automatic baseline update or causal attribution.'
    return result
