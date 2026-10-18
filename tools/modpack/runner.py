"""Bounded Java 21 server QA in fresh, external installations.

This scenario measures server startup and an idle soak. It never changes the
source profile, forces GC, takes a heap dump, or claims gameplay/client coverage.
Only the subprocess boundary is replaced by the lifecycle tests.
"""

from __future__ import annotations

from collections import deque
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import tempfile
import threading
import time

from .common import PackError, digest, empty_destination, junction, outside_repo, read_json, safe_path, write_json, write_text
from .diagnostics import analyze_memory, classify, render_report
from .install import install
from .pack import validate, dependency_satisfies
from .providers import fetch
from .monitor import TrialMonitor, EventTimeline
from .resources import ResourceSampler
from .evidence import read_evidence, analyze_evidence


_MAX_LOG_BYTES = 8 * 1024 * 1024
_MAX_CAPTURE_BYTES = 2 * 1024 * 1024
_INSTALLER_SECONDS = 300
_SHUTDOWN_SECONDS = 30
_READY = re.compile(
    rb'(?m)^(?:\[[^\]\r\n]{1,100}\]:?\s*){0,4}'
    rb'Done \([0-9]+(?:\.[0-9]+)?s\)! For help, type "help"(?:\r?$|\s)'
)


class _StageError(PackError):
    def __init__(self, category, message):
        super().__init__(message)
        self.category = category


def _base_result():
    result = classify('', None)
    result.update(schema=2,phases={name: {'status': 'not_run', 'seconds': None, 'evidence': []}
                         for name in ('validation', 'setup', 'installer', 'startup', 'soak', 'workload', 'shutdown')},
                  metrics={'avg_mspt': None, 'worst_mspt': None}, artifacts={}, samples=[], coverage=[
                      'Java 21 dedicated server startup and idle soak only.',
                      'Loaded mod count, MSPT, player gameplay, multiplayer, client rendering and GPU performance are not measured.',
                      'Heap samples do not establish retained objects or a memory leak.'],
                  log_truncated=False,findings=[],resources=[],diagnostic_limitations=[])
    return result


def _problem(result, category, message):
    message = str(message)[:8000]
    result.update(classify('', None, harness_error=message))
    result.update(category=category, message=message,
                  next_step='Review the failed phase and its bounded logs before retrying.')
    return result


def _phase(result, name, status, started=None, evidence=None):
    result['phases'][name] = {'status': status,
        'seconds': max(0, time.monotonic() - started) if started is not None else None,
        'evidence': [evidence] if evidence else []}


def _disjoint(first, second):
    return not (first.is_relative_to(second) or second.is_relative_to(first))


def _profile_root(local_mods):
    if local_mods and local_mods.name.lower() == 'mods' and (local_mods.parent / 'minecraftinstance.json').exists():
        return local_mods.parent
    return local_mods


def _report_directory(root, args):
    """Even an unsafe requested report path gets a separate failure artifact."""
    try:
        requested = Path(args.reports)
        if requested.is_symlink() or junction(requested):
            raise PackError('Report directory cannot be a symlink/junction.')
        reports = outside_repo(root, requested)
        destination = Path(args.destination).resolve()
        source = _profile_root(Path(args.local_mods).resolve()) if args.local_mods else None
        if not _disjoint(reports, destination) or source and not _disjoint(reports, source):
            raise PackError('Reports, disposable destination and source profile must be disjoint.')
        if reports.exists() and (not reports.is_dir() or any(reports.iterdir())):
            raise PackError('QA reports require a new or empty directory; existing files were preserved.')
        safe_path(reports, 'report.json')
        safe_path(reports, 'report.md')
        reports.mkdir(parents=True, exist_ok=True)
        return reports, None
    except (OSError, ValueError, TypeError, AttributeError) as error:
        reports = Path(tempfile.mkdtemp(prefix='wo-qa-failure-report-')).resolve()
        message = str(error) if isinstance(error, PackError) else f'Report directory unavailable ({type(error).__name__}).'
        return reports, message


def _validate_options(root, args, reports):
    if getattr(args,'scenario','startup-soak') not in ('startup-soak','save-flush'):
        raise PackError('Unsupported QA scenario.')
    limits = (('memory_mb', 512, 16384), ('startup_seconds', 1, 1800),
              ('soak_seconds', 0, 3600), ('max_tests', 1, 30))
    for name, lower, upper in limits:
        value = getattr(args, name)
        if type(value) is not int or not lower <= value <= upper:
            raise PackError(f'{name.replace("_", " ")} must be an integer between {lower} and {upper}.')
    if args.accept_eula is not True:
        raise PackError('Actual server QA requires explicit --accept-eula acceptance of the Minecraft EULA.')
    if args.profiling not in ('off', 'basic', 'jfr', 'native'):
        raise PackError('Profiling must be off, basic, jfr or native.')
    destination = empty_destination(root, args.destination)
    cache = outside_repo(root, args.cache or Path(tempfile.gettempdir()) / 'wilderness-odyssey-cache')
    if not _disjoint(destination, reports) or not _disjoint(destination, cache) or not _disjoint(cache,reports):
        raise PackError('Destination, cache and reports must be disjoint directories.')
    if args.local_mods:
        source = _profile_root(Path(args.local_mods).resolve())
        if any(not _disjoint(source, path) for path in (destination, cache, reports)):
            raise PackError('QA output, cache and source profile must be disjoint; the source profile is read-only.')
    return destination, cache


def _environment(java, temporary):
    """Do not forward provider tokens, user settings or injected JVM options."""
    temporary = Path(temporary)
    temporary.mkdir(parents=True,exist_ok=True)
    environment = {'PATH': str(Path(java).parent) + os.pathsep + os.defpath,
                   'TEMP': str(temporary), 'TMP': str(temporary), 'TMPDIR': str(temporary)}
    locations = {'HOME':'home','USERPROFILE':'home','APPDATA':'home/AppData/Roaming',
                 'LOCALAPPDATA':'home/AppData/Local','XDG_CACHE_HOME':'home/.cache',
                 'XDG_DATA_HOME':'home/.local/share','XDG_CONFIG_HOME':'home/.config'}
    for name,relative in locations.items():
        directory = safe_path(temporary,relative)
        directory.mkdir(parents=True,exist_ok=True)
        environment[name] = str(directory)
    for name in ('SystemRoot', 'WINDIR'):
        if os.environ.get(name):
            environment[name] = os.environ[name]
    if os.name != 'nt':
        environment['LANG'] = 'C.UTF-8'
    return environment


