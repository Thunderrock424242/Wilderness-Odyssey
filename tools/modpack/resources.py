"""Best-effort counters for an owned process. CPU 100% means one logical CPU."""
import math
import os
from pathlib import Path
import platform
import shutil


FIELDS = ('cpu_time_seconds','cpu_percent','rss_bytes','read_io_bytes','write_io_bytes','threads','free_disk_bytes')


def _linux_stat(text, ticks, page_bytes):
    fields = text[text.rindex(')')+2:].split()
    if len(fields) < 22 or ticks <= 0:
        raise ValueError('Incomplete process stat')
    return {'identity':fields[19],
            'cpu_time_seconds':(int(fields[11])+int(fields[12]))/ticks,
            'rss_bytes':max(0,int(fields[21]))*page_bytes,'threads':int(fields[17])}


def _small_text(path, limit=16384):
    with path.open('rb') as stream:
        data=stream.read(limit+1)
    if len(data)>limit:
        raise ValueError('Oversized process metadata')
    return data.decode('ascii',errors='replace')


def _read_linux(process):
    root=Path('/proc')/str(int(process.pid))
    result=_linux_stat(_small_text(root/'stat'),os.sysconf('SC_CLK_TCK'),os.sysconf('SC_PAGE_SIZE'))
    result.update(read_io_bytes=None,write_io_bytes=None,unavailable={})
    try:
        counters=dict(line.split(':',1) for line in _small_text(root/'io').splitlines() if ':' in line)
        result['read_io_bytes']=int(counters['rchar'])
        result['write_io_bytes']=int(counters['wchar'])
    except (OSError,ValueError,KeyError) as error:
        for key in ('read_io_bytes','write_io_bytes'):
            result['unavailable'][key]=type(error).__name__
    return result


def _read_windows(process):
    import ctypes
    from ctypes import wintypes

    class Memory(ctypes.Structure):
        _fields_=[('cb',wintypes.DWORD),('faults',wintypes.DWORD)]+[
            (key,ctypes.c_size_t) for key in ('peak','working','peak_paged','paged','peak_nonpaged','nonpaged','pagefile','peak_pagefile')]

    class IO(ctypes.Structure):
        _fields_=[(key,ctypes.c_ulonglong) for key in ('read_ops','write_ops','other_ops','read_bytes','write_bytes','other_bytes')]

    kernel=ctypes.WinDLL('kernel32',use_last_error=True)
    psapi=ctypes.WinDLL('psapi',use_last_error=True)
    handle=wintypes.HANDLE(int(process._handle))
    times=kernel.GetProcessTimes
    times.argtypes=[wintypes.HANDLE]+[ctypes.POINTER(wintypes.FILETIME)]*4
    times.restype=wintypes.BOOL
    creation,exit_time,kernel_time,user_time=(wintypes.FILETIME() for _ in range(4))
    if not times(handle,ctypes.byref(creation),ctypes.byref(exit_time),ctypes.byref(kernel_time),ctypes.byref(user_time)):
        raise OSError('Process time unavailable')
    value=lambda item:(item.dwHighDateTime<<32)|item.dwLowDateTime
    result={'identity':str(value(creation)), 'cpu_time_seconds':(value(kernel_time)+value(user_time))/10_000_000,
            'rss_bytes':None,'read_io_bytes':None,'write_io_bytes':None,'threads':None,
            'unavailable':{'threads':'not_available_from_owned_handle'}}
    memory=Memory(); memory.cb=ctypes.sizeof(memory)
    get_memory=psapi.GetProcessMemoryInfo
    get_memory.argtypes=[wintypes.HANDLE,ctypes.POINTER(Memory),wintypes.DWORD]
    get_memory.restype=wintypes.BOOL
    if get_memory(handle,ctypes.byref(memory),memory.cb):
        result['rss_bytes']=int(memory.working)
    else:
        result['unavailable']['rss_bytes']='process_memory_query_failed'
    get_io=kernel.GetProcessIoCounters
    get_io.argtypes=[wintypes.HANDLE,ctypes.POINTER(IO)]; get_io.restype=wintypes.BOOL
    counters=IO()
    if get_io(handle,ctypes.byref(counters)):
        result.update(read_io_bytes=int(counters.read_bytes),write_io_bytes=int(counters.write_bytes))
    else:
        for key in ('read_io_bytes','write_io_bytes'):
            result['unavailable'][key]='process_io_query_failed'
    return result


def _read_process(process):
    if os.name=='nt':
        return _read_windows(process)
    if platform.system()=='Linux':
        return _read_linux(process)
    raise OSError('Unsupported process platform')


def _valid(value):
    return isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value) and value>=0


class ResourceSampler:
    def __init__(self,owned_process,disk_path):
        self.process=owned_process
        self.disk_path=Path(disk_path)
        self.identity=None
        self.previous=None
        self.retired=False

    def context(self):
        return {'os':platform.system(),'os_release':platform.release(),
                'logical_cpus':os.cpu_count(),'cpu_percent_basis':'one_logical_cpu',
                'os_cpu_quota':None,'os_cpu_quota_reason':'not_measured',
                'io_basis':'process_transfer_counters' if os.name=='nt' else 'process_read_write_syscall_bytes'}

    def sample(self,elapsed_seconds):
        result={key:None for key in FIELDS}
        result.update(elapsed_seconds=elapsed_seconds,identity=self.identity,unavailable={})
        try:
            result['free_disk_bytes']=shutil.disk_usage(self.disk_path).free
        except OSError as error:
            result['unavailable']['free_disk_bytes']=type(error).__name__
        if self.process.poll() is not None:
            result['unavailable']['process']='process_exited'
            return result
        if self.retired:
            result['unavailable']['process']='process_identity_changed'
            return result
        try:
            raw=_read_process(self.process)
            if self.process.poll() is not None:
                result['unavailable']['process']='process_exited'
                return result
        except (OSError,ValueError,KeyError,AttributeError) as error:
            result['unavailable']['process']=type(error).__name__
            return result
        identity=raw.get('identity')
        if not identity:
            result['unavailable']['process']='process_identity_unavailable'
            return result
        if self.identity is not None and identity!=self.identity:
            self.retired=True
            result['unavailable']['process']='process_identity_changed'
            return result
        self.identity=identity
        result['identity']=identity
        result['unavailable'].update(raw.get('unavailable',{}))
        for key in FIELDS:
            if key in raw and _valid(raw[key]):
                result[key]=raw[key]
            elif key not in ('free_disk_bytes','cpu_percent'):
                result['unavailable'].setdefault(key,'not_measured')
        cpu=result['cpu_time_seconds']
        previous=self.previous
        if previous and _valid(cpu) and _valid(elapsed_seconds):
            duration=elapsed_seconds-previous[0]
            delta=cpu-previous[1]
            if duration>0 and delta>=0:
                result['cpu_percent']=100*delta/duration
            else:
                result['unavailable']['cpu_percent']='clock_not_advanced' if duration<=0 else 'cpu_counter_reset'
        else:
            result['unavailable']['cpu_percent']='initial_or_missing_sample'
        if _valid(cpu) and _valid(elapsed_seconds) and (not previous or elapsed_seconds>previous[0]):
            self.previous=(elapsed_seconds,cpu)
        return result
