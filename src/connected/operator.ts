import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { parseArgs } from 'node:util';
import { roleSchema } from '../contracts/v1/admin';
import { ConnectedStore } from './store';
export function backupDatabase(source: string, destination: string): void {
  source = path.resolve(source); destination = path.resolve(destination);
  if (!fs.existsSync(source) || fs.statSync(source).size === 0) throw new Error('Source database does not exist.');
  if (source === destination || fs.existsSync(destination)) throw new Error('Choose a new backup destination. Existing files are never overwritten.');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const db = new DatabaseSync(source);
  try { db.exec('PRAGMA busy_timeout=5000'); db.prepare('VACUUM INTO ?').run(destination); } finally { db.close(); }
  verifyDatabase(destination);
}
export function verifyDatabase(file: string): void {
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) throw new Error('Database does not exist.');
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const rows = db.prepare('PRAGMA integrity_check').all() as { integrity_check: string }[];
    if (rows.length !== 1 || rows[0]!.integrity_check !== 'ok') throw new Error('Database integrity check failed.');
  } finally { db.close(); }
}
function main(): void {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { database: { type: 'string' }, output: { type: 'string' }, issuer: { type: 'string' }, subject: { type: 'string' }, role: { type: 'string' }, name: { type: 'string' }, operator: { type: 'string' } } });
  const action = positionals[0];
  if (!values.database || positionals.length !== 1) throw new Error('Usage: connected:operator <backup|verify|grant|revoke> --database <path> [--output <new file>] [--issuer <issuer> --subject <subject> --role <role> --name <name> --operator <operator>]');
  if (action === 'backup') { if (!values.output) throw new Error('A new backup path is required.'); backupDatabase(values.database, values.output); }
  else if (action === 'verify') verifyDatabase(values.database);
  else if (action === 'grant' || action === 'revoke') {
    verifyDatabase(values.database);
    if (!values.issuer || !values.subject || !values.operator || values.subject.length > 200 || values.operator.length > 100 || !/^(discord|https:\/\/[a-z0-9-]+\.cloudflareaccess\.com)$/.test(values.issuer)) throw new Error('Specify the verified issuer, subject, and local operator.');
    const db = new DatabaseSync(values.database);
    try {
      db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');
      const store = new ConnectedStore(db);
      if (action === 'grant') store.assign(values.issuer, values.subject, roleSchema.parse(values.role), (values.name ?? 'Staff member').slice(0, 100), values.operator);
      else store.transaction(() => {
        db.prepare('UPDATE cs_staff SET active=0 WHERE issuer=? AND subject=?').run(values.issuer!, values.subject!);
        store.audit(values.operator!, 'staff.revoke', values.issuer + '|' + values.subject, 'succeeded');
      });
    } finally { db.close(); }
  } else throw new Error('Unknown operator action.');
  process.stdout.write('Completed ' + action + '.\n');
}
if (require.main === module) {
  try { main(); } catch (error) { process.stderr.write((error instanceof Error ? error.message : 'Operation failed.') + '\n'); process.exitCode = 1; }
}