def _jvm_environment_flags(environment):
    # Java's user.home is not reliably derived from HOME/USERPROFILE on Windows.
    return ['-Duser.home='+environment['HOME'], '-Djava.io.tmpdir='+environment['TEMP'],
            '-XX:ActiveProcessorCount=4']


def _kill_tree(process, environment):
    """Every child starts its own group; stop the group before reaping Java."""
    if os.name == 'nt':
        systemroot = environment.get('SystemRoot', environment.get('WINDIR', r'C:\Windows'))
        killer = Path(systemroot) / 'System32/taskkill.exe'
        try:
            subprocess.run([str(killer), '/PID', str(process.pid), '/T', '/F'],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                           env=environment, timeout=10, check=False,
                           creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
        except (OSError, subprocess.TimeoutExpired):
            pass
    else:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            pass
    if process.poll() is None:
        process.kill()
    try:
        process.wait(timeout=10)
    except subprocess.TimeoutExpired as error:
        raise PackError('Java could not be reaped after forced process-tree cleanup.') from error


class _WindowsJob:
    """An unnamed kill-on-close job also owns children after their parent exits."""
    def __init__(self, process):
        import ctypes
        from ctypes import wintypes

        class BasicLimits(ctypes.Structure):
            _fields_ = [('ProcessTime', ctypes.c_int64), ('JobTime', ctypes.c_int64),
                        ('LimitFlags', wintypes.DWORD), ('MinimumWorkingSet', ctypes.c_size_t),
                        ('MaximumWorkingSet', ctypes.c_size_t), ('ActiveProcesses', wintypes.DWORD),
                        ('Affinity', ctypes.c_size_t), ('PriorityClass', wintypes.DWORD),
                        ('SchedulingClass', wintypes.DWORD)]

        class IoCounters(ctypes.Structure):
            _fields_ = [(name, ctypes.c_uint64) for name in
                        ('ReadOperations', 'WriteOperations', 'OtherOperations', 'ReadBytes', 'WriteBytes', 'OtherBytes')]

        class ExtendedLimits(ctypes.Structure):
            _fields_ = [('BasicLimitInformation', BasicLimits), ('IoInfo', IoCounters),
                        ('ProcessMemoryLimit', ctypes.c_size_t), ('JobMemoryLimit', ctypes.c_size_t),
                        ('PeakProcessMemory', ctypes.c_size_t), ('PeakJobMemory', ctypes.c_size_t)]

        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        kernel.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
        kernel.CreateJobObjectW.restype = wintypes.HANDLE
        kernel.SetInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD]
        kernel.SetInformationJobObject.restype = wintypes.BOOL
        kernel.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
        kernel.AssignProcessToJobObject.restype = wintypes.BOOL
        kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        kernel.CloseHandle.restype = wintypes.BOOL
        self.kernel, self.handle = kernel, kernel.CreateJobObjectW(None, None)
        limits = ExtendedLimits()
        limits.BasicLimitInformation.LimitFlags = 0x00002000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        if (not self.handle
                or not kernel.SetInformationJobObject(self.handle, 9, ctypes.byref(limits), ctypes.sizeof(limits))
                or not kernel.AssignProcessToJobObject(self.handle, wintypes.HANDLE(int(process._handle)))):
            code = ctypes.get_last_error()
            self.close()
            raise PackError(f'Windows process-tree ownership could not be established (system error {code}); QA was stopped.')

    def close(self):
        if self.handle:
            self.kernel.CloseHandle(self.handle)
            self.handle = None

    def resume(self, process_id):
        """Popen closes the primary thread handle; enumerate only this owned PID."""
        import ctypes
        from ctypes import wintypes

        class ThreadEntry(ctypes.Structure):
            _fields_ = [('dwSize', wintypes.DWORD), ('cntUsage', wintypes.DWORD),
                        ('threadID', wintypes.DWORD), ('ownerProcessID', wintypes.DWORD),
                        ('basePriority', wintypes.LONG), ('deltaPriority', wintypes.LONG),
                        ('flags', wintypes.DWORD)]

        kernel = self.kernel
        kernel.CreateToolhelp32Snapshot.argtypes = [wintypes.DWORD, wintypes.DWORD]
        kernel.CreateToolhelp32Snapshot.restype = wintypes.HANDLE
        kernel.Thread32First.argtypes = [wintypes.HANDLE, ctypes.POINTER(ThreadEntry)]
        kernel.Thread32First.restype = wintypes.BOOL
        kernel.Thread32Next.argtypes = [wintypes.HANDLE, ctypes.POINTER(ThreadEntry)]
        kernel.Thread32Next.restype = wintypes.BOOL
        kernel.OpenThread.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        kernel.OpenThread.restype = wintypes.HANDLE
        kernel.ResumeThread.argtypes = [wintypes.HANDLE]
        kernel.ResumeThread.restype = wintypes.DWORD
        snapshot = kernel.CreateToolhelp32Snapshot(0x00000004, 0)  # TH32CS_SNAPTHREAD
        if snapshot == ctypes.c_void_p(-1).value:
            raise PackError('Cannot inspect the owned suspended Java thread; QA was stopped.')
        try:
            entry = ThreadEntry()
            entry.dwSize = ctypes.sizeof(entry)
            present = kernel.Thread32First(snapshot, ctypes.byref(entry))
            while present:
                if entry.ownerProcessID == process_id:
                    handle = kernel.OpenThread(0x0002, False, entry.threadID)  # THREAD_SUSPEND_RESUME
                    if not handle:
                        break
                    try:
                        if kernel.ResumeThread(handle) != 0xFFFFFFFF:
                            return
                    finally:
                        kernel.CloseHandle(handle)
                    break
                entry.dwSize = ctypes.sizeof(entry)
                present = kernel.Thread32Next(snapshot, ctypes.byref(entry))
        finally:
            kernel.CloseHandle(snapshot)
        raise PackError('Cannot resume the owned suspended Java thread; QA was stopped.')


