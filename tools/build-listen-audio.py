#!/usr/bin/env python3
"""Builds the recorded tracks for Listen → Pocket mode (macOS only: uses `say` and `afconvert`).

For every practice block it writes assets/audio/listen/block-N.m4a with, per word:
    Chinese word → pause to guess → English meaning → short gap
plus assets/audio/listen/manifest.json with the time of each part, so the app can show the
Hanzi, pinyin and meaning in sync while the track plays (also with the screen locked).

Usage:
    python3 tools/build-listen-audio.py                 # best installed voices (Premium first)
    python3 tools/build-listen-audio.py --pause 3 --repeat 2
    python3 tools/build-listen-audio.py --zh-voice Meijia --allow-any-zh

Mainland voices are installed in System Settings → Accessibility → Spoken Content →
System voice → Manage Voices → Chinese (China mainland).
"""
import argparse, json, re, subprocess, sys, tempfile, wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'audio' / 'listen'
RATE = 22050


def load_js_json(path, name):
    text = (ROOT / path).read_text(encoding='utf-8')
    start = text.index(f'window.{name} = ') + len(f'window.{name} = ')
    return json.JSONDecoder().raw_decode(text[start:])[0]


def load_blocks():
    text = (ROOT / 'js' / 'practice-data.js').read_text(encoding='utf-8')
    blocks = []
    for m in re.finditer(r"id:\s*(\d+),\s*title:\s*'([^']*)'.*?words:\s*\[([\d,\s]+)\]", text, re.S):
        blocks.append({'id': int(m.group(1)), 'title': m.group(2), 'words': [int(x) for x in m.group(3).split(',')]})
    return blocks


def voices():
    out = subprocess.run(['say', '-v', '?'], capture_output=True, text=True, check=True).stdout
    found = []
    for line in out.splitlines():
        m = re.match(r'^(.+?)\s+([a-z]{2}_[A-Z0-9]+)\s+#', line)
        if m:
            found.append((m.group(1).strip(), m.group(2)))
    return found


def spoken_english(en):
    s = re.sub(r'\s*[/;]\s*', ', ', en)
    s = re.sub(r'\s*\(\s*', ', ', s).replace(')', '').replace('…', '')
    s = re.sub(r'(,\s*)+', ', ', s)
    return s.strip(' ,')


def speak(text, voice, rate, tmp):
    path = Path(tmp) / 'seg.wav'
    subprocess.run(['say', '-v', voice, '-r', str(rate), '-o', str(path),
                    '--file-format=WAVE', f'--data-format=LEI16@{RATE}', text], check=True)
    with wave.open(str(path)) as w:
        return w.readframes(w.getnframes())


def silence(seconds):
    return b'\x00\x00' * int(RATE * seconds)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--zh-voice', help='Chinese voice name (default: best zh_CN voice installed)')
    ap.add_argument('--en-voice', help='English voice name (default: best en_US voice installed)')
    ap.add_argument('--allow-any-zh', action='store_true', help='accept a non-mainland Chinese voice (zh_TW, zh_HK)')
    ap.add_argument('--pause', type=float, default=2.0, help='seconds to guess (default 2)')
    ap.add_argument('--repeat', type=int, default=1, help='times the Chinese word is said (default 1)')
    ap.add_argument('--zh-rate', type=int, default=150)
    ap.add_argument('--en-rate', type=int, default=175)
    ap.add_argument('--blocks', help='comma-separated block ids (default: all)')
    args = ap.parse_args()

    installed = voices()
    # Premium / Enhanced voices sound far more natural than the basic ones.
    best = lambda lang: next((n for q in ('(Premium)', '(Enhanced)', '') for n, l in installed if l == lang and q in n), None)
    zh = args.zh_voice or best('zh_CN')
    args.en_voice = args.en_voice or best('en_US') or 'Samantha'
    lang = dict(installed).get(zh)
    if not zh or not lang or not lang.startswith('zh'):
        sys.exit('No Chinese (China mainland) voice installed. Install Tingting or Lili, or pass --zh-voice.')
    if lang != 'zh_CN' and not args.allow_any_zh:
        sys.exit(f'{zh} is a {lang} voice (not mainland). Pass --allow-any-zh to use it anyway.')

    words = {w['n']: w for w in load_js_json('js/data.js', 'WORDS')}
    meta = load_js_json('js/learning-data.js', 'LEARNING_META')
    blocks = load_blocks()
    wanted = {int(x) for x in args.blocks.split(',')} if args.blocks else None
    OUT.mkdir(parents=True, exist_ok=True)
    manifest_path = OUT / 'manifest.json'
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {'blocks': {}}
    manifest.update({'version': int(manifest.get('version', 0)) + 1, 'zhVoice': zh, 'enVoice': args.en_voice,
                     'pause': args.pause, 'repeat': args.repeat})

    with tempfile.TemporaryDirectory() as tmp:
        for b in blocks:
            if wanted and b['id'] not in wanted:
                continue
            frames, cues = [silence(0.6)], []
            pos = lambda: sum(len(f) for f in frames) / 2 / RATE
            for n in b['words']:
                w = words[n]
                hanzi = w['hanzi'].split('（')[0]
                cue = {'n': n, 'start': round(pos(), 3)}
                for r in range(args.repeat):
                    frames.append(speak(hanzi, zh, args.zh_rate, tmp))
                    if r < args.repeat - 1:
                        frames.append(silence(0.5))
                cue['thinkAt'] = round(pos(), 3)
                frames.append(silence(args.pause))
                cue['meaningAt'] = round(pos(), 3)
                frames.append(speak(spoken_english(meta[str(n)]['en']), args.en_voice, args.en_rate, tmp))
                frames.append(silence(0.9))
                cues.append(cue)
            wav = Path(tmp) / f'block-{b["id"]}.wav'
            with wave.open(str(wav), 'wb') as out:
                out.setnchannels(1); out.setsampwidth(2); out.setframerate(RATE)
                out.writeframes(b''.join(frames))
            m4a = OUT / f'block-{b["id"]}.m4a'
            subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', '-b', '48000', str(wav), str(m4a)], check=True)
            manifest['blocks'][str(b['id'])] = {'file': m4a.name, 'title': b['title'], 'duration': round(pos(), 2), 'cues': cues}
            print(f'block {b["id"]}: {len(cues)} words, {pos() / 60:.1f} min → {m4a.relative_to(ROOT)}')

    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'manifest → {manifest_path.relative_to(ROOT)} (voices: {zh} / {args.en_voice})')


if __name__ == '__main__':
    main()
