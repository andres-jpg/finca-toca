"""
Manual de Usuario — Conductor de Campo (PWA Móvil)
Toca Lácteos · ReportLab
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm, mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, PageBreak,
    Table, TableStyle, HRFlowable, KeepTogether, Flowable
)
import io, math

# ── Output ─────────────────────────────────────────────────────────────────────
BASE   = "/sessions/nice-laughing-albattani/mnt/FincaToca"
OUTPUT = f"{BASE}/Manual_Conductor_TocaLacteos.pdf"

# ── Colors ─────────────────────────────────────────────────────────────────────
DARK_BG    = colors.HexColor("#0f172a")
TEAL       = colors.HexColor("#14b8a6")
TEAL_LIGHT = colors.HexColor("#ccfbf1")
TEAL_DARK  = colors.HexColor("#0d9488")
WHITE      = colors.white
GRAY_DARK  = colors.HexColor("#334155")
GRAY_MED   = colors.HexColor("#64748b")
GRAY_LIGHT = colors.HexColor("#f1f5f9")
AMBER      = colors.HexColor("#f59e0b")
AMBER_LIGHT= colors.HexColor("#fef3c7")
RED        = colors.HexColor("#ef4444")
GREEN      = colors.HexColor("#10b981")
PHONE_BG   = colors.HexColor("#f8fafc")
PHONE_BORDER = colors.HexColor("#cbd5e1")

PAGE_W, PAGE_H = A4

# ── Styles ─────────────────────────────────────────────────────────────────────
def S(name, **kw): return ParagraphStyle(name, **kw)

H1 = S("H1", fontName="Helvetica-Bold", fontSize=20, textColor=DARK_BG,
        spaceAfter=8, spaceBefore=16, leading=26)
H2 = S("H2", fontName="Helvetica-Bold", fontSize=13, textColor=TEAL,
        spaceAfter=5, spaceBefore=12, leading=18)
H3 = S("H3", fontName="Helvetica-Bold", fontSize=11, textColor=GRAY_DARK,
        spaceAfter=4, spaceBefore=8)
BODY = S("Body", fontName="Helvetica", fontSize=10, textColor=GRAY_DARK,
         spaceAfter=6, leading=16, alignment=TA_JUSTIFY)
BULLET = S("Bullet", fontName="Helvetica", fontSize=10, textColor=GRAY_DARK,
           spaceAfter=3, leading=15, leftIndent=14, firstLineIndent=-8)
CAPTION = S("Caption", fontName="Helvetica-Oblique", fontSize=8, textColor=GRAY_MED,
            spaceAfter=10, alignment=TA_CENTER)
NOTE = S("Note", fontName="Helvetica-Oblique", fontSize=9, textColor=GRAY_MED,
         spaceAfter=8, leading=14)
STEP_NUM = S("StepNum", fontName="Helvetica-Bold", fontSize=22, textColor=TEAL,
             alignment=TA_CENTER, leading=28)
PHONE_LABEL = S("PhoneLabel", fontName="Helvetica-Bold", fontSize=8,
                textColor=GRAY_MED, alignment=TA_CENTER, spaceAfter=2)
TOC_H1 = S("TOCH1", fontName="Helvetica-Bold", fontSize=11, textColor=DARK_BG,
           spaceAfter=4, leading=16)
TOC_H2 = S("TOCH2", fontName="Helvetica", fontSize=10, textColor=GRAY_MED,
           spaceAfter=3, leading=14, leftIndent=12)

# ── Page templates ─────────────────────────────────────────────────────────────
def on_first_page(c, doc): pass

def on_later_pages(c, doc):
    w, h = A4
    c.saveState()
    c.setFillColor(DARK_BG)
    c.rect(0, h - 1.5*cm, w, 1.5*cm, fill=1, stroke=0)
    c.setFillColor(TEAL)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(2*cm, h - 1.0*cm, "Toca Lácteos")
    c.setFillColor(colors.HexColor("#94a3b8"))
    c.setFont("Helvetica", 9)
    c.drawRightString(w - 2*cm, h - 1.0*cm, "Manual del Conductor — PWA Móvil")
    c.setFillColor(GRAY_LIGHT)
    c.rect(0, 0, w, 0.9*cm, fill=1, stroke=0)
    c.setFillColor(GRAY_MED)
    c.setFont("Helvetica", 8)
    c.drawString(2*cm, 0.32*cm, "© 2026 Toca Lácteos · Uso interno")
    c.drawRightString(w - 2*cm, 0.32*cm, f"Página {doc.page}")
    c.restoreState()


# ── Phone wireframe flowable ────────────────────────────────────────────────────
class PhoneScreen(Flowable):
    """
    Draws a mobile-phone-style frame containing a list of (type, content) rows.
    Types: 'header', 'status_bar', 'section', 'field', 'button', 'list_item',
           'divider', 'counter', 'warning', 'spacer', 'note'
    """
    PHONE_W = 6.5 * cm
    PHONE_H_PER_ROW = 0.65 * cm
    CORNER_R = 10
    STATUS_H = 0.5 * cm
    HEADER_H = 1.0 * cm
    PADDING   = 0.25 * cm

    def __init__(self, rows, title="", caption=""):
        super().__init__()
        self.rows = rows
        self.title = title
        self.caption = caption
        content_h = sum(self._row_height(r) for r in rows)
        self.phone_h = self.STATUS_H + self.HEADER_H + content_h + self.PADDING * 2 + 0.4*cm
        self.width  = self.PHONE_W + 1.2*cm   # extra for outer border
        self.height = self.phone_h + 0.8*cm    # extra for caption

    def _row_height(self, row):
        t = row[0]
        if t == 'spacer':   return 0.25*cm
        if t == 'divider':  return 0.1*cm
        if t == 'counter':  return 1.4*cm
        if t == 'warning':  return 0.85*cm
        if t == 'note':     return 0.4*cm
        return 0.65*cm

    def wrap(self, aw, ah):
        return (self.width, self.height)

    def draw(self):
        c = self.canv
        pw = self.PHONE_W
        ph = self.phone_h
        ox = 0.6*cm   # x offset (center phone in available width)
        oy = self.height - ph  # draw from top

        # Phone outline
        c.setFillColor(WHITE)
        c.setStrokeColor(PHONE_BORDER)
        c.setLineWidth(1.5)
        c.roundRect(ox, oy, pw, ph, self.CORNER_R, fill=1, stroke=1)

        # Status bar
        c.setFillColor(DARK_BG)
        c.roundRect(ox, oy + ph - self.STATUS_H, pw, self.STATUS_H,
                    self.CORNER_R, fill=1, stroke=0)
        # Clip top corners cleanly
        c.setFillColor(DARK_BG)
        c.rect(ox, oy + ph - self.STATUS_H, pw, self.STATUS_H/2, fill=1, stroke=0)
        c.setFillColor(colors.HexColor("#94a3b8"))
        c.setFont("Helvetica", 5.5)
        c.drawString(ox + 0.15*cm, oy + ph - self.STATUS_H + 0.12*cm, "22:38")
        c.setFont("Helvetica", 5)
        c.drawRightString(ox + pw - 0.12*cm, oy + ph - self.STATUS_H + 0.12*cm, "●●  ▲  ◗")

        # Header bar
        hy = oy + ph - self.STATUS_H - self.HEADER_H
        c.setFillColor(WHITE)
        c.rect(ox, hy, pw, self.HEADER_H, fill=1, stroke=0)
        # Draw user email
        c.setFillColor(GRAY_DARK)
        c.setFont("Helvetica", 6)
        c.drawCentredString(ox + pw/2, hy + self.HEADER_H * 0.55,
                            "juan.alba@tocalacteos.com")
        # Draw thin separator
        c.setStrokeColor(PHONE_BORDER)
        c.setLineWidth(0.3)
        c.line(ox, hy, ox + pw, hy)

        # Content rows
        cy = hy - self.PADDING
        for row in self.rows:
            rh = self._row_height(row)
            cy -= rh
            self._draw_row(c, row, ox + self.PADDING, cy, pw - 2*self.PADDING, rh)

        # Caption below phone
        if self.caption:
            c.setFillColor(GRAY_MED)
            c.setFont("Helvetica-Oblique", 7)
            c.drawCentredString(ox + pw/2, oy - 0.25*cm, self.caption)

    def _draw_row(self, c, row, x, y, w, h):
        t = row[0]
        inner_y = y + h * 0.2

        if t == 'spacer' or t == 'divider':
            if t == 'divider':
                c.setStrokeColor(PHONE_BORDER)
                c.setLineWidth(0.3)
                c.line(x, y + h/2, x + w, y + h/2)

        elif t == 'role_badge':
            # Role label (CONDUCTOR — CAMPO)
            c.setFillColor(GRAY_MED)
            c.setFont("Helvetica", 5.5)
            c.drawString(x, y + h * 0.7, row[1])
            # Itinerary title
            c.setFillColor(DARK_BG)
            c.setFont("Helvetica-Bold", 8)
            c.drawString(x, y + h * 0.15, row[2])
            # Sync status
            sync_ok = row[3] if len(row) > 3 else True
            dot_color = TEAL if sync_ok else RED
            label = "Sincronizado" if sync_ok else "Sin conexión"
            dot_x = x + w - 1.6*cm
            c.setFillColor(dot_color)
            c.circle(dot_x + 0.15*cm, y + h * 0.4, 0.06*cm, fill=1, stroke=0)
            c.setFillColor(dot_color)
            c.setFont("Helvetica-Bold", 5.5)
            c.drawString(dot_x + 0.3*cm, y + h * 0.25, label)

        elif t == 'counter':
            # Big counter card
            card_h = h - 0.05*cm
            c.setFillColor(GRAY_LIGHT)
            c.roundRect(x, y, w, card_h, 4, fill=1, stroke=0)
            # Left number: X/55
            c.setFillColor(TEAL)
            c.setFont("Helvetica-Bold", 14)
            visited = row[1]
            c.drawString(x + 0.2*cm, y + card_h * 0.55, str(visited))
            c.setFillColor(GRAY_MED)
            c.setFont("Helvetica-Bold", 8)
            c.drawString(x + 0.2*cm + (0.14*cm * len(str(visited)) * 1.8), y + card_h * 0.6, "/55")
            c.setFillColor(GRAY_MED)
            c.setFont("Helvetica", 6)
            c.drawString(x + 0.2*cm, y + card_h * 0.22, "fincas visitadas")
            # Right number: litros
            litros = row[2]
            c.setFillColor(TEAL)
            c.setFont("Helvetica-Bold", 14)
            c.drawString(x + w/2 + 0.15*cm, y + card_h * 0.55, str(litros))
            c.setFillColor(GRAY_MED)
            c.setFont("Helvetica-Bold", 7)
            c.drawString(x + w/2 + 0.15*cm + (0.13*cm * len(str(litros)) * 1.9), y + card_h * 0.6, "L")
            c.setFillColor(GRAY_MED)
            c.setFont("Helvetica", 6)
            c.drawString(x + w/2 + 0.15*cm, y + card_h * 0.22, "litros acumulados")
            # Progress bar
            pct = int(visited) / 55 if visited else 0
            c.setFillColor(colors.HexColor("#e2e8f0"))
            c.roundRect(x + 0.2*cm, y + 0.06*cm, w - 0.4*cm, 0.12*cm, 2, fill=1, stroke=0)
            if pct > 0:
                c.setFillColor(TEAL)
                c.roundRect(x + 0.2*cm, y + 0.06*cm, (w - 0.4*cm) * pct, 0.12*cm, 2, fill=1, stroke=0)

        elif t == 'label':
            c.setFillColor(GRAY_DARK)
            c.setFont("Helvetica-Bold", 7)
            c.drawString(x, y + h * 0.35, row[1])

        elif t == 'select':
            c.setFillColor(WHITE)
            c.setStrokeColor(PHONE_BORDER)
            c.setLineWidth(0.5)
            c.roundRect(x, y + 0.05*cm, w, h - 0.1*cm, 4, fill=1, stroke=1)
            c.setFillColor(GRAY_DARK)
            c.setFont("Helvetica", 7)
            c.drawString(x + 0.15*cm, y + h * 0.35, row[1])
            # Chevron
            c.setFillColor(GRAY_MED)
            c.setFont("Helvetica", 7)
            c.drawRightString(x + w - 0.15*cm, y + h * 0.35, "⌃⌄")

        elif t == 'input':
            c.setFillColor(WHITE)
            c.setStrokeColor(TEAL if row[2] else PHONE_BORDER)
            c.setLineWidth(0.8 if row[2] else 0.5)
            c.roundRect(x, y + 0.05*cm, w, h - 0.1*cm, 4, fill=1, stroke=1)
            val = row[1]
            c.setFont("Helvetica-Bold" if val else "Helvetica", 8 if val else 7)
            c.setFillColor(GRAY_DARK if val else colors.HexColor("#94a3b8"))
            c.drawCentredString(x + w/2, y + h * 0.32, val if val else "0.00")

        elif t == 'button':
            active = row[2] if len(row) > 2 else False
            c.setFillColor(DARK_BG if active else colors.HexColor("#94a3b8"))
            c.roundRect(x, y + 0.05*cm, w, h - 0.1*cm, 4, fill=1, stroke=0)
            c.setFillColor(WHITE)
            c.setFont("Helvetica-Bold", 7)
            label = row[1]
            c.drawCentredString(x + w/2, y + h * 0.33, label)

        elif t == 'list_item':
            # registrada: dot color, name, litros, edit icon
            dot_color = row[1]   # 'teal', 'amber', 'red'
            name  = row[2]
            litros = row[3]
            editing = row[4] if len(row) > 4 else False

            c.setFillColor(WHITE)
            c.setStrokeColor(PHONE_BORDER)
            c.setLineWidth(0.3)
            c.roundRect(x, y + 0.04*cm, w, h - 0.08*cm, 3, fill=1, stroke=1)

            # Sync dot
            dc = TEAL if dot_color=='teal' else (AMBER if dot_color=='amber' else RED)
            c.setFillColor(dc)
            c.circle(x + 0.2*cm, y + h/2, 0.07*cm, fill=1, stroke=0)

            c.setFillColor(GRAY_DARK)
            c.setFont("Helvetica", 7)
            c.drawString(x + 0.45*cm, y + h * 0.32, name)

            if editing:
                # Show inline edit: input box + ✓ + ✗
                ew = 1.0*cm
                c.setFillColor(WHITE)
                c.setStrokeColor(DARK_BG)
                c.setLineWidth(0.8)
                c.roundRect(x + w - 2.4*cm, y + 0.1*cm, ew, h * 0.75, 3, fill=1, stroke=1)
                c.setFillColor(GRAY_DARK)
                c.setFont("Helvetica-Bold", 7)
                c.drawCentredString(x + w - 2.4*cm + ew/2, y + h * 0.28, litros)
                # Check button
                c.setFillColor(DARK_BG)
                c.roundRect(x + w - 1.3*cm, y + 0.1*cm, 0.55*cm, h * 0.75, 3, fill=1, stroke=0)
                c.setFillColor(WHITE)
                c.setFont("Helvetica-Bold", 8)
                c.drawCentredString(x + w - 1.0*cm, y + h * 0.28, "✓")
                # X button
                c.setFillColor(colors.HexColor("#f1f5f9"))
                c.roundRect(x + w - 0.7*cm, y + 0.1*cm, 0.55*cm, h * 0.75, 3, fill=1, stroke=0)
                c.setFillColor(GRAY_DARK)
                c.setFont("Helvetica-Bold", 7)
                c.drawCentredString(x + w - 0.42*cm, y + h * 0.28, "✕")
            else:
                c.setFillColor(GRAY_DARK)
                c.setFont("Helvetica", 7)
                c.drawRightString(x + w - 0.5*cm, y + h * 0.32, f"{litros} L")
                # Pencil icon placeholder
                c.setFillColor(GRAY_MED)
                c.setFont("Helvetica", 7)
                c.drawRightString(x + w - 0.12*cm, y + h * 0.32, "✎")

        elif t == 'warning':
            c.setFillColor(AMBER_LIGHT)
            c.setStrokeColor(AMBER)
            c.setLineWidth(0.5)
            c.roundRect(x, y + 0.04*cm, w, h - 0.08*cm, 3, fill=1, stroke=1)
            c.setFillColor(AMBER)
            c.setFont("Helvetica", 5.5)
            c.drawString(x + 0.12*cm, y + h * 0.28, "□")
            c.setFont("Helvetica", 6)
            c.drawString(x + 0.35*cm, y + h * 0.28, row[1])

        elif t == 'note':
            c.setFillColor(GRAY_MED)
            c.setFont("Helvetica-Oblique", 5.5)
            c.drawCentredString(x + w/2, y + h * 0.2, row[1])


def phone(rows, caption=""):
    """Convenience wrapper."""
    return PhoneScreen(rows, caption=caption)


def info_box(items, color=TEAL_LIGHT, border=TEAL):
    rows = [[Paragraph(f"• {i}", S("IB",
        fontName="Helvetica", fontSize=9.5, textColor=GRAY_DARK,
        leading=14, spaceAfter=0))] for i in items]
    tbl = Table(rows, colWidths=[PAGE_W - 4*cm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND",   (0,0), (-1,-1), color),
        ("TOPPADDING",   (0,0), (-1,-1), 4),
        ("BOTTOMPADDING",(0,0), (-1,-1), 4),
        ("LEFTPADDING",  (0,0), (-1,-1), 10),
        ("RIGHTPADDING", (0,0), (-1,-1), 10),
        ("LINEABOVE",    (0,0), (-1, 0), 2, border),
        ("LINEBELOW",    (0,-1),(-1,-1), 0.5, border),
    ]))
    return tbl


def warning_box(text):
    return info_box([text], color=AMBER_LIGHT, border=AMBER)


def section_header(title):
    tbl = Table([[Paragraph(title, S("SH",
        fontName="Helvetica-Bold", fontSize=17, textColor=WHITE,
        leading=22, spaceAfter=0))]], colWidths=[PAGE_W - 4*cm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), DARK_BG),
        ("TOPPADDING",    (0,0), (-1,-1), 10),
        ("BOTTOMPADDING", (0,0), (-1,-1), 10),
        ("LEFTPADDING",   (0,0), (-1,-1), 14),
    ]))
    return tbl


def step_block(num, title, body_items, phone_rows=None, phone_caption=""):
    """A numbered step with optional phone wireframe side-by-side."""
    items = [
        Table([[
            Paragraph(str(num), STEP_NUM),
            Paragraph(title, S("StepTitle",
                fontName="Helvetica-Bold", fontSize=13, textColor=DARK_BG,
                leading=18, spaceAfter=0)),
        ]], colWidths=[1.2*cm, PAGE_W - 4*cm - 1.2*cm]),
    ]

    if phone_rows:
        # Two-column: description left, phone right
        desc_items = []
        for item in body_items:
            if isinstance(item, str):
                desc_items.append(Paragraph(item, BODY))
            else:
                desc_items.append(item)

        ph = phone(phone_rows, phone_caption)
        content_col = Table(
            [[col] for col in desc_items],
            colWidths=[PAGE_W - 4*cm - ph.width - 0.4*cm]
        )
        content_col.setStyle(TableStyle([
            ("TOPPADDING",   (0,0),(-1,-1), 2),
            ("BOTTOMPADDING",(0,0),(-1,-1), 2),
            ("LEFTPADDING",  (0,0),(-1,-1), 0),
            ("RIGHTPADDING", (0,0),(-1,-1), 0),
        ]))
        two_col = Table(
            [[content_col, ph]],
            colWidths=[PAGE_W - 4*cm - ph.width - 0.4*cm, ph.width + 0.4*cm]
        )
        two_col.setStyle(TableStyle([
            ("VALIGN",       (0,0),(-1,-1), "TOP"),
            ("TOPPADDING",   (0,0),(-1,-1), 0),
            ("BOTTOMPADDING",(0,0),(-1,-1), 0),
            ("LEFTPADDING",  (0,0),(-1,-1), 0),
            ("RIGHTPADDING", (0,0),(-1,-1), 4),
        ]))
        items.append(two_col)
    else:
        for item in body_items:
            if isinstance(item, str):
                items.append(Paragraph(item, BODY))
            else:
                items.append(item)

    return KeepTogether(items + [Spacer(1, 0.4*cm)])


# ── Phone screen definitions ────────────────────────────────────────────────────

SCREEN_LOGIN = [
    ('spacer', ),
    ('label', 'Finca Toca'),
    ('note', 'Inicia sesión para continuar'),
    ('spacer', ),
    ('label', 'Correo electrónico'),
    ('select', 'you@example.com'),
    ('label', 'Contraseña'),
    ('input', '••••••••', False),
    ('spacer', ),
    ('button', 'Iniciar sesión', True),
    ('note', '¿No tienes cuenta? Registrarte'),
]

SCREEN_EMPTY = [
    ('role_badge', 'CONDUCTOR — CAMPO', 'Itinerario 3', True),
    ('spacer', ),
    ('counter', '0', '0'),
    ('spacer', ),
    ('label', 'Finca'),
    ('select', 'Selecciona una finca'),
    ('label', 'Litros recolectados'),
    ('input', '', False),
    ('spacer', ),
    ('button', 'Registrar recolección', False),
    ('note', 'Los registros se guardan en tiempo real'),
]

SCREEN_SELECTOR = [
    ('role_badge', 'CONDUCTOR — CAMPO', 'Itinerario 3', True),
    ('spacer', ),
    ('counter', '0', '0'),
    ('spacer', ),
    ('label', 'Finca'),
    ('select', '▸ Selecciona una finca'),
    ('note', 'OSWALDO GUIO'),
    ('note', 'RICARDO CAICEDO'),
    ('note', 'JULIO CAICEDO'),
    ('note', 'HECTOR Y ALICIA DAZA'),
    ('note', 'ANDRES CAVIEDES'),
    ('note', 'NESTOR MORENO  …y más'),
]

SCREEN_ENTERING = [
    ('role_badge', 'CONDUCTOR — CAMPO', 'Itinerario 3', True),
    ('counter', '0', '0'),
    ('label', 'Finca'),
    ('select', 'OSWALDO GUIO'),
    ('label', 'Litros recolectados'),
    ('input', '54', True),
    ('button', 'Registrar recolección', True),
    ('note', 'Los registros se guardan en tiempo real'),
]

SCREEN_AFTER1 = [
    ('role_badge', 'CONDUCTOR — CAMPO', 'Itinerario 3', True),
    ('counter', '1', '54'),
    ('label', 'Finca'),
    ('select', 'RICARDO CAICEDO'),
    ('label', 'Litros recolectados'),
    ('input', '', False),
    ('button', 'Registrar recolección', False),
    ('spacer', ),
    ('label', 'Registradas hoy'),
    ('list_item', 'teal', 'OSWALDO GUIO', '54'),
]

SCREEN_OFFLINE = [
    ('role_badge', 'CONDUCTOR — CAMPO', 'Itinerario 3', False),
    ('warning', 'Sin conexión. 2 registros guardados localmente.'),
    ('counter', '3', '194'),
    ('label', 'Finca'),
    ('select', 'HECTOR Y ALICIA DAZA'),
    ('button', 'Registrar recolección', False),
    ('label', 'Registradas hoy'),
    ('list_item', 'teal',  'OSWALDO GUIO',    '54'),
    ('list_item', 'amber', 'RICARDO CAICEDO',  '80'),
    ('list_item', 'amber', 'JULIO CAICEDO',    '60'),
]

SCREEN_EDIT = [
    ('role_badge', 'CONDUCTOR — CAMPO', 'Itinerario 3', True),
    ('counter', '4', '284'),
    ('label', 'Registradas hoy'),
    ('list_item', 'teal', 'OSWALDO GUIO',     '60', True),
    ('list_item', 'teal', 'RICARDO CAICEDO',  '80'),
    ('list_item', 'teal', 'JULIO CAICEDO',    '60'),
    ('list_item', 'teal', 'HECTOR Y ALICIA DAZA', '90'),
]

SCREEN_AFTER_EDIT = [
    ('role_badge', 'CONDUCTOR — CAMPO', 'Itinerario 3', True),
    ('counter', '4', '290'),
    ('label', 'Registradas hoy'),
    ('list_item', 'teal', 'OSWALDO GUIO',        '60'),
    ('list_item', 'teal', 'RICARDO CAICEDO',      '80'),
    ('list_item', 'teal', 'JULIO CAICEDO',        '60'),
    ('list_item', 'teal', 'HECTOR Y ALICIA DAZA', '90'),
]


# ── BUILD ──────────────────────────────────────────────────────────────────────
def build():
    doc = SimpleDocTemplate(
        OUTPUT, pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2.5*cm, bottomMargin=2*cm,
        title="Manual del Conductor — Toca Lácteos",
        author="Sistema Toca Lácteos",
    )
    story = []

    # ── PORTADA ──
    class CoverPage(Flowable):
        def draw(self):
            c = self.canv
            w, h = A4
            c.setFillColor(DARK_BG)
            c.rect(-2*cm, -2*cm, w + 4*cm, h + 4*cm, fill=1, stroke=0)
            c.setFillColor(TEAL)
            c.rect(-2*cm, h - 3*cm - 2*cm, w + 4*cm, 0.4*cm, fill=1, stroke=0)
            c.rect(-2*cm, -2*cm, w + 4*cm, 0.4*cm, fill=1, stroke=0)

            # Draw simple phone silhouette
            pw2, ph2 = 2.5*cm, 4.5*cm
            px2, py2 = w/2 - 2*cm - pw2/2, h/2 + 1*cm
            c.setFillColor(colors.HexColor("#1e293b"))
            c.roundRect(px2, py2, pw2, ph2, 8, fill=1, stroke=0)
            c.setFillColor(TEAL)
            c.roundRect(px2 + 0.2*cm, py2 + 0.35*cm, pw2 - 0.4*cm, ph2 - 0.7*cm, 4, fill=1, stroke=0)
            c.setFillColor(WHITE)
            c.setFont("Helvetica-Bold", 9)
            c.drawCentredString(px2 + pw2/2, py2 + ph2*0.5, "TOCA")
            c.drawCentredString(px2 + pw2/2, py2 + ph2*0.35, "LÁCTEOS")

            c.setFillColor(WHITE)
            c.setFont("Helvetica-Bold", 32)
            c.drawCentredString(w/2 - 2*cm, h/2 - 0.3*cm, "MANUAL DEL")
            c.drawCentredString(w/2 - 2*cm, h/2 - 1.2*cm, "CONDUCTOR")
            c.setFillColor(TEAL)
            c.setFont("Helvetica-Bold", 14)
            c.drawCentredString(w/2 - 2*cm, h/2 - 2.1*cm, "Aplicación Móvil (PWA) · Campo")
            c.setFillColor(colors.HexColor("#94a3b8"))
            c.setFont("Helvetica", 11)
            c.drawCentredString(w/2 - 2*cm, h/2 - 2.9*cm, "Versión 1.0  ·  Junio 2026")
            c.setFont("Helvetica", 9)
            c.drawCentredString(w/2 - 2*cm, 1.5*cm - 2*cm, "CONFIDENCIAL — Solo para uso interno")

        def wrap(self, aw, ah): return (aw, ah)

    story.append(CoverPage())
    story.append(PageBreak())

    # ── TABLA DE CONTENIDO ──
    story.append(Paragraph("Contenido", H1))
    story.append(HRFlowable(width="100%", thickness=2, color=TEAL, spaceAfter=10))
    for label, level in [
        ("1. ¿Qué es la app del conductor?", "H1"),
        ("2. Acceso e inicio de sesión", "H1"),
        ("3. Pantalla principal — Tu itinerario del día", "H1"),
        ("4. Paso a paso: Registrar una recolección", "H1"),
        ("   4.1 Seleccionar la finca", "H2"),
        ("   4.2 Ingresar los litros", "H2"),
        ("   4.3 Confirmar el registro", "H2"),
        ("5. Lista de recolecciones del día", "H1"),
        ("   5.1 Indicadores de sincronización", "H2"),
        ("6. Uso sin conexión a internet", "H1"),
        ("   6.1 ¿Qué pasa cuando no hay señal?", "H2"),
        ("   6.2 Sincronización automática al volver a tener señal", "H2"),
        ("7. Corregir un error: editar litros registrados", "H1"),
        ("8. Consejos y buenas prácticas", "H1"),
        ("9. Preguntas frecuentes", "H1"),
    ]:
        st = TOC_H1 if level == "H1" else TOC_H2
        story.append(Paragraph(label, st))
    story.append(PageBreak())

    # ── 1. ¿QUÉ ES? ──
    story.append(section_header("1. ¿Qué es la app del conductor?"))
    story.append(Spacer(1, 0.4*cm))
    story.append(Paragraph(
        "La app del conductor es una aplicación web móvil (<b>PWA</b>) diseñada para que "
        "los recolectores de campo registren, en tiempo real y desde su celular, los litros "
        "de leche recogidos en cada finca durante su recorrido diario.",
        BODY))
    story.append(Paragraph(
        "No es necesario descargar nada de la tienda de aplicaciones. Basta con abrir "
        "el navegador del celular, ir a la dirección del sistema y guardar el acceso directo "
        "en la pantalla de inicio para tenerla disponible como cualquier app instalada.",
        BODY))
    story.append(info_box([
        "URL del sistema: finca-toca.vercel.app",
        "Funciona en cualquier celular con Google Chrome o Safari.",
        "Para guardar acceso directo en Android: menú Chrome → 'Añadir a pantalla de inicio'.",
        "Para guardar acceso directo en iPhone: botón Compartir → 'Añadir a inicio'.",
        "Funciona sin internet: los registros se guardan en el celular y se sincronizan solos.",
    ]))
    story.append(PageBreak())

    # ── 2. INICIO DE SESIÓN ──
    story.append(section_header("2. Acceso e inicio de sesión"))
    story.append(Spacer(1, 0.4*cm))
    story.append(step_block(
        1, "Abrir la aplicación",
        [
            "Abra el navegador de su celular (Chrome o Safari) y vaya a <b>finca-toca.vercel.app</b> "
            "o toque el ícono que guardó en su pantalla de inicio.",
            Spacer(1, 0.2*cm),
            "Verá la pantalla de inicio de sesión de <b>Finca Toca</b>.",
        ],
        phone_rows=SCREEN_LOGIN,
        phone_caption="Pantalla de login",
    ))
    story.append(step_block(
        2, "Ingresar sus datos",
        [
            "Toque el campo <b>Correo electrónico</b> y escriba el correo que le asignó el administrador.",
            Spacer(1, 0.1*cm),
            "Toque el campo <b>Contraseña</b> e ingrese su clave.",
            Spacer(1, 0.1*cm),
            "Toque el botón negro <b>Iniciar sesión</b>.",
        ]
    ))
    story.append(info_box([
        "Si olvidó su contraseña, contacte al administrador de la cooperativa.",
        "Su sesión permanece activa en el celular. No necesita iniciar sesión todos los días.",
        "Si comparte el celular con otra persona, cierre sesión con el botón salir (→) arriba a la derecha.",
    ]))
    story.append(PageBreak())

    # ── 3. PANTALLA PRINCIPAL ──
    story.append(section_header("3. Pantalla principal — Tu itinerario del día"))
    story.append(Spacer(1, 0.4*cm))
    story.append(Paragraph(
        "Después de iniciar sesión verá su pantalla de trabajo. "
        "En la parte superior se muestra su rol (<b>CONDUCTOR — CAMPO</b>) y el nombre "
        "de su itinerario asignado (por ejemplo, <i>Itinerario 3</i>).",
        BODY))
    story.append(Spacer(1, 0.2*cm))

    # Two-column: description table + phone
    ph_empty = phone(SCREEN_EMPTY, "Pantalla inicial del día")
    desc_rows = [
        ["Elemento", "Descripción"],
        ["Nombre del itinerario", "El recorrido asignado por el administrador. Contiene las fincas que debe visitar."],
        ["Punto de estado\n(arriba derecha)", "Verde = Sincronizado con el servidor.\nRojo = Sin conexión a internet."],
        ["X/55 fincas visitadas", "Contador de fincas con recolección registrada hoy vs. total del itinerario."],
        ["Litros acumulados", "Suma de litros registrados durante el día."],
        ["Barra de progreso", "Muestra visualmente el avance del recorrido del día."],
        ["Campo 'Finca'", "Selector para elegir la próxima finca a registrar."],
        ["Campo 'Litros'", "Cantidad de litros recogidos en esa finca."],
        ["Botón 'Registrar'", "Negro = activo (listo para guardar). Gris = deshabilitado (faltan datos)."],
    ]
    col_w2 = [(PAGE_W - 4*cm - ph_empty.width - 0.4*cm) * p for p in [0.38, 0.62]]
    desc_tbl = Table(desc_rows, colWidths=col_w2)
    desc_tbl.setStyle(TableStyle([
        ("BACKGROUND",   (0,0),(-1, 0), DARK_BG),
        ("TEXTCOLOR",    (0,0),(-1, 0), WHITE),
        ("FONTNAME",     (0,0),(-1, 0), "Helvetica-Bold"),
        ("FONTNAME",     (0,1),(-1,-1), "Helvetica"),
        ("FONTSIZE",     (0,0),(-1,-1), 8),
        ("TEXTCOLOR",    (0,1),(-1,-1), GRAY_DARK),
        ("VALIGN",       (0,0),(-1,-1), "TOP"),
        ("TOPPADDING",   (0,0),(-1,-1), 5),
        ("BOTTOMPADDING",(0,0),(-1,-1), 5),
        ("LEFTPADDING",  (0,0),(-1,-1), 6),
        ("ROWBACKGROUNDS",(0,1),(-1,-1), [WHITE, GRAY_LIGHT]),
        ("GRID",         (0,0),(-1,-1), 0.4, colors.HexColor("#e2e8f0")),
        ("LINEBELOW",    (0, 0),(-1, 0), 1.5, TEAL),
    ]))
    two = Table([[desc_tbl, ph_empty]],
                colWidths=[PAGE_W - 4*cm - ph_empty.width - 0.4*cm, ph_empty.width + 0.4*cm])
    two.setStyle(TableStyle([
        ("VALIGN",       (0,0),(-1,-1), "TOP"),
        ("TOPPADDING",   (0,0),(-1,-1), 0),
        ("BOTTOMPADDING",(0,0),(-1,-1), 0),
        ("LEFTPADDING",  (0,0),(-1,-1), 0),
        ("RIGHTPADDING", (0,0),(-1,-1), 0),
    ]))
    story.append(two)
    story.append(PageBreak())

    # ── 4. PASO A PASO ──
    story.append(section_header("4. Paso a paso: Registrar una recolección"))
    story.append(Spacer(1, 0.4*cm))
    story.append(Paragraph(
        "Siga estos pasos cada vez que termine de recoger leche en una finca:",
        BODY))
    story.append(Spacer(1, 0.3*cm))

    # 4.1
    story.append(step_block(
        "4.1", "Seleccionar la finca",
        [
            "Toque el campo <b>Finca</b>. Aparecerá una lista desplegable con todas las "
            "fincas de su itinerario.",
            Spacer(1, 0.15*cm),
            "Toque el nombre de la finca donde acaba de recoger la leche.",
            Spacer(1, 0.15*cm),
            Paragraph(
                "<b>Nota:</b> Las fincas que ya tienen recolección registrada hoy "
                "no aparecen en la lista — esto evita registros dobles.",
                NOTE),
        ],
        phone_rows=SCREEN_SELECTOR,
        phone_caption="Selector de finca abierto",
    ))

    # 4.2
    story.append(step_block(
        "4.2", "Ingresar los litros",
        [
            "Toque el campo <b>Litros recolectados</b>.",
            Spacer(1, 0.1*cm),
            "Escriba el número de litros con el teclado numérico que aparece en pantalla.",
            Spacer(1, 0.1*cm),
            "Cuando el campo tenga un valor, el botón <b>Registrar recolección</b> se "
            "vuelve <b>negro</b> (activo).",
        ],
        phone_rows=SCREEN_ENTERING,
        phone_caption="Litros ingresados, botón activo",
    ))

    # 4.3
    story.append(step_block(
        "4.3", "Confirmar el registro",
        [
            "Toque el botón negro <b>Registrar recolección</b>.",
            Spacer(1, 0.1*cm),
            "El registro se guarda inmediatamente. Verá cómo:",
            Paragraph("• El contador de fincas visitadas sube en 1.", BULLET),
            Paragraph("• Los litros acumulados aumentan.", BULLET),
            Paragraph("• La finca aparece en la lista <b>Registradas hoy</b> con un punto verde.", BULLET),
            Paragraph("• El campo de finca y litros se limpian para el próximo registro.", BULLET),
        ],
        phone_rows=SCREEN_AFTER1,
        phone_caption="Después del primer registro",
    ))

    story.append(PageBreak())

    # ── 5. LISTA ──
    story.append(section_header("5. Lista de recolecciones del día"))
    story.append(Spacer(1, 0.4*cm))
    story.append(Paragraph(
        "Debajo del formulario aparece la sección <b>Registradas hoy</b> con todas las "
        "fincas que ya registró durante la jornada. Cada ítem de la lista tiene un "
        "<b>punto de color</b> a la izquierda que indica el estado de sincronización:",
        BODY))
    story.append(Spacer(1, 0.2*cm))

    sync_data = [
        ["Color del punto", "Significado"],
        ["● Verde (teal)",  "Registro guardado y sincronizado con el servidor. Todo en orden."],
        ["● Amarillo",      "Registro guardado localmente en el celular pero pendiente de "
                            "enviar al servidor. Ocurre cuando no hay internet."],
        ["● Rojo",          "El registro no pudo sincronizarse después de varios intentos. "
                            "Contacte al administrador."],
    ]
    sw = [(PAGE_W - 4*cm) * p for p in [0.28, 0.72]]
    stbl = Table(sync_data, colWidths=sw)
    stbl.setStyle(TableStyle([
        ("BACKGROUND",   (0,0),(-1, 0), DARK_BG),
        ("TEXTCOLOR",    (0,0),(-1, 0), WHITE),
        ("FONTNAME",     (0,0),(-1, 0), "Helvetica-Bold"),
        ("FONTNAME",     (0,1),(-1,-1), "Helvetica"),
        ("FONTSIZE",     (0,0),(-1,-1), 9.5),
        ("TEXTCOLOR",    (0,1),(-1,-1), GRAY_DARK),
        ("VALIGN",       (0,0),(-1,-1), "TOP"),
        ("TOPPADDING",   (0,0),(-1,-1), 6),
        ("BOTTOMPADDING",(0,0),(-1,-1), 6),
        ("LEFTPADDING",  (0,0),(-1,-1), 8),
        ("ROWBACKGROUNDS",(0,1),(-1,-1), [WHITE, GRAY_LIGHT]),
        ("GRID",         (0,0),(-1,-1), 0.5, colors.HexColor("#e2e8f0")),
        ("LINEBELOW",    (0, 0),(-1, 0), 2, TEAL),
    ]))
    story.append(stbl)
    story.append(PageBreak())

    # ── 6. SIN CONEXIÓN ──
    story.append(section_header("6. Uso sin conexión a internet"))
    story.append(Spacer(1, 0.4*cm))

    story.append(Paragraph("6.1 ¿Qué pasa cuando no hay señal?", H2))
    story.append(Paragraph(
        "La app funciona <b>aunque no tenga internet</b>. Cuando el celular pierde la señal:",
        BODY))
    story.append(Paragraph("• El punto de estado en la parte superior cambia de verde a <b>rojo</b> y dice <b>Sin conexión</b>.", BULLET))
    story.append(Paragraph("• Aparece un aviso amarillo: <i>\"Sin conexión. X registros guardados localmente.\"</i>", BULLET))
    story.append(Paragraph("• Los registros se siguen guardando en el celular normalmente.", BULLET))
    story.append(Paragraph("• Las fincas ya registradas muestran un <b>punto amarillo</b> (pendiente de enviar).", BULLET))
    story.append(Paragraph("• Las fincas ya sincronizadas antes de perder señal mantienen el <b>punto verde</b>.", BULLET))
    story.append(Spacer(1, 0.3*cm))

    ph_off = phone(SCREEN_OFFLINE, "Estado sin conexión")
    off_desc = Paragraph(
        "En la imagen de la derecha puede ver cómo se ve la app sin conexión: "
        "el aviso amarillo en la parte superior, los puntos amarillos en RICARDO CAICEDO "
        "y JULIO CAICEDO (guardados pero no enviados) y el punto verde en OSWALDO GUIO "
        "(que ya había sido sincronizado antes de perder señal).",
        BODY)
    warn_para = warning_box(
        "IMPORTANTE: No cierre la app ni apague el celular con registros en amarillo. "
        "Espere a tener señal para que se sincronicen.")
    two_off = Table(
        [[off_desc, ph_off],
         [warn_para, ""]],
        colWidths=[PAGE_W - 4*cm - ph_off.width - 0.4*cm, ph_off.width + 0.4*cm]
    )
    two_off.setStyle(TableStyle([
        ("VALIGN",       (0,0),(-1,-1), "TOP"),
        ("TOPPADDING",   (0,0),(-1,-1), 0),
        ("BOTTOMPADDING",(0,0),(-1,-1), 4),
        ("LEFTPADDING",  (0,0),(-1,-1), 0),
        ("RIGHTPADDING", (0,0),(-1,-1), 0),
        ("SPAN",         (1,1),(1,1)),
    ]))
    story.append(two_off)
    story.append(Spacer(1, 0.4*cm))

    story.append(Paragraph("6.2 Sincronización automática al volver a tener señal", H2))
    story.append(Paragraph(
        "En cuanto el celular vuelve a conectarse a internet (WiFi o datos móviles), "
        "la app detecta la conexión automáticamente y envía todos los registros pendientes "
        "al servidor. No necesita hacer nada — el proceso es completamente automático.",
        BODY))
    story.append(info_box([
        "Los puntos amarillos cambiarán a verde cuando los datos lleguen al servidor.",
        "El aviso amarillo desaparece y el estado vuelve a 'Sincronizado' (punto verde).",
        "Si algún registro no pudo sincronizarse después de varios intentos, el punto se vuelve rojo. En ese caso avise al administrador.",
    ]))
    story.append(PageBreak())

    # ── 7. EDITAR ──
    story.append(section_header("7. Corregir un error: editar litros registrados"))
    story.append(Spacer(1, 0.4*cm))
    story.append(Paragraph(
        "Si cometió un error al digitar los litros de una finca, puede corregirlo "
        "directamente desde la lista <b>Registradas hoy</b> sin necesidad de borrar y "
        "volver a crear el registro.",
        BODY))
    story.append(Spacer(1, 0.2*cm))

    story.append(step_block(
        1, "Tocar el ícono de lápiz (✎)",
        [
            "En la lista <b>Registradas hoy</b>, busque la finca con el error y toque el ícono "
            "de lápiz <b>✎</b> que aparece a la derecha de los litros.",
            Spacer(1, 0.1*cm),
            "La fila cambia a modo edición: aparece un campo de texto con el valor actual, "
            "un botón de confirmación <b>✓</b> y un botón de cancelar <b>✕</b>.",
        ],
        phone_rows=SCREEN_EDIT,
        phone_caption="Modo edición (OSWALDO GUIO)",
    ))

    story.append(step_block(
        2, "Corregir el valor y confirmar",
        [
            "Borre el valor actual y escriba la cantidad correcta de litros.",
            Spacer(1, 0.1*cm),
            "Toque el botón negro <b>✓</b> para guardar el cambio.",
            Spacer(1, 0.1*cm),
            "Si no quiere cambiar nada, toque <b>✕</b> para cancelar y volver al estado original.",
            Spacer(1, 0.2*cm),
            Paragraph(
                "Después de confirmar, el total de litros acumulados se actualiza automáticamente "
                "y el registro queda sincronizado con el servidor.",
                NOTE),
        ],
        phone_rows=SCREEN_AFTER_EDIT,
        phone_caption="Después de corregir: 290 L",
    ))
    story.append(PageBreak())

    # ── 8. CONSEJOS ──
    story.append(section_header("8. Consejos y buenas prácticas"))
    story.append(Spacer(1, 0.4*cm))

    tips = [
        ("Registre inmediatamente",
         "Registre los litros en cuanto termine de recoger la leche en cada finca, "
         "antes de continuar al siguiente destino. Así evita confundir cantidades."),
        ("Verifique el punto verde",
         "Después de cada registro, confirme que el punto de la finca sea verde (sincronizado). "
         "Si tiene señal y el punto sigue amarillo por más de un minuto, intente recargar la app."),
        ("Sin internet, sin problema",
         "No se preocupe si pierde la señal durante el recorrido. La app guarda todo localmente. "
         "Al terminar el día, conéctese a WiFi y espere que todos los puntos sean verdes "
         "antes de cerrar la app."),
        ("No registre dos veces la misma finca",
         "El sistema solo permite una recolección por finca por día. Si la finca no aparece "
         "en el selector, es porque ya tiene registro. Use la edición (✎) si necesita corregir."),
        ("Batería y memoria",
         "Mantenga el celular cargado durante el recorrido. La app usa muy poca memoria y "
         "no consume datos excesivos. Funciona bien incluso con celulares de gama media-baja."),
        ("Cerrar y volver a abrir",
         "Si vuelve a usar la app al día siguiente, los registros del día anterior ya no "
         "aparecerán en la lista (la app reinicia el conteo cada nuevo día). "
         "Los datos anteriores están seguros en el servidor."),
    ]

    for title, body in tips:
        story.append(KeepTogether([
            Paragraph(f"▸  {title}", H3),
            Paragraph(body, BODY),
            Spacer(1, 0.15*cm),
        ]))

    story.append(PageBreak())

    # ── 9. PREGUNTAS ──
    story.append(section_header("9. Preguntas frecuentes"))
    story.append(Spacer(1, 0.4*cm))

    faqs = [
        ("No puedo iniciar sesión — dice que el correo o contraseña son incorrectos.",
         "Verifique que no haya errores tipográficos en su correo. Las contraseñas distinguen "
         "mayúsculas y minúsculas. Si el problema persiste, contacte al administrador para "
         "que restablezca su contraseña."),
        ("No veo mi itinerario — la app está vacía.",
         "El administrador todavía no le ha asignado un itinerario. "
         "Contacte al administrador de la cooperativa para que le asigne su recorrido."),
        ("La finca que quiero registrar no aparece en el selector.",
         "Esto ocurre porque esa finca ya tiene una recolección registrada para hoy. "
         "Si cree que fue un error, use el ícono de edición (✎) en la lista de registros "
         "para corregir los litros del registro existente."),
        ("El registro se guardó en amarillo y llevo mucho tiempo sin que se vuelva verde.",
         "Verifique que tenga conexión a internet (WiFi o datos). Si tiene señal pero sigue "
         "en amarillo, cierre y vuelva a abrir la app. Si el punto se vuelve rojo, tome una "
         "foto de la pantalla y contacte al administrador."),
        ("¿Puedo usar la app en varios celulares a la vez?",
         "Sí, pero solo con su cuenta. Cada usuario tiene sus propios registros vinculados "
         "a su itinerario asignado. No comparta su usuario y contraseña con otros conductores."),
        ("¿Puedo ver los registros de días anteriores?",
         "La app del conductor solo muestra los registros del día actual. "
         "Para ver el historial completo, el administrador tiene acceso al módulo de "
         "Recolecciones en la versión web de escritorio."),
        ("¿Qué hago si llegué a una finca y el productor no tenía leche?",
         "Simplemente no registre esa finca. Solo registre las fincas donde efectivamente "
         "recogió leche. Las fincas sin registro no aparecerán en el informe del día."),
        ("¿La app funciona en avión o zonas sin señal?",
         "Sí. Puede activar el modo avión y la app sigue funcionando. Los registros se "
         "guardan localmente con punto amarillo. En cuanto vuelva a tener señal, "
         "la sincronización ocurre automáticamente."),
    ]

    for q, a in faqs:
        story.append(KeepTogether([
            Paragraph(f"P: {q}", H3),
            Paragraph(f"R: {a}", BODY),
            Spacer(1, 0.2*cm),
        ]))

    # ── BUILD ──
    doc.build(story, onFirstPage=on_first_page, onLaterPages=on_later_pages)
    print(f"PDF generado: {OUTPUT}")

if __name__ == "__main__":
    build()