class _Process:
    """Drain pipes continuously, cap disk/memory, and always own process cleanup."""
    def __init__(self, command, cwd, environment, log, observer=None, max_log_bytes=None):
        self.log = Path(log)
        self.log.parent.mkdir(parents=True, exist_ok=True)
        self.environment = environment
        self.observer=observer
        self.sequence=0
        self.max_log_bytes=_MAX_LOG_BYTES if max_log_bytes is None else max_log_bytes
        self.ready = threading.Event()
        self._tail = deque()
        self._tail_bytes = 0
        self._lock = threading.Lock()
        self._written = 0
        self.truncated = False
        self.error = None
        flags = {'creationflags': 0x00000004  # CREATE_SUSPENDED: own the tree before any child code executes.
                 | getattr(subprocess, 'CREATE_NEW_PROCESS_GROUP', 0)
                 | getattr(subprocess, 'CREATE_NO_WINDOW', 0)} if os.name == 'nt' else {'start_new_session': True}
        self.process = subprocess.Popen(command, cwd=str(cwd), env=environment,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            bufsize=0, close_fds=True, **flags)
        self.job = None
        self.thread = threading.Thread(target=self._drain, daemon=True, name='wo-qa-output')
        try:
            if os.name == 'nt':
                self.job = _WindowsJob(self.process)
                self.job.resume(self.process.pid)
            self.thread.start()
        except BaseException:
            _kill_tree(self.process, environment)
            if self.job:
                self.job.close()
            for stream in (self.process.stdin, self.process.stdout):
                if stream:
                    stream.close()
            raise

    def _drain(self):
        scan_tail = b''
        line_tail=b''
        oversized=False
        try:
            with self.log.open('xb') as output:
                while True:
                    chunk = self.process.stdout.read(8192)
                    if not chunk:
                        break
                    scan = scan_tail + chunk
                    if _READY.search(scan):
                        self.ready.set()
                    scan_tail = scan[-1024:]
                    if self.observer is not None:
                        parts=(line_tail+chunk).split(b'\n')
                        for raw in parts[:-1]:
                            self.sequence+=1
                            if not oversized and len(raw)<=16384:
                                self.observer(raw.rstrip(b'\r').decode('utf-8',errors='replace'),self.sequence,time.monotonic())
                            oversized=False
                        line_tail=parts[-1]
                        if len(line_tail)>16384:
                            line_tail=b''; oversized=True
                    remaining = max(0, self.max_log_bytes - self._written)
                    if remaining:
                        written = chunk[:remaining]
                        output.write(written)
                        output.flush()
                        self._written += len(written)
                    if len(chunk) > remaining:
                        self.truncated = True
                    with self._lock:
                        self._tail.append(chunk)
                        self._tail_bytes += len(chunk)
                        while self._tail_bytes > _MAX_CAPTURE_BYTES and len(self._tail) > 1:
                            self._tail_bytes -= len(self._tail.popleft())
        except (OSError, ValueError) as error:
            self.error = type(error).__name__

    def text(self):
        with self._lock:
            return b''.join(self._tail).decode('utf-8', errors='replace')

    def finish_output(self):
        if self.process.poll() is not None:
            self._stop_descendants()
        self.thread.join(timeout=2)
        if self.thread.is_alive():
            self.error = 'OutputPipeNotClosed'
        for stream in (self.process.stdin, self.process.stdout):
            if stream:
                try:
                    stream.close()
                except OSError:
                    pass

    def _stop_descendants(self):
        if self.job:
            self.job.close()
            self.job = None
        elif os.name != 'nt':
            try:
                os.killpg(self.process.pid, signal.SIGKILL)
            except (ProcessLookupError, PermissionError):
                pass

    def close(self):
        if self.process.poll() is None:
            _kill_tree(self.process, self.environment)
        self._stop_descendants()
        self.finish_output()


def _remaining(seconds, deadline):
    return max(0, min(seconds, deadline - time.monotonic())) if deadline is not None else seconds


def _wait(process, seconds, *, ready=False):
    end = time.monotonic() + seconds
    while True:
        if ready and process.ready.is_set():
            return 'ready'
        if process.process.poll() is not None:
            process.thread.join(timeout=1)
            return 'ready' if ready and process.ready.is_set() else 'exited'
        if time.monotonic() >= end:
            return 'timed_out'
        time.sleep(min(0.05, max(0, end - time.monotonic())))


def _command(command, cwd, environment, log, seconds, max_log_bytes=None):
    child = _Process(command, cwd, environment, log,max_log_bytes=max_log_bytes)
    try:
        outcome = _wait(child, seconds)
        if outcome == 'timed_out':
            _kill_tree(child.process, environment)
        child.finish_output()
        if child.error:
            raise PackError(f'Process output capture failed ({child.error}).')
        return {'exit_code': child.process.returncode, 'timed_out': outcome == 'timed_out',
                'logs': child.text(), 'truncated': child.truncated}
    finally:
        child.close()


