"""Comparable-run indicators; baseline creation is an explicit maintainer command."""
import math
import re
from .common import PackError

METRICS = {'startup_seconds':1.25,'avg_mspt':1.20,'worst_mspt':1.30}
CONTEXT = ('scenario','seed','minecraft','neoforge','java_major','heap_mb','profiling','soak_seconds','active_processors')


def _number(value):
    return isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value) and value > 0


def baseline_from(report, commit):
    if report.get('source_dirty',report.get('dirty')) is True:
        raise PackError('Baseline requires a clean committed source checkout; rerun QA after committing reviewed changes.')
    if report.get('category') != 'success' or any(report.get('phases',{}).get(p,{}).get('status') not in ('passed','succeeded') for p in ('startup','soak','shutdown')):
        raise PackError('Baseline requires a successful actual startup, soak and graceful shutdown report.')
    if not re.fullmatch(r'[0-9a-f]{40}',commit):
        raise PackError('A verified full source commit is required for a baseline.')
    context = report.get('context',{})
    if any(context.get(k) is None for k in CONTEXT):
        raise PackError('Baseline requires a complete workload context.')
    metrics = {k:report.get('metrics',{}).get(k) for k in METRICS if _number(report.get('metrics',{}).get(k))}
    if not metrics:
        raise PackError('No measured metrics are available for a baseline.')
    return {'schema':1,'commit':commit,'context':{k:context[k] for k in CONTEXT},'metrics':metrics,
            'coverage':'Single-run indicators only. Repeated runs and retention evidence are needed for causal or memory-leak conclusions.'}


def compare(report,baseline):
    missing = [k for k in CONTEXT if k not in report.get('context',{}) or report['context'].get(k) != baseline.get('context',{}).get(k)]
    result = {'status':'inconclusive','confirmed_failure':False,'indicators':[],
              'limitations':['Single-run noise is not a confirmed regression. Unmeasured MSPT/client/GPU metrics are not inferred.'],
              'baseline_commit':baseline.get('commit')}
    if missing or report.get('category') != 'success':
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
