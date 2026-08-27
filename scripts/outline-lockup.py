"""
Clear View - convert the live <text> in the lockups to outlines.

    python scripts/outline-lockup.py

The lockup SVGs set the wordmark as real <text> in Geist so it stays editable.
That is right for the web, but a rasteriser only renders it correctly if Geist
is installed on the machine doing the rendering - otherwise it silently falls
back to Arial and the "logo" ships in the wrong typeface.

So before making PNGs, the type is converted to paths here, straight from the
project's own font file. The result depends on no installed font at all and is
identical on every machine.

Kerning is not applied: both strings are all-caps with explicit letter-spacing,
where pair kerning is negligible. Advance widths and the variable weight axis
ARE applied, which is what actually determines the shapes and the fit.

Inputs   assets/fonts/geist-latin-var.woff2
         assets/brand/logo-stacked.svg, logo-stacked-reverse.svg, logo-lockup.svg
Output   assets/design/outlined-<name>.svg
"""
import re
import io
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen

WOFF2 = "assets/fonts/geist-latin-var.woff2"
OUT_DIR = Path("assets/design")
SOURCES = ["logo-stacked.svg", "logo-stacked-reverse.svg", "logo-lockup.svg"]

# One instance per weight the lockups actually use.
_cache = {}


def instance(weight):
    if weight not in _cache:
        f = TTFont(WOFF2)
        f.flavor = None
        _cache[weight] = instancer.instantiateVariableFont(f, {"wght": weight})
    return _cache[weight]


def outline(text, size, weight, x, y, anchor, spacing, fill):
    """Return an SVG <g> of paths for `text`, positioned the way the browser
    would position the equivalent <text> element."""
    font = instance(weight)
    upem = font["head"].unitsPerEm
    cmap = font.getBestCmap()
    hmtx = font["hmtx"]
    glyphs = font.getGlyphSet()
    scale = size / upem

    names, advances = [], []
    for ch in text:
        name = cmap.get(ord(ch))
        if name is None:
            raise SystemExit("no glyph for %r - the subset is missing a character" % ch)
        names.append(name)
        # CSS letter-spacing is added after every character, the last included.
        advances.append(hmtx[name][0] * scale + spacing)

    total = sum(advances)
    if anchor == "middle":
        pen_x = x - total / 2
    elif anchor == "end":
        pen_x = x - total
    else:
        pen_x = x

    parts = []
    for name, adv in zip(names, advances):
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(pen)
        d = pen.getCommands()
        if d:  # a space has no contours
            # Fonts are y-up, SVG is y-down: flip about the baseline.
            parts.append(
                '<path transform="translate(%.4f %.4f) scale(%.6f %.6f)" d="%s"/>'
                % (pen_x, y, scale, -scale, d)
            )
        pen_x += adv

    # The right edge of the last glyph's advance, minus the trailing
    # letter-spacing, which is blank.
    right = pen_x - spacing
    left = (x - total / 2) if anchor == "middle" else (x - total if anchor == "end" else x)
    return '<g fill="%s">%s</g>' % (fill, "".join(parts)), left, right


TEXT_RE = re.compile(r"<text\b([^>]*)>(.*?)</text>", re.S)
ATTR_RE = re.compile(r'([\w-]+)="([^"]*)"')


def convert(path):
    svg = Path(path).read_text(encoding="utf-8")
    count = 0

    extents = []

    def repl(m):
        nonlocal count
        attrs = dict(ATTR_RE.findall(m.group(1)))
        body = m.group(2).strip().replace("&amp;", "&")
        count += 1
        g, left, right = outline(
            text=body,
            size=float(attrs["font-size"]),
            weight=float(attrs.get("font-weight", 400)),
            x=float(attrs.get("x", 0)),
            y=float(attrs.get("y", 0)),
            anchor=attrs.get("text-anchor", "start"),
            spacing=float(attrs.get("letter-spacing", 0)),
            fill=attrs.get("fill", "#000000"),
        )
        extents.append((left, right))
        return g

    out = TEXT_RE.sub(repl, svg)
    if count == 0:
        raise SystemExit("no <text> found in " + path)
    if "<text" in out:
        raise SystemExit("a <text> element survived conversion in " + path)

    # The generator sized these viewBoxes from an ESTIMATE of the text width.
    # Measured against the real font metrics, logo-lockup.svg is ~1.5 units too
    # narrow and clips the final "L" of "AUTO DETAIL". Widen the box to fit the
    # actual ink rather than shipping a cropped wordmark.
    vb = re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', out)
    vw, vh = float(vb.group(1)), float(vb.group(2))
    needed = max(r for _, r in extents)
    if needed > vw:
        new_vw = round(needed + 2, 2)
        print("      viewBox %.2f too narrow for text ending at %.2f -> widened to %.2f"
              % (vw, needed, new_vw))
        out = out.replace('viewBox="0 0 %g %g"' % (vw, vh),
                          'viewBox="0 0 %g %g"' % (new_vw, vh))
        out = re.sub(r'width="%g" height="%g"' % (vw, vh),
                     'width="%g" height="%g"' % (new_vw, vh), out)

    name = Path(path).name
    dest = OUT_DIR / ("outlined-" + name)
    dest.write_text(out, encoding="utf-8")
    print("  %-28s %d text runs outlined -> %s" % (name, count, dest))


if __name__ == "__main__":
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print("outlining wordmarks from " + WOFF2)
    for s in SOURCES:
        convert("assets/brand/" + s)
