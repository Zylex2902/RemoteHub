#!/usr/bin/env python3
"""Makes site/app/ldraw/parts.pack: the LDraw parts the building-guide viewer can show.

Usage: python3 tools/ldraw_pack.py path/to/complete.zip
complete.zip is the official LDraw parts library (https://library.ldraw.org/library/updates/complete.zip),
licensed CC BY 2.0 / CC BY 4.0 (see its CAreadme.txt); it is not stored in this repository.

The pack holds the parts a SPIKE robot is mostly built from (Technic, the Powered Up electronics,
wheels and tyres, and common bricks, plates and tiles), plus every subpart and primitive they use
and the colour table. Format: one text file of sections "0 FILE <name as referenced>\n<file>",
gzip-compressed; the first section is LDConfig.ldr. Anything not in the pack shows as a grey block.
"""
import gzip, re, sys, zipfile
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "site" / "app" / "ldraw" / "parts.pack"

KEEP = re.compile(
    r"^(Technic |Electric Powered Up |Wheel |Tyre |"
    r"Brick  ?[12] x  ?\d |Brick  ?[12] x  ?\d$|Plate  ?[12] x  ?\d|Tile  ?[12] x  ?\d|"
    r"Brick  ?[12] x  ?[12] Round|Plate  ?[12] x  ?[12] Round|Tile  ?[12] x  ?[12] Round|"
    r"Slope Brick 45  ?2 x  ?[1-4]|Plate  ?2 x  ?2 Corner|Brick  ?1 x  ?[12] with Pin|Brick  ?1 x  ?\d+ with Hole)")


def main(zip_path):
    z = zipfile.ZipFile(zip_path)
    files = {}   # name as referenced (parts/ first, then p/) -> zip entry
    for info in z.infolist():
        n = info.filename.replace("\\", "/")
        low = n.lower()
        if info.is_dir() or not low.endswith(".dat") or not low.startswith("ldraw/"):
            continue
        rel = low[len("ldraw/"):]
        if rel.startswith("parts/"):
            files.setdefault(rel[len("parts/"):], info)
    for info in z.infolist():
        low = info.filename.replace("\\", "/").lower()
        if low.startswith("ldraw/p/") and low.endswith(".dat"):
            files.setdefault(low[len("ldraw/p/"):], info)
    text = {}
    def read(name):
        if name not in text:
            text[name] = z.read(files[name]).decode("utf-8", "replace").replace("\r\n", "\n")
        return text[name]
    roots = []
    for name in files:
        if "/" in name:
            continue   # subparts (s/) and primitives come in through the closure
        first = read(name).split("\n", 1)[0][2:].strip()
        if first.startswith(("~", "=", "_", "|")) or "Sticker" in first:
            continue
        spike = re.search(r"^0 !KEYWORDS.*Spike", read(name)[:1500], re.M | re.I)
        # printed variants are mostly decoration; keep them only when they belong to a SPIKE set
        if spike or (KEEP.match(first) and "Pattern" not in first and "Sticker" not in first):
            roots.append(name)
    roots += [n for n in ("box.dat",) if n in files]   # the grey stand-in block for parts not in the pack
    keep, stack = set(), list(roots)
    while stack:
        name = stack.pop()
        if name in keep:
            continue
        keep.add(name)
        for line in read(name).split("\n"):
            t = line.split()
            if len(t) >= 15 and t[0] == "1":
                ref = " ".join(t[14:]).lower().replace("\\", "/")
                if ref in files and ref not in keep:
                    stack.append(ref)
    ldconfig = z.read("ldraw/LDConfig.ldr").decode("utf-8", "replace").replace("\r\n", "\n")
    parts = ["0 FILE ldconfig.ldr\n" + ldconfig.strip() + "\n"]
    for name in sorted(keep):
        parts.append("0 FILE " + name + "\n" + read(name).strip() + "\n")
    raw = "".join(parts).encode("utf-8")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    # mtime=0: the same library gives the same bytes
    OUT.write_bytes(gzip.compress(raw, 9, mtime=0))
    print(f"{OUT.relative_to(OUT.parent.parent.parent.parent)}: {len(roots)} parts, {len(keep)} files, "
          f"{len(raw) / 1e6:.1f} MB raw, {OUT.stat().st_size / 1e6:.1f} MB gzip")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
