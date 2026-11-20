#!/usr/bin/env python3
"""
Проставляет версии файлам, чтобы браузер не смешивал старые и новые файлы после обновления.

Что делает:
  1. Ссылкам на спрайт иконок (sprite.svg#…) добавляет ?v=<хэш спрайта>.
  2. Стилям в index.html добавляет ?v=<хэш файла>.
  3. Пишет в index.html карту импортов (importmap): каждый модуль src/*.js → src/*.js?v=<хэш>.
     Так браузер скачивает заново только изменившиеся модули.

Запускать перед каждым коммитом:
  python3 tools/stamp.py
"""

import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"
SPRITE = ROOT / "assets/img/icons/sprite.svg"


def short_hash(path: Path) -> str:
    return hashlib.sha1(path.read_bytes()).hexdigest()[:8]


def stamp_sprite_refs(sprite_v: str) -> None:
    pattern = re.compile(r"sprite\.svg(\?v=[0-9a-f]+)?#")
    targets = [INDEX, *sorted((ROOT / "src").rglob("*.js"))]
    for path in targets:
        text = path.read_text(encoding="utf-8")
        new = pattern.sub(f"sprite.svg?v={sprite_v}#", text)
        if new != text:
            path.write_text(new, encoding="utf-8")


def stamp_index() -> None:
    html = INDEX.read_text(encoding="utf-8")

    # Стили
    def css_repl(m: re.Match) -> str:
        rel = m.group(1)
        return f'href="{rel}?v={short_hash(ROOT / rel)}"'

    html = re.sub(r'href="(assets/css/[\w.-]+\.css)(?:\?v=[0-9a-f]+)?"', css_repl, html)

    # Карта импортов для всех модулей
    modules = sorted((ROOT / "src").rglob("*.js"))
    imports = {}
    for m in modules:
        rel = m.relative_to(ROOT).as_posix()
        imports[f"./{rel}"] = f"./{rel}?v={short_hash(m)}"
    block = (
        '<script type="importmap">\n'
        + json.dumps({"imports": imports}, ensure_ascii=False, indent=2)
        + "\n</script>"
    )
    marker = re.compile(r"<!-- importmap:start -->.*?<!-- importmap:end -->", re.S)
    html = marker.sub(f"<!-- importmap:start -->\n{block}\n<!-- importmap:end -->", html)

    # Точка входа
    main = ROOT / "src/main.js"
    html = re.sub(r'src="src/main\.js(?:\?v=[0-9a-f]+)?"', f'src="src/main.js?v={short_hash(main)}"', html)

    INDEX.write_text(html, encoding="utf-8")


if __name__ == "__main__":
    stamp_sprite_refs(short_hash(SPRITE))
    stamp_index()
    print("Версии проставлены")