def _installer(root, lock, cache, offline):
    version = lock.get('neoforge')
    try:
        pin = read_json(safe_path(root, 'qa/tool-lock.json'))['neoforge'][version]
        sha, url = pin['sha256'], pin['url']
    except (PackError, KeyError, TypeError) as error:
        raise PackError(f'No pinned NeoForge installer for {version} in qa/tool-lock.json; add and verify the publisher SHA-256 before QA.') from error
    expected = f'https://maven.neoforged.net/releases/net/neoforged/neoforge/{version}/neoforge-{version}-installer.jar'
    if not isinstance(sha, str) or not re.fullmatch(r'[0-9a-f]{64}', sha) or url != expected:
        raise PackError('NeoForge installer pin must contain a SHA-256 and the exact official versioned Maven installer URL.')
    cache.mkdir(parents=True, exist_ok=True)
    candidate = safe_path(cache, sha + '-installer.jar')
    if candidate.exists():
        if digest(candidate) != sha:
            raise PackError('Cached NeoForge installer SHA-256 mismatch; remove the corrupted cache file and retry.')
        return candidate
    if offline:
        raise PackError('Pinned NeoForge installer is unavailable offline; populate the verified cache with an online run first.')
    fd, temporary = tempfile.mkstemp(prefix='neoforge-download-', dir=cache)
    os.close(fd)
    temporary = Path(temporary)
    try:
        fetch(url, temporary, max_bytes=32 * 1024 * 1024)
        if digest(temporary) != sha:
            raise PackError('Downloaded NeoForge installer SHA-256 mismatch; unverified bytes were rejected.')
        temporary.replace(candidate)
    finally:
        temporary.unlink(missing_ok=True)
    return candidate


def _source_state(root, reports):
    """Record provenance without optional index locks, hooks or user commands."""
    git = shutil.which('git')
    if not git:
        return None, None, {}
    environment = _environment(git, reports)
    base = [git, '--no-optional-locks', '-c', 'core.fsmonitor=false',
            '-c', 'core.untrackedCache=false', '-C', str(root)]
    artifacts = {}
    try:
        revision_log = safe_path(reports, 'source-revision.log')
        revision = _command([*base, 'rev-parse', '--verify', 'HEAD'], reports,
                            environment, revision_log, 5)
        artifacts['source_revision_log'] = str(revision_log)
        commit = revision['logs'].strip()
        if revision['exit_code'] or revision['timed_out'] or not re.fullmatch(r'[0-9a-f]{40,64}', commit):
            return None, None, artifacts
        status_log = safe_path(reports, 'source-status.log')
        status = _command([*base, 'status', '--porcelain=v1', '--untracked-files=normal', '--ignore-submodules=none'],
                          reports, environment, status_log, 5)
        artifacts['source_status_log'] = str(status_log)
        dirty = bool(status['logs'].strip()) if not status['exit_code'] and not status['timed_out'] else None
        return commit, dirty, artifacts
    except (PackError, OSError):
        return None, None, artifacts


def _server_config(destination):
    settings = {'server-ip': '127.0.0.1', 'server-port': '25565', 'online-mode': 'false',
                'level-seed': '424242', 'level-name': 'qa-world', 'view-distance': '6',
                'simulation-distance': '6', 'max-players': '1', 'enable-rcon': 'false',
                'enable-query': 'false', 'motd': 'Disposable Wilderness Odyssey QA',
                'white-list': 'true', 'enforce-whitelist': 'true'}
    write_text(safe_path(destination, 'server.properties'),
               ''.join(f'{key}={value}\n' for key, value in settings.items()))
    write_text(safe_path(destination, 'eula.txt'), 'eula=true\n')


def _java_flags(args):
    flags = [f'-Xms{min(512, args.memory_mb)}M', f'-Xmx{args.memory_mb}M']
    if args.profiling != 'off':
        flags.append('-Xlog:gc*:file=qa-gc.log:time,uptime,level,tags:filecount=3,filesize=8M')
    if args.profiling == 'jfr':
        duration = args.startup_seconds + args.soak_seconds + int(_SHUTDOWN_SECONDS) + 121
        flags.append('-XX:StartFlightRecording=filename=qa-recording.jfr,settings=profile,'
                     f'dumponexit=true,duration={duration}s,maxsize=64m')
    if args.profiling == 'native':
        flags.append('-XX:NativeMemoryTracking=summary')
    return flags


def _sample(child, java, environment, reports, result, started, profiling, deadline, labels=('heap','threads')):
    if profiling == 'off' or child.process.poll() is not None:
        return
    jcmd = Path(java).with_name('jcmd.exe' if os.name == 'nt' else 'jcmd')
    if not jcmd.is_file():
        if 'jcmd unavailable' not in result['diagnostic_limitations']:
            result['diagnostic_limitations'].append('jcmd unavailable')
        return
    number = result.get('diagnostic_commands',0)+1
    result['diagnostic_commands']=number
    sample = {'elapsed_seconds': max(0, time.monotonic() - started)}
    commands = [(key,args) for key,args in [('heap', ['GC.heap_info']), ('threads', ['Thread.print', '-l'])] if key in labels]
    if profiling == 'native' and 'heap' in labels:
        commands.append(('native', ['VM.native_memory', 'summary']))
    for label, arguments in commands:
        if child.process.poll() is not None or _remaining(5, deadline) <= 0:
            break
        filename = f'jcmd-{number}-{label}.log'
        try:
            measured = _command([str(jcmd), str(child.process.pid), *arguments], reports,
                                environment, safe_path(reports, filename), _remaining(5, deadline),max_log_bytes=2*1024**2)
            result['artifacts'][f'jcmd_{number}_{label}'] = str(reports / filename)
            if measured['exit_code'] or measured['timed_out'] or measured['truncated']:
                if len(result['diagnostic_limitations'])<50:
                    result['diagnostic_limitations'].append(f'{filename}: unavailable, timed out or truncated.')
                continue
            if label == 'heap':
                for line in measured['logs'].splitlines():
                    if 'heap' in line.lower():
                        match = re.search(r'\bused\s+(\d+(?:\.\d+)?)\s*([KMGT]?)\b', line, re.I)
                        if match:
                            scale = {'': 1, 'K': 1024, 'M': 1024**2, 'G': 1024**3, 'T': 1024**4}[match[2].upper()]
                            sample['heap_used_bytes'] = int(float(match[1]) * scale)
                            break
            elif label == 'threads':
                result.setdefault('thread_dumps',[]).append({'source':filename,'elapsed_seconds':sample['elapsed_seconds']})
                count = len(re.findall(r'^"[^"\n]+"\s+#\d+', measured['logs'], re.M))
                if count:
                    sample['threads'] = count
        except (PackError, OSError):
            # Optional diagnostics cannot turn unavailable attach tooling into a mod crash.
            if len(result['diagnostic_limitations'])<50:
                result['diagnostic_limitations'].append(f'{filename}: attach unavailable.')
    if len(sample) > 1:
        result['samples'].append(sample)


