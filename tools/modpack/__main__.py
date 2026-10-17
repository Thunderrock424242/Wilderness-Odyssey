"""Run from the repository root: py -3.11 -m tools.modpack --help."""
import argparse
import json
import os
from pathlib import Path
import shutil
import sys

from .common import PackError, digest, outside_repo, read_json, safe_path, write_json, write_text
from .pack import asset_paths, generate, validate
from .sync import changes, config_changes, scan_profile


def _report(folder, name, data):
    folder = Path(folder)
    folder.mkdir(parents=True,exist_ok=True)
    write_json(folder/(name+'.json'),data)
    return folder/(name+'.json')


def _validation_md(result):
    status = 'PASS (static checks only)' if result['ready'] else 'BLOCKED'
    lines = [f'# Modpack validation: {status}', '', result.get('coverage',''), '',
             f'Mod files: {result.get("mod_files",0)}', '', '## Failures', '']
    lines.extend('- '+e.replace('`','\\`').replace('\n',' ') for e in result['errors'])
    if not result['errors']:
        lines.append('None.')
    lines.extend(['','## Warnings and unverified coverage',''])
    lines.extend('- '+w.replace('`','\\`').replace('\n',' ') for w in result['warnings'])
    return '\n'.join(lines)+'\n'


def main(argv=None):
    parser = argparse.ArgumentParser(description='Safe local import, pinned packwiz metadata, disposable QA; never writes a live profile.')
    parser.add_argument('--root',type=Path,default=Path.cwd())
    sub = parser.add_subparsers(dest='command',required=True)
    sync = sub.add_parser('sync',help='Read current installed CurseForge profile; dry-run unless --apply.')
    sync.add_argument('--profile',type=Path,required=True)
    sync.add_argument('--apply',action='store_true')
    sync.add_argument('--copy-new-configs',action='store_true',help='Copy safe missing config/defaultconfigs/kubejs/scripts/datapacks files only. Existing files and third-party asset archives are never overwritten/copied.')
    sync.add_argument('--reports',type=Path,required=True)
    sync.add_argument('--pack-version',help='Deliberate release version; does not select mod updates.')
    sub.add_parser('reindex',help='Regenerate packwiz files after reviewed inventory/custom-content edits.')
    loader = sub.add_parser('loader',help='Check/pin stable NeoForge for Minecraft 1.21.1 from official metadata; dry-run unless --apply.')
    selection = loader.add_mutually_exclusive_group(required=True)
    selection.add_argument('--latest',action='store_true')
    selection.add_argument('--version',help='Exact stable NeoForge 21.1.x version.')
    loader.add_argument('--apply',action='store_true')
    loader.add_argument('--reports',type=Path,required=True)
    check = sub.add_parser('validate')
    check.add_argument('--side',choices=['client','server'],default='client')
    check.add_argument('--require-downloads',action='store_true')
    check.add_argument('--reports',type=Path,required=True)
    for name in ('install','qa'):
        cmd = sub.add_parser(name)
        cmd.add_argument('--destination',type=Path,required=True)
        cmd.add_argument('--local-mods',type=Path)
        cmd.add_argument('--cache',type=Path)
        cmd.add_argument('--offline',action='store_true')
        if name == 'install':
            cmd.add_argument('--side',choices=['client','server'],default='client')
        else:
            cmd.add_argument('--accept-eula',action='store_true')
            cmd.add_argument('--java',default='java')
            cmd.add_argument('--memory-mb',type=int,default=4096)
            cmd.add_argument('--startup-seconds',type=int,default=600)
            cmd.add_argument('--soak-seconds',type=int,default=120)
            cmd.add_argument('--profiling',choices=['off','basic','jfr','native'],default='basic')
            cmd.add_argument('--isolate',action='store_true')
            cmd.add_argument('--max-tests',type=int,default=12)
            cmd.add_argument('--reports',type=Path,required=True)
    release = sub.add_parser('package')
    release.add_argument('--output',type=Path,required=True)
    release.add_argument('--local-mods',type=Path,help='Read exact private API bytes from this directory; never upload or commit them.')
    release.add_argument('--include-owned-api',action='store_true',help='Explicitly authorize bundling your own pinned Wilderness Odyssey API in this local ZIP. Other manual mods remain blocked.')
    audit = sub.add_parser('audit-repository')
    audit.add_argument('--reports',type=Path,required=True)
    diff = sub.add_parser('compare',help='Compare compatible actual QA reports with an explicitly recorded baseline.')
    diff.add_argument('--current',type=Path,required=True)
    diff.add_argument('--baseline',type=Path,required=True)
    diff.add_argument('--reports',type=Path,required=True)
    baseline = sub.add_parser('baseline',help='Deliberately record a successful report summary; never called by CI.')
    baseline.add_argument('--candidate',type=Path,required=True)
    baseline.add_argument('--name',required=True,help='New baseline name using lowercase letters/digits/hyphens.')
    args = parser.parse_args(argv)
    root = args.root.resolve()
    try:
        lock_path = safe_path(root,'modpack/lock.json')
        lock = read_json(lock_path) if lock_path.exists() else None
        if hasattr(args,'reports') and args.command != 'qa':
            args.reports = outside_repo(root,args.reports)
        if args.command == 'compare':
            from .regression import compare
            data=compare(read_json(args.current),read_json(args.baseline))
            _report(args.reports,'comparison',data)
            print(json.dumps(data,indent=2))
        elif args.command == 'baseline':
            import re
            from .regression import baseline_from
            if not re.fullmatch('[a-z0-9-]+',args.name):
                raise PackError('Invalid baseline name.')
            report = read_json(args.candidate)
            commit=report.get('source_commit','')
            data=baseline_from(report,commit)
            output=safe_path(root,'qa/baselines/'+args.name+'.json')
            if output.exists():
                raise PackError('Baseline name exists; choose a new reviewed baseline name.')
            write_json(output,data)
            print(f'Baseline summary written: {output}. Review and commit deliberately; CI never promotes baselines.')
        elif args.command == 'sync':
            profile = args.profile.resolve()
            if root.is_relative_to(profile) or profile.is_relative_to(root):
                raise PackError('Repository and live profile must be disjoint directories.')
            if args.reports.is_relative_to(profile) or profile.is_relative_to(args.reports):
                raise PackError('Report directory and live profile must be disjoint.')
            review_path = root/'modpack/review.json'
            reviews = read_json(review_path) if review_path.exists() else {}
            scanned = scan_profile(profile,reviews=reviews,previous=lock)
            if args.pack_version:
                scanned['version'] = args.pack_version
            delta = changes(lock,scanned)
            delta['custom_content'] = config_changes(root,profile)
            delta['applied'] = args.apply
            delta['profile_writes'] = 0
            from .pack import PRIVATE_NAMES, SECRET
            copied = []
            if args.copy_new_configs and not args.apply:
                raise PackError('--copy-new-configs requires --apply; dry-run never changes repository content.')
            if args.copy_new_configs:
                for entry in delta['custom_content']:
                    name = entry['file']
                    if entry['status'] != 'new' or name.split('/')[0] not in ('config','defaultconfigs','kubejs','scripts','datapacks') or name not in asset_paths(root,[name]) or PRIVATE_NAMES.search(name):
                        continue
                    source, target = safe_path(profile,name), safe_path(root,name)
                    if source.stat().st_size > 8*1024*1024 or source.suffix.lower() in ('.jar','.zip'):
                        continue
                    if SECRET.search(source.read_text(encoding='utf-8',errors='replace')):
                        continue
                    target.parent.mkdir(parents=True,exist_ok=True)
                    with target.open('xb') as output, source.open('rb') as incoming:
                        shutil.copyfileobj(incoming,output)
                    copied.append(name)
            if args.apply:
                # Existing custom configuration paths are never replaced.
                write_json(lock_path,scanned)
                assets = sorted(set(asset_paths(root)+copied))
                generate(root,scanned,assets)
            delta['copied_new_custom_files'] = copied
            _report(args.reports,'sync',delta)
            lines = ['# Local profile sync', '', f'Applied: {args.apply}; live-profile writes: 0.',
                     f'Minecraft {scanned["minecraft"]}; NeoForge {scanned["neoforge"]}.', '']
            for key in ('added','updated','removed','unresolved'):
                lines += [f'## {key.title()} ({len(delta[key])})', '', ', '.join(delta[key]) or 'None.', '']
            lines += [f'Custom content differences: {len(delta["custom_content"])}. Existing files were preserved.',
                      'Review sync.json for paths; no private profile metadata or JAR bytes were exported.']
            write_text(safe_path(args.reports,'sync.md'),'\n'.join(lines)+'\n')
            print(json.dumps({k:len(delta[k]) for k in ('added','updated','removed','unresolved')}))
            print(f'Applied: {args.apply}; NeoForge {scanned["neoforge"]}; reports: {args.reports}; live-profile writes: 0.')
        elif args.command == 'audit-repository':
            from .repository import audit_repository
            data = audit_repository(root)
            _report(args.reports,'repository',data)
            print(json.dumps(data,indent=2))
            return 1 if data['errors'] else 0
        elif lock is None:
            raise PackError('No inventory; run sync --profile ... --reports ... --apply first.')
        elif args.command == 'reindex':
            generate(root,lock)
            print('Regenerated pinned packwiz view. Run validate before installation or packaging.')
        elif args.command == 'loader':
            from .loader import check_loader
            data=check_loader(root,lock,latest=args.latest,version=args.version,apply=args.apply)
            _report(args.reports,'loader',data)
            print(json.dumps(data,indent=2))
        elif args.command == 'validate':
            data = validate(root,lock,args.side,args.require_downloads)
            _report(args.reports,'validation',data)
            markdown = _validation_md(data)
            write_text(safe_path(args.reports,'validation.md'),markdown)
            print(markdown)
            if os.environ.get('GITHUB_STEP_SUMMARY'):
                with open(os.environ['GITHUB_STEP_SUMMARY'],'a',encoding='utf-8') as stream:
                    stream.write(markdown)
            return 1 if data['errors'] else 0
        elif args.command == 'install':
            from .install import install
            print(json.dumps(install(root,lock,args.destination,args.side,args.local_mods,args.cache,args.offline),indent=2))
        elif args.command == 'package':
            from .release import package
            print(json.dumps(package(root,lock,args.output,local_mods=args.local_mods,include_owned_api=args.include_owned_api),indent=2))
        elif args.command == 'qa':
            from .runner import run_qa
            data = run_qa(root,lock,args)
            print(json.dumps({'category':data['category'],'phases':data.get('phases',{})},indent=2))
            return 0 if data['category'] == 'success' else 1
        return 0
    except (PackError,OSError,ValueError,KeyError,TypeError) as exc:
        print(f'Modpack command blocked: {exc}',file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
