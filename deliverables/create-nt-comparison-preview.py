from pathlib import Path
import fitz

OUT = Path("deliverables/nt-comparison-preview")
OUT.mkdir(parents=True, exist_ok=True)
doc = fitz.open()
page = doc.new_page(width=842, height=595)
page.insert_font(fontname="Regular", fontfile="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
page.insert_font(fontname="Bold", fontfile="/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")
navy = (0.08, 0.16, 0.25)
muted = (0.35, 0.40, 0.46)
green = (0.06, 0.40, 0.28)
red = (0.67, 0.15, 0.18)

def text(x, y, s, size=9, color=navy, bold=False):
    page.insert_text((x, y), s, fontsize=size, fontname="Bold" if bold else "Regular", color=color)

def box(x, y, w, h, s, size=8, color=navy, bold=False, align=0):
    result = page.insert_textbox(fitz.Rect(x, y, x+w, y+h), s, fontsize=size,
                                fontname="Bold" if bold else "Regular", color=color, align=align)
    assert result >= 0, f"Text overflow: {s}"

page.draw_rect(fitz.Rect(0, 0, 842, 8), color=navy, fill=navy)
text(32, 32, "THERMOPAC  /  ECR PRE-PILOT DESIGN", 9, muted, True)
text(640, 32, "DRAFT • FOR APPROVAL", 9, muted, True)
text(32, 64, "Theoretical-stage comparison", 23, navy, True)
text(32, 83, "Stage 2  |  All product targets  |  Existing saved calculation", 10, muted)

page.draw_rect(fitz.Rect(32, 99, 810, 143), color=(0.84, 0.9, 0.88), fill=(0.94, 0.98, 0.96))
text(44, 117, "MINIMUM SAVED ACCEPTED Nₜ: 4", 11, green, True)
text(44, 133, "Meets the original saved targets below. This is not a determination of economic optimum.", 8.5, muted)

widths = [32, 74, 65, 79, 79, 78, 89, 77, 105]
xs = [32]
for w in widths:
    xs.append(xs[-1] + w)
headers = ["Nₜ", "Recovery\n≥85%", "NMP\n≤20 wt%", "Saturates\n≥92.5 wt%", "Total arom.\n≤7 wt%", "Polar arom.\n≤0.5 wt%", "Sulfur*\n≤1,500 ppm", "Numerical\nchecks", "Saved\nacceptance"]
page.draw_rect(fitz.Rect(32, 158, 810, 196), fill=navy, color=navy)
for i, h in enumerate(headers):
    box(xs[i]+3, 167, widths[i]-6, 28, h, 8, (1,1,1), True, 1)

rows = [
 ["91.32","11.96","89.57","9.33","1.10","2,399.6"],
 ["88.81","9.98","91.41","7.87","0.71","1,834.9"],
 ["87.63","9.12","92.31","7.18","0.51","1,563.9"],
 ["87.00","8.68","92.80","6.81","0.38","1,414.3"],
 ["86.64","8.45","93.09","6.61","0.30","1,324.5"],
 ["86.43","8.31","93.26","6.50","0.24","1,267.2"],
 ["86.30","8.22","93.37","6.43","0.20","1,228.8"],
 ["86.22","8.17","93.44","6.40","0.17","1,201.9"],
 ["86.16","8.14","93.48","6.38","0.14",None],
 ["86.13","8.12","93.52","6.37","0.12","1,167.9"],
]
for idx, row in enumerate(rows):
    n = idx + 1
    y = 196 + idx * 23
    fill = (0.90,0.96,0.93) if n == 4 else ((0.97,0.98,0.99) if idx % 2 == 0 else (1,1,1))
    page.draw_rect(fitz.Rect(32,y,810,y+23), fill=fill, color=fill)
    page.draw_line((32,y+23),(810,y+23),color=(0.87,0.90,0.92),width=0.4)
    box(xs[0],y+6,widths[0],16,str(n),8.5,navy,True,1)
    for j, val in enumerate(row):
        fail = n <= 3 and j >= 2
        label = "N/C" if val is None else f"{val} {'✕' if fail else '✓'}"
        color = muted if val is None else red if fail else green
        box(xs[j+1]+2,y+6,widths[j+1]-4,16,label,8.3,color,n==4,1)
    accepted = n >= 4 and n != 9
    box(xs[7],y+6,widths[7],16,"FAIL" if n==9 else "PASS",8,red if n==9 else green,True,1)
    box(xs[8],y+6,widths[8],16,"ACCEPTED" if accepted else "NOT ACCEPTED",7.6,green if accepted else red,True,1)

text(32, 445, "✓ PASS     ✕ FAIL     N/C  Not calculable", 8.5, muted, True)
notes = [
 "BASIS  Recovery is NMP-free hydrocarbon recovery. Saturates and aromatics are wt% on an NMP-free raffinate basis;",
 "NMP is wt% on a total-raffinate basis. Values are rounded for display; indicators reproduce the saved checks.",
 "* SULFUR  Model-predicted; not independently demonstrated sulfur compliance.",
 "ACCEPTANCE  Nₜ = 9 failed numerical checks; sulfur is not calculable. Product-target passes alone do not establish acceptance.",
 "TARGETS  Original saved limits are shown—not the later discussed >93 wt% saturates / <1,200 ppm sulfur scenario.",
]
for i, note in enumerate(notes):
    text(32, 465+i*14, note, 8, muted)
page.draw_line((32,548),(810,548), color=(0.8,0.84,0.87), width=0.6)
text(32,565,"Design 269  •  Saved run completed 22 Sep 2026  •  Standalone approval preview; no recalculation",7.7,muted)
text(760,565,"1 / 1",8,muted)
path = OUT / "stage2-nt-comparison-approval.pdf"
doc.save(path)
doc.close()
check = fitz.open(path)
assert len(check) == 1
for b in check[0].get_text("blocks"):
    assert fitz.Rect(b[:4]) in check[0].rect
check[0].get_pixmap(matrix=fitz.Matrix(1.7,1.7)).save(OUT / "stage2-nt-comparison-approval.png")
print(path)