def _shutdown(child, result, environment):
    started = time.monotonic()
    if child.process.poll() is not None:
        _phase(result, 'shutdown', 'already_exited', started)
        return
    try:
        child.process.stdin.write(b'stop\n')
        child.process.stdin.flush()
    except (OSError, ValueError):
        pass
    if _wait(child, _SHUTDOWN_SECONDS) == 'timed_out':
        _kill_tree(child.process, environment)
        _phase(result, 'shutdown', 'forced', started, 'Graceful stop deadline expired; process tree was forcibly stopped.')
    else:
        _phase(result, 'shutdown', 'succeeded' if child.process.returncode == 0 else 'failed', started)


def _collect_artifacts(destination, reports, result):
    """Allowlist logs and bounded recordings, never worlds, configs or dumps."""
    sources = [('logs/latest.log', 8 * 1024**2)]
    sources += [(path.name, 2 * 1024**2) for path in sorted(destination.glob('hs_err_pid*.log'))[:4]]
    sources += [(path.name, 8 * 1024**2) for path in sorted(destination.glob('qa-gc.log*'))[:4]]
    sources += [(path.relative_to(destination).as_posix(), 1024**2)
                for path in sorted((destination / 'crash-reports').glob('*.txt'))[:4]]
    sources.append(('qa-recording.jfr', 64 * 1024**2))
    for name, limit in sources:
        source = safe_path(destination, name)
        if not source.is_file():
            continue
        if source.suffix == '.jfr' and source.stat().st_size > limit:
            result['coverage'].append('Oversized JFR recording was omitted from report artifacts.')
            continue
        artifact = safe_path(reports, 'artifacts/' + name)
        artifact.parent.mkdir(parents=True, exist_ok=True)
        with source.open('rb') as incoming, artifact.open('xb') as output:
            remaining = limit
            while remaining:
                chunk = incoming.read(min(1024 * 1024, remaining))
                if not chunk:
                    break
                output.write(chunk)
                remaining -= len(chunk)
        result['artifacts'][name] = str(artifact)


def _cleanup_trial(destination):
    # install() granted ownership only after creating this empty external trial.
    # Fixed paths and safe_path reject links before any recursive deletion.
    for name in ('qa-world', 'mods'):
        target = safe_path(destination, name)
        if target.exists():
            if not target.is_dir() or not target.resolve().is_relative_to(destination.resolve()):
                raise PackError('Disposable trial cleanup target is not an owned directory.')
            shutil.rmtree(target)


_SAVE_SECONDS = 120


class _Observation:
    """Runner-owned IO adapter around the pure monitor and optional collectors."""
    def __init__(self,start,args,reports,java,environment,result):
        self.start,self.args,self.reports=start,args,reports
        self.java,self.environment,self.result=java,environment,result
        self.monitor=TrialMonitor(start,start+args.startup_seconds,args.profiling)
        self.guard=threading.RLock()
        self.timeline=EventTimeline(safe_path(reports,'timeline.jsonl'))
        self.timeline_failed=False
        self.child=self.sampler=None
        self.last_verified=False

    def observe(self,line,sequence,now):
        with self.guard:
            self.monitor.observe_line(line,sequence,now)

    def record(self,event):
        if self.timeline_failed: return
        try:
            self.timeline.append(event)
        except (OSError,ValueError,TypeError):
            self.timeline_failed=True
            self.result['diagnostic_limitations'].append('Timeline writing unavailable.')

    def attach(self,child,destination):
        self.child=child
        self.sampler=ResourceSampler(child.process,destination)
        self.result['resource_context']=self.sampler.context()

    def drive(self,seconds,deadline,phase):
        end=time.monotonic()+seconds
        if phase=='startup': end=min(end,self.start+self.args.startup_seconds)
        if deadline is not None: end=min(end,deadline)
        with self.guard:
            if phase=='soak': self.monitor.begin_soak(time.monotonic(),end)
            elif phase=='workload': self.monitor.begin_save(time.monotonic(),end)
            else: self.monitor.deadline=end
        while True:
            now=time.monotonic()
            if self.child.process.poll() is not None:
                self.child.thread.join(timeout=1)
                return 'exited'
            with self.guard:
                state=self.monitor.snapshot()
            if phase=='startup' and state['readiness']['verified']:
                self.record({'event':'console_ready','elapsed_seconds':state['readiness']['verified_seconds']})
                return 'ready'
            if phase=='workload' and state['save']['acknowledged']:
                return 'acknowledged'
            if now>=end: return 'timed_out'
            with self.guard:
                actions=self.monitor.tick(now,True)
            # Fixed console commands are dispatched before potentially slower
            # optional attach work. The reader continues observing independently.
            actions.sort(key=lambda action:action['kind']!='send_command')
            for action in actions:
                if time.monotonic()>=end or self.child.process.poll() is not None: break
                kind=action['kind']
                if kind=='send_command':
                    with self.guard:
                        self.monitor.command_sent(action['operation'],self.child.sequence,time.monotonic())
                        self.child.process.stdin.write((action['text']+'\n').encode('ascii'))
                        self.child.process.stdin.flush()
                    self.record({'event':'console_request','operation':action['operation'],
                                 'phase':phase,'elapsed_seconds':time.monotonic()-self.start})
                elif kind=='sample_resources':
                    row=self.sampler.sample(time.monotonic()-self.start)
                    self.result['resources'].append(row)
                    self.result['samples'].append({key:row.get(key) for key in ('elapsed_seconds','cpu_percent','threads')})
                elif kind in ('sample_heap','capture_threads'):
                    labels=('heap',) if kind=='sample_heap' else ('threads',)
                    _sample(self.child,self.java,self.environment,self.reports,self.result,self.start,
                            self.args.profiling,end,labels=labels)
                    self.record({'event':kind,'reason':action.get('reason'), 'phase':phase,
                                 'elapsed_seconds':time.monotonic()-self.start})
                elif kind=='dump_jfr':
                    # The active explicit JFR recording already has bounded size
                    # and dumponexit. Dump that named recording without stopping it.
                    jcmd=Path(self.java).with_name('jcmd.exe' if os.name=='nt' else 'jcmd')
                    if jcmd.is_file():
                        try:
                            output=_command([str(jcmd),str(self.child.process.pid),'JFR.dump',
                                'filename='+str(self.reports/'incident.jfr'),'maxsize=64m'],self.reports,
                                self.environment,self.reports/'jfr-dump.log',_remaining(5,end),max_log_bytes=65536)
                            if output['timed_out'] or output['exit_code']:
                                self.result['diagnostic_limitations'].append('Incident JFR dump unavailable.')
                        except (PackError,OSError):
                            self.result['diagnostic_limitations'].append('Incident JFR attach unavailable.')
            time.sleep(min(.05,max(0,end-time.monotonic())))

    def close(self):
        with self.guard:
            state=self.monitor.snapshot()
        self.result.update(readiness=state['readiness'],incidents=state['incidents'],save=state['save'])
        info=self.timeline.close()
        self.result['timeline']=info
        self.result['artifacts']['timeline']=str(self.reports/'timeline.jsonl')


