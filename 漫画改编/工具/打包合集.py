#!/usr/bin/env python3
"""从锁定清单复现漫画交付包；只读取原PNG，不转码。"""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[2]


def build(output_dir):
    manifest = json.loads((Path(__file__).with_name('合集发布清单.json')).read_text(encoding='utf8'))
    entries = manifest['entries']
    names = [e['name'] for e in entries]
    if len(names) != len(set(names)):
        raise ValueError('清单存在重名')
    if sum(name.endswith('.png') for name in names) != 57:
        raise ValueError('应包含56页正片和1张CG')
    output_dir.mkdir(parents=True, exist_ok=True)
    output = output_dir / manifest['filename']
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for entry in entries:
            if Path(entry['name']).is_absolute() or '..' in Path(entry['name']).parts:
                raise ValueError('非法ZIP路径')
            if 'source' in entry:
                source = (ROOT / entry['source']).resolve()
                source.relative_to(ROOT)
                data = source.read_bytes()
            else:
                data = entry['text'].encode('utf8')
            if hashlib.sha256(data).hexdigest() != entry['sha256']:
                raise ValueError('内容已改变，停止发布：' + entry['name'])
            info = zipfile.ZipInfo(entry['name'], tuple(entry['date_time']))
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=6)
    with zipfile.ZipFile(output) as z:
        if z.testzip() is not None or z.namelist() != names:
            raise ValueError('ZIP完整性检查失败')
        for entry in entries:
            if hashlib.sha256(z.read(entry['name'])).hexdigest() != entry['sha256']:
                raise ValueError('ZIP内容校验失败：' + entry['name'])
    print(f'{output}: {output.stat().st_size} bytes; 57 PNG verified')
    return output


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, required=True)
    args = parser.parse_args()
    build(args.output_dir)
