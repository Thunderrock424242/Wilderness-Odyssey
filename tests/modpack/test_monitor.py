import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

READY = '[12:00:00] [Server thread/INFO] [minecraft/DedicatedServer]: Done (1.234s)! For help, type "help"'
REPLY = '[12:00:01] [Server thread/INFO] [minecraft/MinecraftServer]: There are 0 of a max of 20 players online: '
SAVED = '[12:00:02] [Server thread/INFO] [minecraft/MinecraftServer]: Saved the game'


class MonitorTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(importlib.util.find_spec('tools.modpack.monitor'), 'progress monitor missing')
        from tools.modpack.monitor import TrialMonitor
        self.monitor = TrialMonitor(0, 600, 'basic')

    def prime(self, now=1):
        self.monitor.observe_line(READY, 1, now)
        actions = self.monitor.tick(now, True)
        self.assertTrue(any(a.get('text') == 'list' for a in actions))
        self.monitor.command_sent('heartbeat', 1, now)

    def test_done_without_reply_never_completes_startup(self):
        self.prime()
        self.assertFalse(self.monitor.snapshot()['readiness']['verified'])
        self.assertIsNone(self.monitor.snapshot()['readiness']['verified_seconds'])
        self.assertFalse(any(a['kind'] == 'send_command' for a in self.monitor.tick(2, True)))

    def test_old_or_quoted_list_reply_is_ignored(self):
        self.prime()
        for line, sequence in [(REPLY, 1), ('quoted: '+REPLY, 2),
                               (REPLY.replace('Server thread','Worker'), 3)]:
            self.monitor.observe_line(line, sequence, 2)
        self.assertFalse(self.monitor.snapshot()['readiness']['verified'])
        self.monitor.observe_line(REPLY, 4, 3)
        self.assertTrue(self.monitor.snapshot()['readiness']['verified'])
        self.assertEqual(3, self.monitor.snapshot()['readiness']['verified_seconds'])

    def test_quiet_responsive_server_has_no_incident(self):
        self.prime()
        self.monitor.observe_line(REPLY, 2, 2)
        self.monitor.begin_soak(2, 100)
        for now in (12, 22, 32):
            actions = self.monitor.tick(now, True)
            self.assertTrue(any(a.get('text') == 'list' for a in actions))
            self.monitor.command_sent('heartbeat', now, now)
            self.monitor.observe_line(REPLY, now+1, now+0.1)
        self.assertEqual([], self.monitor.snapshot()['incidents'])

    def test_capture_offsets_and_caps(self):
        self.prime()
        for now, expected in [(10.9,0),(11,1),(21,1),(41,1),(42,0)]:
            actions = self.monitor.tick(now, True)
            self.assertEqual(expected, sum(a['kind']=='capture_threads' for a in actions))
        self.assertEqual(1, len(self.monitor.snapshot()['incidents']))
        self.assertEqual([], self.monitor.tick(601, True))

    def test_startup_checkpoints_are_not_declared_hangs(self):
        for now in (60, 120, 240):
            actions = self.monitor.tick(now, True)
            self.assertEqual(1,sum(a['kind']=='capture_threads' for a in actions))
        self.assertEqual([],self.monitor.snapshot()['incidents'])
        self.prime(241)
        for now in (251,261,281):
            self.monitor.tick(now,True)
        self.assertLessEqual(self.monitor.snapshot()['capture_count'],6)

    def test_save_requires_matching_ack_and_does_not_replace_readiness(self):
        self.prime()
        self.monitor.observe_line(REPLY,2,2)
        self.monitor.begin_save(3,123)
        actions=self.monitor.tick(3,True)
        self.assertTrue(any(a.get('text')=='save-all flush' for a in actions))
        self.monitor.command_sent('save',2,3)
        self.monitor.observe_line(REPLY,3,4)
        self.assertFalse(self.monitor.snapshot()['save']['acknowledged'])
        self.monitor.observe_line(SAVED,4,5)
        self.assertEqual(2,self.monitor.snapshot()['save']['seconds'])

    def test_off_disables_collectors_but_keeps_probe(self):
        from tools.modpack.monitor import TrialMonitor
        self.monitor=TrialMonitor(0,600,'off')
        self.prime()
        self.assertEqual([],self.monitor.tick(50,True))
        self.assertFalse(self.monitor.snapshot()['readiness']['verified'])


class TimelineTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(importlib.util.find_spec('tools.modpack.monitor'), 'timeline missing')

    def test_timeline_caps_real_written_events_and_bytes(self):
        from tools.modpack.monitor import EventTimeline
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'timeline.jsonl'
            timeline=EventTimeline(path,max_events=2,max_bytes=128)
            timeline.append({'event':'one'})
            timeline.append({'event':'two'})
            timeline.append({'event':'three'})
            timeline.append({'event':'x'*20000})
            info=timeline.close()
            rows=[json.loads(line) for line in path.read_text().splitlines()]
            self.assertEqual([{'event':'one'},{'event':'two'}],rows)
            self.assertEqual(2,info['omitted'])
            self.assertLessEqual(path.stat().st_size,128)

    def test_timeline_refuses_existing_output_without_changing_it(self):
        from tools.modpack.monitor import EventTimeline
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'timeline.jsonl'; path.write_text('keep')
            with self.assertRaises((OSError,ValueError)):
                EventTimeline(path)
            self.assertEqual('keep',path.read_text())
