"""Pure console progress decisions and a bounded JSONL timeline.

The runner owns all IO, deadlines and processes. Silence in a healthy server log
is not a failure; an unanswered owned console request is an observation to sample.
"""
from copy import deepcopy
import json
from pathlib import Path
import re

from .common import no_links


_PREFIX = (r'^(?:\[\d{2}:\d{2}:\d{2}(?:\.\d+)?\]\s*)?'
           r'\[Server thread/INFO\](?:\s*\[[^\]\r\n]{1,160}\])?:\s*')
_DONE = re.compile(_PREFIX + r'Done \([0-9]+(?:\.[0-9]+)?s\)! For help, type "help"\s*$')
_LIST = re.compile(_PREFIX + r'There are \d+ of a max of \d+ players online:.*$')
_SAVED = re.compile(_PREFIX + r'Saved the game\s*$')


class TrialMonitor:
    def __init__(self, started_at, startup_deadline, profiling):
        self.started = started_at
        self.deadline = startup_deadline
        self.profiling = profiling
        self.phase = 'startup'
        self.readiness = {'protocol': 2, 'verified': False,
                          'log_observed_seconds': None, 'verified_seconds': None}
        self.save = {'acknowledged': False, 'seconds': None}
        self.pending = None
        self.dispatching = False
        self.next_probe = started_at
        self.next_resources = started_at
        self.next_heap = started_at
        self.resource_count = 0
        self.capture_count = 0
        self.checkpoints = [started_at + x for x in (60, 120, 240)]
        self.incidents = []
        self.availability = []
        self.completed = []

    def observe_line(self, line, sequence, now):
        # Complete bounded lines only. Prevent a multi-line/quoted payload from
        # manufacturing an acknowledgement inside another log record.
        if len(line) > 16384 or '\n' in line or '\r' in line:
            return
        if _DONE.fullmatch(line) and self.readiness['log_observed_seconds'] is None:
            self.readiness['log_observed_seconds'] = max(0, now-self.started)
        pending = self.pending
        if not pending or sequence <= pending['sequence'] or now < pending['sent']:
            return
        matched = _LIST.fullmatch(line) if pending['kind'] == 'heartbeat' else _SAVED.fullmatch(line)
        if not matched:
            return
        if pending['kind'] == 'heartbeat':
            if not self.readiness['verified'] and self.readiness['log_observed_seconds'] is not None:
                self.readiness.update(verified=True, verified_seconds=max(0,now-self.started))
                self.completed.append({'kind':'phase_complete','phase':'startup'})
            self.next_probe = pending['sent']+10
        else:
            self.save.update(acknowledged=True, seconds=max(0,now-pending['sent']))
            self.completed.append({'kind':'phase_complete','phase':'workload'})
        if pending.get('incident') is not None:
            self.incidents[pending['incident']]['recovered_seconds'] = max(0,now-self.started)
        self.pending = None

    def command_sent(self, kind, sequence, now):
        if kind not in ('heartbeat','save') or self.pending is not None:
            raise ValueError('Only one supported console operation may be pending.')
        self.pending = {'kind':kind,'sequence':sequence,'sent':now,'captures':set(), 'incident':None}
        self.dispatching = False

    def begin_soak(self, now, deadline):
        self.phase, self.deadline = 'soak', deadline
        self.next_probe = now+10

    def begin_save(self, now, deadline):
        self.phase, self.deadline = 'workload', deadline

    def _capture(self, actions, reason):
        if self.capture_count < 6:
            self.capture_count += 1
            actions.append({'kind':'capture_threads','reason':reason,'number':self.capture_count})

    def tick(self, now, alive):
        if not alive or now >= self.deadline:
            return []
        actions, self.completed = self.completed, []
        if self.profiling != 'off':
            if now >= self.next_resources and self.resource_count < 1500:
                self.resource_count += 1
                self.next_resources = now+5
                actions.append({'kind':'sample_resources'})
            if now >= self.next_heap:
                self.next_heap = now+30
                actions.append({'kind':'sample_heap'})
            if self.phase == 'startup' and self.readiness['log_observed_seconds'] is None:
                due = [x for x in self.checkpoints if now >= x]
                if due:
                    self.checkpoints = [x for x in self.checkpoints if x > now]
                    self._capture(actions,'startup_checkpoint')
        if self.pending:
            pending = self.pending
            age = now-pending['sent']
            due = [x for x in (10,20,40) if age >= x and x not in pending['captures']]
            if due:
                pending['captures'].update(due)
                if pending['incident'] is None and len(self.incidents) < 100:
                    pending['incident'] = len(self.incidents)
                    self.incidents.append({'phase':self.phase,'operation':pending['kind'],
                        'since_seconds':max(0,pending['sent']-self.started),
                        'observed_seconds':max(0,now-self.started)})
                if self.profiling != 'off':
                    self._capture(actions,'console_unresponsive' if pending['kind']=='heartbeat' else 'save_wait')
                    if self.profiling == 'jfr' and due[0] == 10:
                        actions.append({'kind':'dump_jfr'})
            return actions
        if self.dispatching:
            return actions
        if self.phase == 'workload' and not self.save['acknowledged']:
            self.dispatching = True
            actions.append({'kind':'send_command','operation':'save','text':'save-all flush'})
        elif (self.phase != 'workload' and self.readiness['log_observed_seconds'] is not None
              and now >= self.next_probe):
            self.dispatching = True
            actions.append({'kind':'send_command','operation':'heartbeat','text':'list'})
        return actions

    def snapshot(self):
        pending = {k:v for k,v in self.pending.items() if k != 'captures'} if self.pending else None
        return deepcopy({'readiness':self.readiness, 'save':self.save, 'pending':pending,
                         'incidents':self.incidents, 'capture_count':self.capture_count,
                         'availability':self.availability})


class EventTimeline:
    def __init__(self, path, max_events=20_000, max_bytes=2*1024**2):
        self.path = no_links(path)
        self.stream = self.path.open('xb')
        self.max_events, self.max_bytes = max_events, max_bytes
        self.events = self.bytes = self.omitted = 0

    def append(self, event):
        # Avoid serializing an unbounded hostile event. Normal events are small
        # structured observations; a larger record is omitted explicitly.
        if self.events >= self.max_events or len(repr(event)) > 16384:
            self.omitted += 1
            return
        data = (json.dumps(event,ensure_ascii=True,allow_nan=False,separators=(',',':'))+'\n').encode()
        if len(data)+self.bytes > self.max_bytes:
            self.omitted += 1
            return
        self.stream.write(data)
        self.stream.flush()
        self.events += 1
        self.bytes += len(data)

    def close(self):
        self.stream.close()
        return {'events':self.events,'bytes':self.bytes,'omitted':self.omitted}
