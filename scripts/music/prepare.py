"""Готовит музыку для плеера сайта.

Читает таблицу channel_tracks.xlsx, берёт только настоящие треки
(audio/mpeg и audio/mp4 с исполнителем и названием, без дублей и без
коротких обрывков), перекодирует в AAC 128 кбит/с (m4a, faststart),
достаёт обложки и пишет tracks.json.

    python -X utf8 scripts/music/prepare.py <channel_tracks.xlsx> [out_dir]

Результат (по умолчанию .music-build/) заливается на сервер в data/music.
Скрипт можно запускать повторно: готовые файлы пропускаются.
"""

import concurrent.futures
import json
import os
import subprocess
import sys
from pathlib import Path

import openpyxl

MIN_SECONDS = 45
BITRATE = "128k"
COVER_SIZE = 320


def seconds(text):
    try:
        parts = [int(p) for p in str(text).split(":")]
    except ValueError:
        return 0
    return sum(v * 60**i for i, v in enumerate(reversed(parts)))


def load_rows(xlsx):
    wb = openpyxl.load_workbook(xlsx, read_only=True)
    rows = list(wb.worksheets[0].iter_rows(values_only=True))
    header, body = rows[0], rows[1:]
    col = {name: i for i, name in enumerate(header)}
    return col, body


def pick(col, body):
    picked = []
    seen = set()
    for r in body:
        if r[col["Тип (mime)"]] not in ("audio/mpeg", "audio/mp4"):
            continue
        if r[col["Дубль (идентичен файлу из #)"]]:
            continue
        if seconds(r[col["Длительность"]]) < MIN_SECONDS:
            continue
        path = r[col["Путь к файлу"]]
        if not path or not os.path.exists(path):
            continue
        title = (r[col["Название"]] or "").strip()
        artist = (r[col["Исполнитель"]] or "").strip()
        if not title:
            # Без тегов в таблице: берём имя файла из Telegram.
            title = Path(str(r[col["Файл в Telegram"]] or "")).stem.replace("_", " ").strip()
        if not title:
            continue
        key = (artist.lower(), title.lower())
        if key in seen:
            continue
        seen.add(key)
        picked.append(
            {
                "id": int(r[col["Msg ID"]]),
                "title": title,
                "artist": artist,
                "duration": seconds(r[col["Длительность"]]),
                "source": path,
                "has_cover": r[col["Аватарка"]] == "Да",
            }
        )
    return picked


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")


def convert(item, out):
    audio = out / "audio" / f"{item['id']}.m4a"
    cover = out / "covers" / f"{item['id']}.jpg"
    if not audio.exists() or audio.stat().st_size == 0:
        tmp = audio.with_suffix(".tmp.m4a")
        res = run(
            [
                "ffmpeg", "-nostdin", "-y", "-v", "error", "-i", item["source"],
                "-vn", "-map_metadata", "-1", "-ac", "2",
                "-c:a", "aac", "-b:a", BITRATE, "-threads", "1",
                "-movflags", "+faststart", str(tmp),
            ]
        )
        if res.returncode != 0 or not tmp.exists():
            tmp.unlink(missing_ok=True)
            return item["id"], False, res.stderr.strip()[:300]
        tmp.replace(audio)
    has_cover = cover.exists() and cover.stat().st_size > 0
    if not has_cover and item["has_cover"]:
        vf = (
            f"scale={COVER_SIZE}:{COVER_SIZE}:force_original_aspect_ratio=increase,"
            f"crop={COVER_SIZE}:{COVER_SIZE}"
        )
        res = run(
            [
                "ffmpeg", "-nostdin", "-y", "-v", "error", "-i", item["source"],
                "-an", "-vf", vf, "-frames:v", "1", "-q:v", "5", str(cover),
            ]
        )
        has_cover = res.returncode == 0 and cover.exists() and cover.stat().st_size > 0
        if not has_cover:
            cover.unlink(missing_ok=True)
    item["cover"] = has_cover
    item["size"] = audio.stat().st_size
    return item["id"], True, ""


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    xlsx = sys.argv[1]
    out = Path(sys.argv[2] if len(sys.argv) > 2 else ".music-build")
    (out / "audio").mkdir(parents=True, exist_ok=True)
    (out / "covers").mkdir(parents=True, exist_ok=True)

    col, body = load_rows(xlsx)
    items = pick(col, body)
    print(f"Треков к обработке: {len(items)}", flush=True)

    workers = max(2, (os.cpu_count() or 4) - 2)
    failed = []
    done = 0
    with concurrent.futures.ThreadPoolExecutor(workers) as pool:
        futures = {pool.submit(convert, it, out): it for it in items}
        for fut in concurrent.futures.as_completed(futures):
            ident, ok, err = fut.result()
            done += 1
            if not ok:
                failed.append(ident)
                print(f"  ! {ident}: {err}", flush=True)
            if done % 25 == 0 or done == len(items):
                print(f"  {done}/{len(items)}", flush=True)

    ok_items = [it for it in items if it.get("size")]
    ok_items.sort(key=lambda it: it["id"])
    catalog = [
        {
            "id": it["id"],
            "title": it["title"],
            "artist": it["artist"],
            "duration": it["duration"],
            "cover": bool(it.get("cover")),
            "size": it["size"],
        }
        for it in ok_items
    ]
    (out / "tracks.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=1), encoding="utf-8")
    total = sum(it["size"] for it in ok_items) / 1e9
    print(f"Готово: {len(catalog)} треков, {total:.2f} ГБ, ошибок: {len(failed)}", flush=True)


if __name__ == "__main__":
    main()
