"""WCAG AA contrast audit for the Clear View palette.
Run:  python scripts/contrast.py
Every pair below must PASS before the palette ships."""
def lin(c):
    c/=255.0
    return c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4
def L(h):
    h=h.lstrip('#'); r,g,b=(int(h[i:i+2],16) for i in (0,2,4))
    return 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b)
def cr(a,b):
    la,lb=L(a),L(b); hi,lo=max(la,lb),min(la,lb)
    return (hi+0.05)/(lo+0.05)

P={
 'navy':'#0A1626','slate':'#11253C','paper':'#F7F9FB','white':'#FFFFFF','footer':'#060F1B',
 'ink':'#0A1626','ink-muted':'#495A6B','bone':'#E9F1F8','bone-muted':'#A4BCD1',
 'brand':'#2E6DA4','accent':'#4FA8E8','accent-ink':'#06263B','accent-ondark':'#6FB6EA',
 'err-dark':'#FFB3A4',
}
tests=[
 ('body text on paper','ink','paper',4.5),
 ('muted text on paper','ink-muted','paper',4.5),
 ('brand blue as text on paper','brand','paper',4.5),
 ('brand blue as text on white','brand','white',4.5),
 ('body text on navy','bone','navy',4.5),
 ('muted text on navy','bone-muted','navy',4.5),
 ('body text on slate','bone','slate',4.5),
 ('muted text on slate','bone-muted','slate',4.5),
 ('muted text on footer','bone-muted','footer',4.5),
 ('accent as text on navy','accent-ondark','navy',4.5),
 ('accent as text on slate','accent-ondark','slate',4.5),
 ('CTA label on accent fill','accent-ink','accent',4.5),
 ('accent fill vs navy (UI component)','accent','navy',3.0),
 ('accent fill vs paper (UI component)','accent','paper',3.0),
 ('form error text on navy','err-dark','navy',4.5),
 ('white on brand blue (logo lockup)','white','brand',4.5),
]
print(f"{'pair':<38}{'fg':<10}{'bg':<10}{'ratio':>7}{'need':>7}  result")
fails=0
for name,f,b,need in tests:
    r=cr(P[f],P[b]); ok = r>=need
    if not ok: fails+=1
    print(f"{name:<38}{P[f]:<10}{P[b]:<10}{r:>7.2f}{need:>7}  {'PASS' if ok else '*** FAIL ***'}")
print(f"\n{len(tests)-fails}/{len(tests)} pass")
