"""Rebuild apps/video/src/sounds/*.ogg from apps/video/sounds.json (see its $comment).

Downloads each CC0 / public-domain source, re-checks its licence, cuts it and normalises it.
Usage: pnpm --filter @banyan/video sounds [id ...]   (needs python3 and ffmpeg)
"""
import io, json, os, subprocess, sys, tempfile, urllib.parse, urllib.request, zipfile, re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "src", "sounds")
UA = {"User-Agent": "banyan-and-beyond-sounds/1.0"}
ENC = ["-ac", "1", "-ar", "48000", "-c:a", "libopus", "-b:a", "64k"]
NORM = "loudnorm=I=-16:TP=-1.5:LRA=11"
OK = ("cc0", "public domain", "pd")


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()


def ffmpeg(*args):
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *args], check=True)


def commons(source, tmp):
    title = urllib.parse.unquote(source.rsplit("/", 1)[1])
    q = urllib.parse.urlencode({"action": "query", "titles": title, "prop": "imageinfo", "iiprop": "url|extmetadata", "format": "json"})
    ii = next(iter(json.loads(get("https://commons.wikimedia.org/w/api.php?" + q))["query"]["pages"].values()))["imageinfo"][0]
    lic = re.sub("<[^>]+>", "", ii["extmetadata"].get("LicenseShortName", {}).get("value", ""))
    if not lic.lower().startswith(OK):
        raise SystemExit(f"{title}: licence is now {lic!r}, not CC0/public domain")
    path = os.path.join(tmp, "src" + os.path.splitext(urllib.parse.urlparse(ii["url"]).path)[1])
    open(path, "wb").write(get(ii["url"]))
    return path


_packs = {}


def kenney(pack, tmp):
    if pack not in _packs:
        page = get(f"https://kenney.nl/assets/{pack}").decode()
        url = re.search(r"https://kenney.nl/media/pages/assets/[^\"]+\.zip", page).group(0)
        z = zipfile.ZipFile(io.BytesIO(get(url)))
        if "Creative Commons Zero" not in z.read("License.txt").decode():
            raise SystemExit(f"kenney {pack}: License.txt no longer says CC0")
        d = os.path.join(tmp, pack)
        z.extractall(d)
        _packs[pack] = d
    return _packs[pack]


def build(sid, spec, tmp):
    out = os.path.join(OUT, f"{sid}.ogg")
    if "kenney" in spec:
        k = spec["kenney"]
        d = kenney(k["pack"], tmp)
        ins = sum([["-i", os.path.join(d, f)] for f in k["files"]], [])
        n = len(k["files"])
        if n == 1:
            ffmpeg(*ins, "-af", NORM, *ENC, out)
        else:
            # one hit after another, `gap` seconds apart (footsteps, knocks)
            graph = "".join(f"[{i}]adelay={int(i * k['gap'] * 1000)}:all=1[d{i}];" for i in range(n))
            graph += "".join(f"[d{i}]" for i in range(n)) + f"amix=inputs={n}:normalize=0,{NORM}"
            ffmpeg(*ins, "-filter_complex", graph, *ENC, out)
    else:
        start, seconds = spec["cut"]
        src = commons(spec["source"], tmp)
        fade = f"afade=t=in:d=0.01,afade=t=out:st={seconds - 0.15:.2f}:d=0.15"
        ffmpeg("-ss", str(start), "-t", str(seconds), "-i", src, "-af", f"{fade},{NORM}", *ENC, out)
    print("built", sid)


def main():
    manifest = json.load(open(os.path.join(ROOT, "sounds.json")))["sounds"]
    only = sys.argv[1:] or list(manifest)
    os.makedirs(OUT, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        for sid in only:
            build(sid, manifest[sid], tmp)


if __name__ == "__main__":
    main()