def _run_trial(root, lock, args, destination, reports, java, environment, cache, selected=None, deadline=None):
    result = _base_result()
    runtime_temp=tempfile.TemporaryDirectory(prefix='wo-trial-jvm-',dir=Path(args.reports).resolve().parent)
    environment=_environment(java,runtime_temp.name)
    child, installed, active, active_start = None, False, 'validation', time.monotonic()
    timed_out, ready, normal_outcome = False, False, False
    observation=None
    try:
        install(root, lock, destination, side='server', local_mods=args.local_mods,
                cache=cache, offline=args.offline, selected=selected)
        installed = True
        _phase(result, 'validation', 'succeeded', active_start)
        active, active_start = 'setup', time.monotonic()
        installer = _installer(root, lock, cache, args.offline)
        _phase(result, 'setup', 'succeeded', active_start)
        active, active_start = 'installer', time.monotonic()
        installer_log = safe_path(reports, 'installer.log')
        result['artifacts']['installer_log'] = str(installer_log)
        outcome = _command([java, *_jvm_environment_flags(environment), '-jar', str(installer), '--installServer'], destination,
                           environment, installer_log, _remaining(_INSTALLER_SECONDS, deadline))
        result['log_truncated'] |= outcome['truncated']
        if outcome['timed_out'] or outcome['exit_code'] != 0:
            _phase(result, active, 'timed_out' if outcome['timed_out'] else 'failed', active_start)
            raise _StageError('installer_failure', 'The NeoForge installer failed or exceeded its deadline; Minecraft was not launched. Inspect installer.log.')
        _phase(result, active, 'succeeded', active_start)
        argument_file = f'libraries/net/neoforged/neoforge/{lock["neoforge"]}/' + ('win_args.txt' if os.name == 'nt' else 'unix_args.txt')
        if not safe_path(destination, argument_file).is_file():
            raise _StageError('setup_failure', 'NeoForge installer did not produce the official server argument file; Minecraft was not launched.')
        _server_config(destination)
        server_log = safe_path(reports, 'server.log')
        result['artifacts']['server_log'] = str(server_log)
        active, active_start = 'startup', time.monotonic()
        start = active_start
        observation=_Observation(start,args,reports,java,environment,result)
        child = _Process([java, *_jvm_environment_flags(environment), *_java_flags(args), '@' + argument_file, 'nogui'], destination, environment, server_log,observer=observation.observe)
        observation.attach(child,destination)
        outcome = observation.drive(_remaining(args.startup_seconds,deadline),deadline,'startup')
        ready = outcome == 'ready'
        timed_out = outcome == 'timed_out'
        _phase(result, active, 'succeeded' if ready else 'timed_out' if timed_out else 'failed', active_start)
        if ready:
            result['metrics']['startup_seconds'] = result['phases']['startup']['seconds']
            active, active_start = 'soak', time.monotonic()
            # A planned soak of zero still requires a live ready process.
            outcome = observation.drive(_remaining(args.soak_seconds,deadline),deadline,'soak')
            survived = outcome == 'timed_out' and child.process.poll() is None
            exhausted = deadline is not None and time.monotonic() >= deadline
            _phase(result, active, 'succeeded' if survived and not exhausted else 'timed_out' if exhausted else 'failed', active_start)
            timed_out |= exhausted
            if survived and not exhausted and getattr(args,'scenario','startup-soak')=='save-flush':
                active,active_start='workload',time.monotonic()
                outcome=observation.drive(_remaining(_SAVE_SECONDS,deadline),deadline,'workload')
                acknowledged=outcome=='acknowledged'
                _phase(result,active,'succeeded' if acknowledged else 'timed_out' if outcome=='timed_out' else 'failed',active_start)
                if acknowledged:
                    result['metrics']['save_flush_seconds']=observation.monitor.snapshot()['save']['seconds']
                timed_out |= outcome=='timed_out'
        active, active_start = 'shutdown', time.monotonic()
        _shutdown(child, result, environment)
        timed_out |= result['phases']['shutdown']['status'] == 'forced'
        child.finish_output()
        if child.error:
            raise PackError(f'Server output capture failed ({child.error}).')
        diagnostic = classify(child.text(), child.process.returncode, timed_out=timed_out, started=ready)
        # A ready process that exits early with code zero has not passed the soak.
        if diagnostic['category'] == 'success' and result['phases']['soak']['status'] != 'succeeded':
            diagnostic.update(category='inconclusive', message='The server exited before completing the requested idle soak.',
                              next_step='Inspect the soak log and repeat the same bounded workload.')
        workload_failed=(getattr(args,'scenario','startup-soak')=='save-flush'
                         and result['phases']['workload']['status']!='succeeded')
        if workload_failed:
            diagnostic['isolation_eligible']=False
            if diagnostic['category']=='success':
                diagnostic.update(category='inconclusive',message='The controlled save did not acknowledge completion.',
                                  next_step='Inspect workload captures and repeat the same disposable save scenario.')
        shutdown_failed = (result['phases']['soak']['status'] == 'succeeded'
                           and result['phases']['shutdown']['status'] in ('failed', 'forced'))
        if timed_out or shutdown_failed:
            diagnostic['isolation_eligible'] = False
        if shutdown_failed:
            result['coverage'].append('The failure was observed during shutdown; startup/soak subset isolation is unavailable for that phase.')
        result.update(diagnostic)
        result['outcome'] = 'timeout' if timed_out else 'workload_failure' if workload_failed else 'shutdown_failure' if shutdown_failed else getattr(args,'scenario','startup-soak')
        normal_outcome = True
    except KeyboardInterrupt:
        _phase(result, active, 'cancelled', active_start)
        _problem(result, 'cancelled', 'QA was interrupted; active processes were stopped and partial evidence was preserved.')
        result['outcome'] = 'cancelled'
    except _StageError as error:
        _problem(result, error.category, str(error))
    except PackError as error:
        _phase(result, active, 'failed', active_start)
        _problem(result, 'validation_failure' if active == 'validation' else 'setup_failure' if active == 'setup' else 'harness_failure', str(error))
    except Exception as error:
        _phase(result, active, 'failed', active_start)
        _problem(result, 'harness_failure', f'QA harness failed during {active} ({type(error).__name__}); no mod cause is established.')
    finally:
        if child is not None:
            try:
                alive = child.process.poll() is None
                child.close()
                result['log_truncated'] |= child.truncated
                if alive and not normal_outcome:
                    _phase(result, 'shutdown', 'forced', evidence='Interrupted/error trial process tree was stopped.')
            except Exception as error:
                _problem(result, 'harness_failure', f'Process cleanup failed ({type(error).__name__}).')
        if installed:
            try:
                _collect_artifacts(destination, reports, result)
            except (OSError, PackError) as error:
                _problem(result, 'harness_failure', f'Disposable trial artifact collection failed ({type(error).__name__}); inspect its external directory.')
            try:
                _cleanup_trial(destination)
            except (OSError, PackError) as error:
                _problem(result, 'harness_failure', f'Disposable trial cleanup failed ({type(error).__name__}); inspect its external directory.')
        if observation is not None:
            try: observation.close()
            except (OSError,ValueError): result['diagnostic_limitations'].append('Timeline close unavailable.')
        result['memory'] = analyze_memory(result['samples'])
        try:
            evidence=read_evidence(reports)
            evidence['report']=result
            evidence['samples']=result['samples']
            result=analyze_evidence(evidence)
        except (OSError,ValueError,PackError):
            result['diagnostic_limitations'].append('Saved evidence analysis unavailable.')
        result['destination'] = str(destination)
        try:
            runtime_temp.cleanup()
        except OSError:
            _problem(result,'harness_failure','Private runtime temporary-directory cleanup failed; files remain outside the exported reports.')
    return result


