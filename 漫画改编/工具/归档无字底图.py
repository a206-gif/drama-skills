#!/usr/bin/env python3
"""本地归档已生成的8bit静态PNG；无损重压缩，不调用模型/不登记为一次生图。"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def archive_png(source: Path, target: Path, allowed_root: Path = ROOT) -> dict:
    try:
        from PIL import Image
    except ImportError as exc:
        raise ValueError('需要先安装 "Pillow>=10.4,<12"') from exc
    source = source.resolve()
    if target.is_symlink():
        raise ValueError("输出不能是符号链接")
    target = target.resolve()
    try:
        target.relative_to(allowed_root.resolve())
    except ValueError as exc:
        raise ValueError("输出必须在指定项目根目录内") from exc
    if target.exists():
        raise ValueError("输出已存在，不覆盖历史；新版本用新文件名")
    if target.suffix.lower() != ".png":
        raise ValueError("输出必须是PNG")
    if not source.is_file() or source.stat().st_size > 64_000_000:
        raise ValueError("输入缺失或超过64MB上限")
    raw = source.read_bytes()
    if len(raw) < 26 or raw[:8] != b"\x89PNG\r\n\x1a\n" or raw[24] != 8:
        raise ValueError("仅接8bit PNG；16bit/其他格式不静默转换")
    try:
        opened = Image.open(source)
    except Image.DecompressionBombError as exc:
        raise ValueError("图片超过资源上限") from exc
    with opened as image:
        if image.width * image.height > 32_000_000:
            raise ValueError("图片超过3200万像素上限")
        if (image.mode not in {"RGB", "RGBA"} or getattr(image, "n_frames", 1) != 1
                or image.getexif()):
            raise ValueError("仅接无EXIF的静态RGB/RGBA，不静默改色/帧/方向")
        image.load()
        pixels = image.tobytes()
        target.parent.mkdir(parents=True, exist_ok=True)
        fd, name = tempfile.mkstemp(prefix=".art-archive-", suffix=".png", dir=target.parent)
        os.close(fd)
        temporary = Path(name)
        try:
            image.save(temporary, format="PNG", optimize=True)
            with Image.open(temporary) as stored:
                stored.load()
                # Compare all bytes, including hidden RGB in RGBA; getbbox alone can miss them.
                if stored.mode != image.mode or stored.size != image.size or stored.tobytes() != pixels:
                    raise ValueError("重压缩像素发生变化，未交付")
            archived = temporary.read_bytes()
            if target.exists() or target.is_symlink():
                raise ValueError("归档期间目标出现，未覆盖")
            temporary.rename(target)
        finally:
            if temporary.exists():
                temporary.unlink()
        return {"status": "archived", "file": target.relative_to(allowed_root.resolve()).as_posix(),
                "raw_sha256": digest(raw), "raw_bytes": len(raw), "raw_bit_depth": 8,
                "sha256": digest(archived), "bytes": len(archived),
                "size": list(image.size), "mode": image.mode,
                "decoded_pixel_sha256": digest(pixels), "lossless_recompression": True,
                "model_calls_during_archive": 0,
                "note": "只归档既有PNG，不证明内容/授权/调用账单；实际生图另记来源收据"}


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    try:
        result = archive_png(args.source, args.out)
    except (ValueError, OSError) as exc:
        print(json.dumps({"status": "invalid", "error": str(exc)}, ensure_ascii=False))
        return 1
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