def _isolation_graph(lock):
    """Map every known embedded/provider dependency to its containing JAR."""
    mods = [mod for mod in lock['mods'] if mod.get('side') in ('both', 'server')]
    providers, projects = {}, {}
    for mod in mods:
        if (mod.get('issues') or not isinstance(mod.get('requires'), list)
                or not mod.get('provides') or mod.get('conflicts')
                or type(mod.get('essential')) is not bool):
            raise PackError('Isolation is inconclusive: metadata, conflicts or essential decisions require review.')
        for provided in mod['provides']:
            if not provided.get('id') or provided.get('version') in (None, '', 'unknown', '${file.jarVersion}'):
                raise PackError('Isolation is inconclusive: provided mod identities/versions are unknown.')
            if provided['id'] in providers:
                raise PackError('Isolation is inconclusive: multiple JARs provide a dependency; loader selection is ambiguous.')
            providers[provided['id']] = (mod['id'], provided['version'])
        source = mod.get('source', {})
        if source.get('kind') == 'curseforge':
            if not isinstance(source.get('required_projects'), list) or not source.get('project_id'):
                raise PackError('Isolation is inconclusive: provider dependency metadata is incomplete.')
            projects.setdefault(source['project_id'], []).append(mod['id'])
    builtins = {'minecraft': lock.get('minecraft'), 'neoforge': lock.get('neoforge'), 'java': '21'}
    graph = []
    for mod in mods:
        required = set()
        for dep in mod['requires']:
            if dep.get('side', 'both') == 'client':
                continue
            if dep.get('side', 'both') not in ('both', 'server'):
                raise PackError('Isolation is inconclusive: dependency side metadata is unknown.')
            identifier = dep.get('id')
            owner, version = providers.get(identifier, (None, builtins.get(identifier)))
            if version is None or dependency_satisfies(lock, identifier, version, dep.get('version', '*')) is not True:
                raise PackError('Isolation is inconclusive: a dependency or version constraint cannot be proved safe.')
            if owner and owner != mod['id']:
                required.add(owner)
        for project in mod.get('source', {}).get('required_projects', []):
            candidates = projects.get(project, [])
            if len(candidates) != 1:
                raise PackError('Isolation is inconclusive: required provider project has no unambiguous server JAR.')
            if candidates[0] != mod['id']:
                required.add(candidates[0])
        graph.append({'id': mod['id'], 'requires': sorted(required), 'essential': mod['essential']})
    return graph


def _save_report(reports, result):
    result['artifacts'].update(report_json=str(reports / 'report.json'), report_markdown=str(reports / 'report.md'))
    write_json(safe_path(reports, 'samples.json'), result.get('samples', []))
    result['artifacts']['samples'] = str(reports / 'samples.json')
    write_json(safe_path(reports, 'report.json'), result)
    write_text(safe_path(reports, 'report.md'), render_report(result))


def run_qa(root, lock, args) -> dict:
    """Return a diagnostic and persist artifacts for every attempted QA run."""
    root = Path(root).resolve()
    result = _base_result()
    source_commit, dirty, source_artifacts = None, None, {}
    setup_temp=None
    reports, report_error = _report_directory(root, args)
    try:
        if report_error:
            raise _StageError('validation_failure', report_error)
        started = time.monotonic()
        destination, cache = _validate_options(root, args, reports)
        source_commit, dirty, source_artifacts = _source_state(root, reports)
        validation = validate(root, lock, side='server')
        if validation['errors']:
            raise _StageError('validation_failure', 'Static server validation blocked QA: ' + ' / '.join(validation['errors'][:20]))
        _phase(result, 'validation', 'succeeded', started)
        started = time.monotonic()
        java = shutil.which(str(args.java))
        if not java:
            raise _StageError('setup_failure', 'Java executable was not found; provide --java pointing to a Java 21 executable.')
        java = str(Path(java).resolve())
        setup_temp=tempfile.TemporaryDirectory(prefix='wo-setup-jvm-',dir=reports.parent)
        environment = _environment(java, setup_temp.name)
        version_log = safe_path(reports, 'java-version.log')
        version = _command([java, *_jvm_environment_flags(environment), '-version'], reports, environment, version_log, 15)
        result['artifacts']['java_version_log'] = str(version_log)
        match = re.search(r'\b(?:openjdk|java) version "(\d+)(?:\.|\")', version['logs'])
        if version['timed_out'] or version['exit_code'] != 0 or not match or match[1] != '21':
            raise _StageError('setup_failure', 'The selected runtime must report Java major version 21 exactly; inspect java-version.log.')
        _phase(result, 'setup', 'succeeded', started)
        result = _run_trial(root, lock, args, destination, reports, java, environment, cache)
        result['artifacts']['java_version_log'] = str(version_log)
        if args.isolate:
            if not result.get('isolation_eligible'):
                result['isolation'] = {'status': 'stopped', 'test_count': 0, 'remaining_suspects': [],
                    'limitations': ['Only repeated trace-backed uncertain startup/soak crashes can be isolated.']}
            else:
                try:
                    graph = _isolation_graph(lock)
                except (PackError, KeyError, TypeError, ValueError) as error:
                    result['isolation'] = {'status': 'inconclusive', 'test_count': 0, 'remaining_suspects': [],
                        'limitations': [str(error) if isinstance(error, PackError) else 'Dependency metadata could not be resolved safely.']}
                else:
                    from .isolation import isolate
                    deadline, count, cancelled = time.monotonic() + 1800, 0, False
                    def trial(selected):
                        nonlocal count, cancelled
                        count += 1
                        trial_reports = safe_path(reports, f'trials/{count:02d}')
                        trial_reports.mkdir(parents=True, exist_ok=False)
                        trial_destination = Path(tempfile.mkdtemp(prefix='wo-qa-trial-', dir=destination.parent))
                        data = _run_trial(root, lock, args, trial_destination, trial_reports,
                                          java, environment, cache, selected, deadline)
                        cancelled = data.get('category') == 'cancelled'
                        _save_report(trial_reports, data)
                        return data
                    result['isolation'] = isolate(graph, trial, max_tests=args.max_tests - 1,
                                                  repeats=2, budget_seconds=1800, cancelled=lambda: cancelled,
                                                  expected_signature=result['signature'])
                    result['isolation']['limitations'] = [result['isolation']['reason'], result['isolation']['minimality_caveat'],
                        'The first baseline run counts toward --max-tests; only fresh startup/idle-soak scenarios were tested.']
                    if cancelled:
                        result['original_diagnostic'] = {key: result.get(key) for key in ('category', 'signature', 'message')}
                        _problem(result, 'cancelled', 'Isolation was interrupted; no later trials were started and partial evidence was preserved.')
        result['validation_warnings'] = validation.get('warnings', [])[:50]
    except KeyboardInterrupt:
        _problem(result, 'cancelled', 'QA was interrupted; partial evidence was preserved.')
    except _StageError as error:
        failed_phase = 'validation' if error.category == 'validation_failure' else 'setup'
        _phase(result, failed_phase, 'failed', evidence=str(error))
        _problem(result, error.category, str(error))
    except PackError as error:
        _phase(result, 'validation', 'failed', evidence=str(error))
        _problem(result, 'validation_failure', str(error))
    except Exception as error:
        _problem(result, 'harness_failure', f'QA harness failed ({type(error).__name__}); no mod cause is established.')
    finally:
        if setup_temp is not None:
            try:
                setup_temp.cleanup()
            except OSError:
                _problem(result,'harness_failure','Private setup temporary-directory cleanup failed; no temporary files were included in artifacts.')
        result.update(source_commit=source_commit, dirty=dirty)
        result['artifacts'].update(source_artifacts)
        result['context'] = {'scenario': 'startup-soak-v1', 'seed': 424242,
            'minecraft': lock.get('minecraft'), 'neoforge': lock.get('neoforge'), 'java_major': 21,
            'heap_mb': args.memory_mb, 'profiling': args.profiling, 'active_processors':4,
            'startup_timeout_seconds': args.startup_seconds, 'soak_seconds': args.soak_seconds}
        result.setdefault('memory', analyze_memory(result.get('samples', [])))
        try:
            _save_report(reports, result)
        except (OSError, PackError, ValueError, TypeError):
            fallback = Path(tempfile.mkdtemp(prefix='wo-qa-report-recovery-')).resolve()
            _problem(result, 'harness_failure', 'The requested report directory could not be written; evidence is referenced from this recovery report.')
            _save_report(fallback, result)
    return result
