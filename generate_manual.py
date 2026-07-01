"""
Manual de Usuario - Toca Lácteos
Generado automáticamente con ReportLab
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm, mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Image, PageBreak,
    Table, TableStyle, HRFlowable, KeepTogether
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.lib.utils import ImageReader
from PIL import Image as PILImage
import os, io

# ── Paths ──────────────────────────────────────────────────────────────────────
BASE   = "/sessions/nice-laughing-albattani/mnt/FincaToca"
SHOTS  = f"{BASE}/public/screenshots"
OUTPUT = f"{BASE}/Manual_Usuario_TocaLacteos.pdf"

# ── Colors ─────────────────────────────────────────────────────────────────────
DARK_BG    = colors.HexColor("#0f172a")   # sidebar dark
TEAL       = colors.HexColor("#14b8a6")   # accent teal
TEAL_LIGHT = colors.HexColor("#ccfbf1")
WHITE      = colors.white
GRAY_DARK  = colors.HexColor("#334155")
GRAY_MED   = colors.HexColor("#64748b")
GRAY_LIGHT = colors.HexColor("#f1f5f9")

# ── Styles ─────────────────────────────────────────────────────────────────────
styles = getSampleStyleSheet()

def S(name, **kw):
    return ParagraphStyle(name, **kw)

COVER_TITLE = S("CoverTitle",
    fontName="Helvetica-Bold", fontSize=36, textColor=WHITE,
    alignment=TA_CENTER, spaceAfter=8, leading=44)

COVER_SUB = S("CoverSub",
    fontName="Helvetica", fontSize=16, textColor=TEAL,
    alignment=TA_CENTER, spaceAfter=6)

COVER_DATE = S("CoverDate",
    fontName="Helvetica", fontSize=12, textColor=colors.HexColor("#94a3b8"),
    alignment=TA_CENTER)

H1 = S("H1",
    fontName="Helvetica-Bold", fontSize=22, textColor=DARK_BG,
    spaceAfter=10, spaceBefore=20, leading=28)

H2 = S("H2",
    fontName="Helvetica-Bold", fontSize=15, textColor=TEAL,
    spaceAfter=6, spaceBefore=14, leading=20)

H3 = S("H3",
    fontName="Helvetica-Bold", fontSize=12, textColor=GRAY_DARK,
    spaceAfter=4, spaceBefore=10)

BODY = S("Body",
    fontName="Helvetica", fontSize=10, textColor=GRAY_DARK,
    spaceAfter=6, leading=16, alignment=TA_JUSTIFY)

BULLET = S("Bullet",
    fontName="Helvetica", fontSize=10, textColor=GRAY_DARK,
    spaceAfter=3, leading=15, leftIndent=14, firstLineIndent=-8)

CAPTION = S("Caption",
    fontName="Helvetica-Oblique", fontSize=8, textColor=GRAY_MED,
    spaceAfter=12, alignment=TA_CENTER)

NOTE = S("Note",
    fontName="Helvetica-Oblique", fontSize=9, textColor=GRAY_MED,
    spaceAfter=8, leading=14)

TOC_H1 = S("TOCH1",
    fontName="Helvetica-Bold", fontSize=12, textColor=DARK_BG,
    spaceAfter=4, leading=16)

TOC_H2 = S("TOCH2",
    fontName="Helvetica", fontSize=10, textColor=GRAY_MED,
    spaceAfter=3, leading=14, leftIndent=12)

PAGE_W, PAGE_H = A4

# ── Helpers ────────────────────────────────────────────────────────────────────

def fit_image(path, max_w=14*cm, max_h=12*cm):
    """Return a ReportLab Image scaled to fit within max_w x max_h."""
    with PILImage.open(path) as im:
        w, h = im.size
    ratio = min(max_w / w, max_h / h)
    return Image(path, width=w*ratio, height=h*ratio)


def section_header(title, icon=""):
    """Colored section header band."""
    tbl = Table([[Paragraph(f"{icon}  {title}" if icon else title, S("SH",
        fontName="Helvetica-Bold", fontSize=18, textColor=WHITE,
        leading=24, spaceAfter=0))]], colWidths=[PAGE_W - 4*cm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), DARK_BG),
        ("TOPPADDING",  (0,0), (-1,-1), 10),
        ("BOTTOMPADDING",(0,0), (-1,-1), 10),
        ("LEFTPADDING", (0,0), (-1,-1), 16),
        ("ROUNDEDCORNERS", [4]),
    ]))
    return tbl


def info_box(items):
    """Green info box with bullet list."""
    rows = [[Paragraph(f"• {i}", S("IB",
        fontName="Helvetica", fontSize=9, textColor=GRAY_DARK,
        leading=14, spaceAfter=0))] for i in items]
    tbl = Table(rows, colWidths=[PAGE_W - 4*cm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), TEAL_LIGHT),
        ("TOPPADDING",  (0,0), (-1,-1), 4),
        ("BOTTOMPADDING",(0,0), (-1,-1), 4),
        ("LEFTPADDING", (0,0), (-1,-1), 10),
        ("RIGHTPADDING",(0,0), (-1,-1), 10),
        ("LINEABOVE",   (0,0), (-1, 0), 2, TEAL),
        ("LINEBELOW",   (0,-1),(-1,-1), 0.5, TEAL),
    ]))
    return tbl


def roles_table():
    header = ["Rol", "Acceso", "Permisos"]
    rows = [
        ["cooperativa_admin",
         "Dashboard, Fincas, Rutas, Itinerarios,\nRecolecciones, Informes, Usuarios",
         "Lectura y escritura completa.\nPuede crear/editar/eliminar registros\ny gestionar usuarios."],
        ["cooperativa_user",
         "Dashboard (solo su ruta),\nRecolecciones",
         "Solo puede registrar recolecciones\nde las fincas de su ruta asignada.\nLectura limitada."],
        ["admin",
         "Dashboard finca, Gastos, Ingresos,\nExtracciones, Vacas, Toros, etc.",
         "Acceso completo al módulo de\ngestión de finca. No accede al\nmódulo cooperativa."],
        ["user",
         "Mismos módulos que admin",
         "Lectura y escritura en módulos\nde finca. Sin gestión de usuarios."],
        ["viewer",
         "Módulos de finca (solo lectura)",
         "Solo puede ver registros.\nNo puede crear ni editar."],
    ]
    data = [header] + rows
    col_w = [(PAGE_W - 4*cm) * p for p in [0.22, 0.40, 0.38]]
    tbl = Table(data, colWidths=col_w)
    tbl.setStyle(TableStyle([
        ("BACKGROUND",   (0,0), (-1, 0), DARK_BG),
        ("TEXTCOLOR",    (0,0), (-1, 0), WHITE),
        ("FONTNAME",     (0,0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE",     (0,0), (-1,-1), 9),
        ("FONTNAME",     (0,1), (-1,-1), "Helvetica"),
        ("TEXTCOLOR",    (0,1), (-1,-1), GRAY_DARK),
        ("ALIGN",        (0,0), (-1,-1), "LEFT"),
        ("VALIGN",       (0,0), (-1,-1), "TOP"),
        ("TOPPADDING",   (0,0), (-1,-1), 6),
        ("BOTTOMPADDING",(0,0), (-1,-1), 6),
        ("LEFTPADDING",  (0,0), (-1,-1), 8),
        ("RIGHTPADDING", (0,0), (-1,-1), 8),
        ("ROWBACKGROUNDS",(0,1),(-1,-1), [WHITE, GRAY_LIGHT]),
        ("GRID",         (0,0), (-1,-1), 0.5, colors.HexColor("#e2e8f0")),
        ("LINEBELOW",    (0, 0),(-1, 0), 2,   TEAL),
    ]))
    return tbl


# ── Page templates ─────────────────────────────────────────────────────────────

def on_first_page(canvas, doc):
    pass   # Cover page – no header/footer

def on_later_pages(canvas, doc):
    canvas.saveState()
    w, h = A4
    # Header line
    canvas.setFillColor(DARK_BG)
    canvas.rect(0, h - 1.6*cm, w, 1.6*cm, fill=1, stroke=0)
    canvas.setFillColor(TEAL)
    canvas.setFont("Helvetica-Bold", 9)
    canvas.drawString(2*cm, h - 1.0*cm, "Toca Lácteos")
    canvas.setFillColor(colors.HexColor("#94a3b8"))
    canvas.setFont("Helvetica", 9)
    canvas.drawRightString(w - 2*cm, h - 1.0*cm, "Manual de Usuario — Administrador")
    # Footer
    canvas.setFillColor(GRAY_LIGHT)
    canvas.rect(0, 0, w, 1.0*cm, fill=1, stroke=0)
    canvas.setFillColor(GRAY_MED)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(2*cm, 0.35*cm, "© 2026 Toca Lácteos · Uso interno")
    canvas.drawRightString(w - 2*cm, 0.35*cm, f"Página {doc.page}")
    canvas.restoreState()


# ── Build story ────────────────────────────────────────────────────────────────

def build():
    doc = SimpleDocTemplate(
        OUTPUT,
        pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2.5*cm, bottomMargin=2*cm,
        title="Manual de Usuario — Toca Lácteos",
        author="Sistema Toca Lácteos",
    )

    story = []

    # ╔══════════════════════════════════════════════════════╗
    # ║                   PORTADA                            ║
    # ╚══════════════════════════════════════════════════════╝
    # Full-page dark cover
    cover_table = Table(
        [[
            Paragraph("TOCA LÁCTEOS", COVER_TITLE),
            Paragraph("Manual de Usuario", COVER_SUB),
            Paragraph("Módulo Cooperativa — Guía del Administrador", COVER_SUB),
            Spacer(1, 0.5*cm),
            Paragraph("Versión 1.0  ·  Junio 2026", COVER_DATE),
        ]],
        colWidths=[PAGE_W - 4*cm]
    )
    # We build the cover page manually via a flowable
    from reportlab.platypus import Flowable

    class CoverPage(Flowable):
        def draw(self):
            c = self.canv
            w, h = A4
            # Dark background
            c.setFillColor(DARK_BG)
            c.rect(-2*cm, -2*cm, w + 4*cm, h + 4*cm, fill=1, stroke=0)
            # Teal accent bar top
            c.setFillColor(TEAL)
            c.rect(-2*cm, h - 3*cm - 2*cm, w + 4*cm, 0.5*cm, fill=1, stroke=0)
            # Teal accent bar bottom
            c.rect(-2*cm, -2*cm, w + 4*cm, 0.5*cm, fill=1, stroke=0)
            # Main title
            c.setFillColor(WHITE)
            c.setFont("Helvetica-Bold", 40)
            c.drawCentredString(w/2 - 2*cm, h/2, "TOCA LÁCTEOS")
            # Teal line under title
            c.setStrokeColor(TEAL)
            c.setLineWidth(2)
            c.line(w/4 - 2*cm, h/2 - 0.5*cm, 3*w/4 - 2*cm, h/2 - 0.5*cm)
            # Subtitle
            c.setFillColor(TEAL)
            c.setFont("Helvetica-Bold", 18)
            c.drawCentredString(w/2 - 2*cm, h/2 - 1.5*cm, "Manual de Usuario")
            # Sub-subtitle
            c.setFillColor(colors.HexColor("#94a3b8"))
            c.setFont("Helvetica", 13)
            c.drawCentredString(w/2 - 2*cm, h/2 - 2.4*cm,
                "Módulo Cooperativa — Guía del Administrador")
            # Version / date
            c.setFont("Helvetica", 10)
            c.drawCentredString(w/2 - 2*cm, h/2 - 3.4*cm, "Versión 1.0  ·  Junio 2026")
            # Bottom label
            c.setFillColor(colors.HexColor("#475569"))
            c.setFont("Helvetica", 9)
            c.drawCentredString(w/2 - 2*cm, 1.5*cm - 2*cm,
                "CONFIDENCIAL — Solo para uso interno")

        def wrap(self, availW, availH):
            return (availW, availH)

    story.append(CoverPage())
    story.append(PageBreak())

    # ╔══════════════════════════════════════════════════════╗
    # ║               TABLA DE CONTENIDO                     ║
    # ╚══════════════════════════════════════════════════════╝
    story.append(Paragraph("Contenido", H1))
    story.append(HRFlowable(width="100%", thickness=2, color=TEAL, spaceAfter=10))

    toc_entries = [
        ("1. Introducción y Acceso al Sistema", "H1"),
        ("2. Roles y Permisos", "H1"),
        ("3. Dashboard Cooperativa", "H1"),
        ("   3.1 Tarjetas de resumen", "H2"),
        ("   3.2 Gráfico Litros por Día", "H2"),
        ("   3.3 Filtrar por mes", "H2"),
        ("4. Módulo Fincas", "H1"),
        ("   4.1 Lista de fincas", "H2"),
        ("   4.2 Crear y editar una finca", "H2"),
        ("5. Módulo Rutas", "H1"),
        ("   5.1 Gestión de rutas", "H2"),
        ("   5.2 Asignación de fincas y orden", "H2"),
        ("6. Módulo Itinerarios", "H1"),
        ("7. Módulo Recolecciones", "H1"),
        ("   7.1 Registrar una recolección", "H2"),
        ("   7.2 Filtros y búsqueda", "H2"),
        ("8. Módulo Informes", "H1"),
        ("   8.1 Generar informe Excel", "H2"),
        ("   8.2 Comprobantes de pago", "H2"),
        ("9. Módulo Usuarios", "H1"),
        ("10. Preguntas Frecuentes", "H1"),
    ]

    for label, level in toc_entries:
        st = TOC_H1 if level == "H1" else TOC_H2
        story.append(Paragraph(label, st))

    story.append(PageBreak())

    # ╔══════════════════════════════════════════════════════╗
    # ║          1. INTRODUCCIÓN Y ACCESO                    ║
    # ╚══════════════════════════════════════════════════════╝
    story.append(section_header("1. Introducción y Acceso al Sistema"))
    story.append(Spacer(1, 0.4*cm))

    story.append(Paragraph("¿Qué es Toca Lácteos?", H2))
    story.append(Paragraph(
        "Toca Lácteos es una plataforma web de gestión para cooperativas lecheras. "
        "Permite administrar las fincas afiliadas, las rutas de recolección, los registros "
        "diarios de litros recogidos, la generación de informes económicos y la asignación "
        "de conductores o recolectores a cada ruta.",
        BODY))

    story.append(Paragraph("Acceso al sistema", H2))
    story.append(Paragraph(
        "Para ingresar, abra un navegador web y dirígase a la URL del sistema. "
        "Se mostrará la pantalla de inicio de sesión donde debe ingresar su correo "
        "electrónico y contraseña asignados por el administrador.",
        BODY))

    story.append(info_box([
        "URL del sistema: http://localhost:3000  (o la URL de producción asignada)",
        "Ingrese su correo y contraseña en la pantalla de login.",
        "Si olvidó su contraseña, contacte al administrador del sistema.",
        "La sesión es segura y persistente en el mismo navegador.",
    ]))
    story.append(Spacer(1, 0.3*cm))

    story.append(Paragraph("Navegación general", H2))
    story.append(Paragraph(
        "Una vez autenticado, verá el panel principal con la barra lateral izquierda que "
        "contiene el menú de navegación. Cada ítem del menú corresponde a un módulo del sistema. "
        "En la esquina superior derecha se muestra su correo y el botón <b>Salir</b> para cerrar sesión.",
        BODY))

    story.append(PageBreak())

    # ╔══════════════════════════════════════════════════════╗
    # ║          2. ROLES Y PERMISOS                         ║
    # ╚══════════════════════════════════════════════════════╝
    story.append(section_header("2. Roles y Permisos"))
    story.append(Spacer(1, 0.4*cm))

    story.append(Paragraph(
        "El sistema cuenta con un modelo de roles que define qué puede ver y hacer cada usuario. "
        "Los roles están almacenados en la base de datos y son asignados por el administrador. "
        "A continuación se describe cada rol:",
        BODY))
    story.append(Spacer(1, 0.3*cm))
    story.append(roles_table())
    story.append(Spacer(1, 0.4*cm))

    story.append(Paragraph("Roles del módulo Cooperativa", H2))
    story.append(Paragraph(
        "Este manual está enfocado en el rol <b>cooperativa_admin</b>, que tiene acceso total "
        "a todos los módulos de la cooperativa. El rol <b>cooperativa_user</b> está pensado "
        "para conductores o recolectores de campo que solo registran las recolecciones de "
        "las fincas de su ruta asignada.",
        BODY))

    story.append(info_box([
        "cooperativa_admin: Ve todos los módulos. Puede crear, editar y eliminar cualquier registro.",
        "cooperativa_user: Solo ve el Dashboard y Recolecciones, filtrado por su ruta asignada.",
        "Si un cooperativa_user no tiene ruta asignada, verá el Dashboard vacío.",
        "Los roles admin/user/viewer son exclusivos del módulo de gestión de finca (no cooperativa).",
    ]))

    story.append(PageBreak())

    # ╔══════════════════════════════════════════════════════╗
    # ║          3. DASHBOARD COOPERATIVA                    ║
    # ╚══════════════════════════════════════════════════════╝
    story.append(section_header("3. Dashboard Cooperativa"))
    story.append(Spacer(1, 0.4*cm))

    story.append(Paragraph(
        "El Dashboard es la pantalla principal que se muestra al iniciar sesión. "
        "Ofrece un resumen ejecutivo del mes en curso con métricas clave de la cooperativa.",
        BODY))
    story.append(Spacer(1, 0.2*cm))

    img_dash = fit_image(f"{SHOTS}/01_dashboard_cooperativa.png", max_w=15*cm, max_h=13*cm)
    story.append(img_dash)
    story.append(Paragraph("Figura 1: Dashboard principal de Toca Lácteos", CAPTION))

    story.append(Paragraph("3.1 Tarjetas de resumen", H2))
    story.append(Paragraph(
        "En la parte superior del dashboard se muestran cuatro tarjetas con indicadores clave:",
        BODY))

    kpi_data = [
        ["Tarjeta", "Descripción"],
        ["Litros Recolectados",
         "Total de litros recogidos en el mes. Se desglosa por quincena (Q1 = días 1–15, Q2 = días 16–fin de mes)."],
        ["Valor Comprado",
         "Monto total pagado a las fincas por los litros recolectados en el mes, con desglose "
         "por quincena y descuento Fedegan (0.75%) aplicado."],
        ["Fincas Activas",
         "Número total de fincas registradas, cuántas tuvieron recolección en el mes actual "
         "y cuántas rutas están activas."],
        ["Promedio por Finca",
         "Promedio de litros recolectados por finca activa en el mes."],
    ]
    kpi_w = [(PAGE_W - 4*cm) * p for p in [0.28, 0.72]]
    kpi_tbl = Table(kpi_data, colWidths=kpi_w)
    kpi_tbl.setStyle(TableStyle([
        ("BACKGROUND",   (0,0), (-1, 0), DARK_BG),
        ("TEXTCOLOR",    (0,0), (-1, 0), WHITE),
        ("FONTNAME",     (0,0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME",     (0,1), (-1,-1), "Helvetica"),
        ("FONTSIZE",     (0,0), (-1,-1), 9),
        ("TEXTCOLOR",    (0,1), (-1,-1), GRAY_DARK),
        ("VALIGN",       (0,0), (-1,-1), "TOP"),
        ("TOPPADDING",   (0,0), (-1,-1), 6),
        ("BOTTOMPADDING",(0,0), (-1,-1), 6),
        ("LEFTPADDING",  (0,0), (-1,-1), 8),
        ("ROWBACKGROUNDS",(0,1),(-1,-1), [WHITE, GRAY_LIGHT]),
        ("GRID",         (0,0), (-1,-1), 0.5, colors.HexColor("#e2e8f0")),
        ("LINEBELOW",    (0,0), (-1, 0), 2, TEAL),
    ]))
    story.append(kpi_tbl)
    story.append(Spacer(1, 0.4*cm))

    story.append(Paragraph("3.2 Gráfico Litros por Día", H2))
    story.append(Paragraph(
        "Debajo de las tarjetas se muestra un gráfico de línea con la evolución diaria "
        "de los litros recolectados en el mes filtrado. Permite identificar visualmente "
        "los picos y valles en la producción de leche. Al pasar el cursor sobre los puntos "
        "del gráfico se muestran los valores exactos del día.",
        BODY))

    story.append(Paragraph("3.3 Filtrar por mes", H2))
    story.append(Paragraph(
        "En la esquina superior derecha del dashboard hay un botón <b>Filtrar por mes</b>. "
        "Al hacer clic, se abre un selector que permite elegir el mes y año que se desea visualizar. "
        "Esto filtra tanto las tarjetas de KPI como el gráfico para mostrar los datos del período seleccionado.",
        BODY))

    story.append(PageBreak())

    # ╔══════════════════════════════════════════════════════╗
    # ║          4. MÓDULO FINCAS                            ║
    # ╚══════════════════════════════════════════════════════╝
    story.append(section_header("4. Módulo Fincas"))
    story.append(Spacer(1, 0.4*cm))

    story.append(Paragraph(
        "El módulo de Fincas permite gestionar el catálogo completo de fincas proveedoras "
        "de leche afiliadas a la cooperativa. Cada finca tiene un nombre, un precio por litro "
        "específico y un estado (activa/inactiva).",
        BODY))
    story.append(Spacer(1, 0.2*cm))

    img_fincas = fit_image(f"{SHOTS}/02_fincas.png", max_w=15*cm, max_h=11*cm)
    story.append(img_fincas)
    story.append(Paragraph("Figura 2: Módulo de gestión de Fincas", CAPTION))

    story.append(Paragraph("4.1 Lista de fincas", H2))
    story.append(Paragraph(
        "La tabla principal muestra todas las fincas registradas con sus columnas de "
        "nombre, precio por litro y estado. La tabla tiene las siguientes funcionalidades:",
        BODY))
    story.append(Paragraph("• Búsqueda y filtrado por nombre de finca.", BULLET))
    story.append(Paragraph("• Ordenamiento por cualquier columna haciendo clic en el encabezado.", BULLET))
    story.append(Paragraph("• Paginación automática cuando hay muchos registros.", BULLET))
    story.append(Paragraph("• Botón de <b>ver detalle</b> (ícono ojo) disponible para todos los roles.", BULLET))
    story.append(Spacer(1, 0.2*cm))

    story.append(Paragraph("4.2 Crear y editar una finca", H2))
    story.append(Paragraph(
        "Solo los usuarios con rol <b>cooperativa_admin</b> pueden crear, editar y desactivar fincas. "
        "Para crear una nueva finca, haga clic en el botón <b>Nueva Finca</b> en la parte superior derecha. "
        "Se abrirá un formulario modal con los siguientes campos:",
        BODY))
    story.append(info_box([
        "Nombre: Nombre de identificación de la finca (obligatorio).",
        "Precio por litro: Valor en pesos que se paga por litro recolectado (obligatorio).",
        "Activa: Casilla de verificación. Las fincas inactivas no aparecen en el selector de recolecciones.",
    ]))
    story.append(Spacer(1, 0.2*cm))
    story.append(Paragraph(
        "Para editar una finca existente, haga clic en el ícono de <b>lápiz</b> en la fila correspondiente. "
        "El mismo formulario se abrirá con los datos actuales precargados para modificación.",
        BODY))

    story.append(PageBreak())

    # ╔══════════════════════════════════════════════════════╗
    # ║          5. MÓDULO RUTAS                             ║
    # ╚══════════════════════════════════════════════════════╝
    story.append(section_header("5. Módulo Rutas"))
    story.append(Spacer(1, 0.4*cm))

    story.append(Paragraph(
        "Las rutas agrupan fincas en recorridos lógicos de recolección. Cada ruta puede "
        "tener múltiples fincas asignadas en un orden específico. Los conductores o "
        "recolectores son asignados a rutas (no a fincas individuales).",
        BODY))
    story.append(Spacer(1, 0.2*cm))

    img_rutas = fit_image(f"{SHOTS}/03_rutas.png", max_w=15*cm, max_h=10*cm)
    story.append(img_rutas)
    story.append(Paragraph("Figura 3: Módulo de gestión de Rutas", CAPTION))

    story.append(Paragraph("5.1 Gestión de rutas", H2))
    story.append(Paragraph(
        "La tabla principal muestra las rutas existentes con su nombre y la cantidad de "
        "fincas asociadas. Para crear una nueva ruta, haga clic en <b>Nueva Ruta</b> e "
        "ingrese el nombre del recorrido.",
        BODY))

    story.append(Paragraph("5.2 Asignación de fincas y orden de visita", H2))
    story.append(Paragraph(
        "Cada ruta tiene un editor de fincas donde el administrador puede:",
        BODY))
    story.append(Paragraph("• <b>Agregar fincas</b> a la ruta usando el selector de búsqueda.", BULLET))
    story.append(Paragraph("• <b>Reordenar las fincas</b> arrastrando y soltando (drag & drop) para definir el orden de visita del conductor.", BULLET))
    story.append(Paragraph("• <b>Eliminar una finca</b> de la ruta haciendo clic en el ícono de papelera.", BULLET))
    story.append(Spacer(1, 0.2*cm))
    story.append(Paragraph(
        "El orden de las fincas en la ruta es importante porque determina el orden en que "
        "aparecen en los informes y comprobantes de pago.",
        NOTE))

    story.append(PageBreak())

    # ╔══════════════════════════════════════════════════════╗
    # ║          6. MÓDULO ITINERARIOS                       ║
    # ╚══════════════════════════════════════════════════════╝
    story.append(section_header("6. Módulo Itinerarios"))
    story.append(Spacer(1, 0.4*cm))

    story.append(Paragraph(
        "El módulo de Itinerarios permite definir recorridos alternativos o temporales "
        "agrupando fincas en un orden específico, similar a las Rutas pero con un "
        "propósito más flexible (por ejemplo, para recolecciones especiales o temporadas).",
        BODY))
    story.append(Spacer(1, 0.2*cm))

    img_it = fit_image(f"{SHOTS}/04_itinerarios.png", max_w=15*cm, max_h=12*cm)
    story.append(img_it)
    story.append(Paragraph("Figura 4: Módulo de Itinerarios", CAPTION))

    story.append(Paragraph("Funcionamiento", H2))
    story.append(Paragraph(
        "Al igual que en el módulo de Rutas, cada itinerario puede tener múltiples fincas "
        "asignadas y ordenadas por arrastre. Los itinerarios pueden asignarse a usuarios "
        "específicos a través del módulo de Usuarios.",
        BODY))
    story.append(info_box([
        "Un itinerario es una secuencia de fincas con orden definido.",
        "Los itinerarios se asignan a usuarios (conductores) individualmente.",
        "A diferencia de las Rutas (asignación por rol cooperativa_user), los itinerarios son más flexibles.",
    ]))

    story.append(PageBreak())

    # ╔══════════════════════════════════════════════════════╗
    # ║          7. MÓDULO RECOLECCIONES                     ║
    # ╚══════════════════════════════════════════════════════╝
    story.append(section_header("7. Módulo Recolecciones"))
    story.append(Spacer(1, 0.4*cm))

    story.append(Paragraph(
        "Las recolecciones son el registro central de la operación: cada vez que se recoge "
        "leche en una finca se registra aquí con la fecha, los litros y el precio por litro "
        "vigente. Este módulo alimenta directamente los informes y el dashboard.",
        BODY))
    story.append(Spacer(1, 0.2*cm))

    img_rec = fit_image(f"{SHOTS}/05_recolecciones.png", max_w=15*cm, max_h=11*cm)
    story.append(img_rec)
    story.append(Paragraph("Figura 5: Módulo de Recolecciones", CAPTION))

    story.append(Paragraph("7.1 Registrar una recolección", H2))
    story.append(Paragraph(
        "Para registrar una nueva recolección, haga clic en <b>Nueva Recolección</b>. "
        "Se abrirá un formulario con los campos:",
        BODY))

    rec_data = [
        ["Campo", "Descripción", "Obligatorio"],
        ["Finca", "Selector de finca (solo muestra fincas activas que no tienen recolección ese día)", "Sí"],
        ["Fecha", "Fecha de la recolección", "Sí"],
        ["Litros", "Cantidad de litros recogidos", "Sí"],
        ["Precio por litro", "Se autocompleta con el precio configurado en la finca, editable", "Sí"],
    ]
    rec_w = [(PAGE_W - 4*cm) * p for p in [0.20, 0.58, 0.22]]
    rec_tbl = Table(rec_data, colWidths=rec_w)
    rec_tbl.setStyle(TableStyle([
        ("BACKGROUND",   (0,0), (-1, 0), DARK_BG),
        ("TEXTCOLOR",    (0,0), (-1, 0), WHITE),
        ("FONTNAME",     (0,0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME",     (0,1), (-1,-1), "Helvetica"),
        ("FONTSIZE",     (0,0), (-1,-1), 9),
        ("TEXTCOLOR",    (0,1), (-1,-1), GRAY_DARK),
        ("ALIGN",        (2,0), (2,-1),  "CENTER"),
        ("VALIGN",       (0,0), (-1,-1), "TOP"),
        ("TOPPADDING",   (0,0), (-1,-1), 6),
        ("BOTTOMPADDING",(0,0), (-1,-1), 6),
        ("LEFTPADDING",  (0,0), (-1,-1), 8),
        ("ROWBACKGROUNDS",(0,1),(-1,-1), [WHITE, GRAY_LIGHT]),
        ("GRID",         (0,0), (-1,-1), 0.5, colors.HexColor("#e2e8f0")),
        ("LINEBELOW",    (0,0), (-1, 0), 2, TEAL),
    ]))
    story.append(rec_tbl)
    story.append(Spacer(1, 0.3*cm))

    story.append(Paragraph(
        "<b>Restricción importante:</b> El sistema no permite registrar dos recolecciones "
        "para la misma finca en el mismo día. Si ya existe una recolección para esa "
        "combinación finca/fecha, la finca no aparecerá en el selector.",
        NOTE))

    story.append(Paragraph("7.2 Filtros y búsqueda", H2))
    story.append(Paragraph(
        "La tabla de recolecciones incluye filtros por nombre de finca, ruta y rango de fechas. "
        "Los administradores ven todas las recolecciones de todas las rutas. "
        "Los usuarios con rol <b>cooperativa_user</b> solo ven las recolecciones de las fincas "
        "pertenecientes a su ruta asignada.",
        BODY))

    story.append(PageBreak())

    # ╔══════════════════════════════════════════════════════╗
    # ║          8. MÓDULO INFORMES                          ║
    # ╚══════════════════════════════════════════════════════╝
    story.append(section_header("8. Módulo Informes"))
    story.append(Spacer(1, 0.4*cm))

    story.append(Paragraph(
        "El módulo de Informes permite generar archivos Excel (.xlsx) con el resumen "
        "económico de las recolecciones. Solo es accesible para el rol <b>cooperativa_admin</b>. "
        "Existen dos tipos de documentos: Informes de liquidación e Informes de comprobantes de pago.",
        BODY))
    story.append(Spacer(1, 0.2*cm))

    img_inf = fit_image(f"{SHOTS}/06_informes.png", max_w=15*cm, max_h=10*cm)
    story.append(img_inf)
    story.append(Paragraph("Figura 6: Módulo de Informes y generación de reportes Excel", CAPTION))

    story.append(Paragraph("8.1 Generar informe de liquidación Excel", H2))
    story.append(Paragraph(
        "Para generar un informe, configure los siguientes parámetros en el formulario:",
        BODY))
    story.append(info_box([
        "Tipo: 'Finca' (una sola finca), 'Ruta' (todas las fincas de una ruta) o 'General' (toda la cooperativa).",
        "Finca/Ruta: Seleccione la finca o ruta según el tipo elegido.",
        "Período: Quincena 1 (días 1–15) o Quincena 2 (días 16 a fin de mes).",
        "Mes y Año: Período de tiempo del informe.",
    ]))
    story.append(Spacer(1, 0.2*cm))
    story.append(Paragraph(
        "El informe generado contiene: nombre de la finca, total de litros Q1 y Q2, "
        "valor bruto (litros × precio/litro), descuento Fedegan (0.75%), y valor neto a pagar. "
        "Para el tipo 'General', el informe agrupa las fincas por ruta con subtotales por ruta.",
        BODY))

    story.append(Paragraph("8.2 Comprobantes de pago", H2))
    story.append(Paragraph(
        "Los comprobantes de pago son un formato especial diseñado para imprimir "
        "y entregar a los productores. Se generan en una grilla de 3×3 por página A4, "
        "con un comprobante por finca que muestra:",
        BODY))
    story.append(Paragraph("• Nombre de la finca y ruta", BULLET))
    story.append(Paragraph("• Período del comprobante", BULLET))
    story.append(Paragraph("• Litros recolectados y valor bruto", BULLET))
    story.append(Paragraph("• Descuento Fedegan y subtotal", BULLET))
    story.append(Paragraph("• Saldo anterior y total final a pagar", BULLET))
    story.append(Spacer(1, 0.2*cm))
    story.append(Paragraph(
        "Los comprobantes soportan rango de fechas libre (no solo quincenas), "
        "lo que permite generar comprobantes para cualquier período personalizado. "
        "Las fincas sin litros en el período seleccionado se excluyen automáticamente.",
        NOTE))

    story.append(PageBreak())

    # ╔══════════════════════════════════════════════════════╗
    # ║          9. MÓDULO USUARIOS                          ║
    # ╚══════════════════════════════════════════════════════╝
    story.append(section_header("9. Módulo Usuarios"))
    story.append(Spacer(1, 0.4*cm))

    story.append(Paragraph(
        "El módulo de Usuarios es exclusivo del <b>cooperativa_admin</b> y permite gestionar "
        "los conductores o recolectores de campo que tienen acceso al sistema con el rol "
        "<b>cooperativa_user</b>.",
        BODY))
    story.append(Spacer(1, 0.2*cm))

    img_usr = fit_image(f"{SHOTS}/07_usuarios.png", max_w=15*cm, max_h=10*cm)
    story.append(img_usr)
    story.append(Paragraph("Figura 7: Módulo de gestión de Usuarios", CAPTION))

    story.append(Paragraph("Funcionalidades", H2))
    story.append(Paragraph(
        "La tabla muestra todos los usuarios con rol <b>cooperativa_user</b> "
        "registrados en el sistema, junto con la ruta que tienen asignada.",
        BODY))
    story.append(info_box([
        "Ver lista de todos los conductores/recolectores registrados.",
        "Asignar o cambiar la ruta de un usuario (un usuario solo puede tener una ruta a la vez).",
        "Un usuario sin ruta asignada verá el dashboard vacío cuando inicie sesión.",
        "La asignación de ruta determina qué fincas puede ver y registrar el cooperativa_user.",
    ]))
    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph(
        "<b>Nota:</b> La creación de nuevas cuentas de usuario se realiza directamente "
        "en el panel de administración de Supabase (la base de datos del sistema). "
        "Una vez creado el usuario, el administrador asigna el rol y la ruta desde este módulo.",
        NOTE))

    story.append(PageBreak())

    # ╔══════════════════════════════════════════════════════╗
    # ║          10. PREGUNTAS FRECUENTES                    ║
    # ╚══════════════════════════════════════════════════════╝
    story.append(section_header("10. Preguntas Frecuentes"))
    story.append(Spacer(1, 0.4*cm))

    faqs = [
        ("¿Puedo registrar dos recolecciones de la misma finca el mismo día?",
         "No. El sistema tiene una restricción que impide registrar más de una recolección "
         "por finca por día. Si intenta hacerlo, la finca no aparecerá en el selector de fincas "
         "del formulario de nueva recolección para esa fecha."),
        ("¿Por qué no veo algunas fincas en el selector de recolecciones?",
         "Las fincas pueden estar ocultas si: (1) están marcadas como inactivas, o "
         "(2) ya tienen una recolección registrada para esa fecha."),
        ("¿Cómo se calcula el descuento Fedegan?",
         "El descuento Fedegan es del 0.75% sobre el valor bruto (litros × precio/litro). "
         "Se aplica automáticamente en el dashboard, los informes y los comprobantes de pago."),
        ("¿Qué diferencia hay entre Q1 y Q2?",
         "Q1 (Primera quincena) comprende los días 1 al 15 del mes. "
         "Q2 (Segunda quincena) comprende los días 16 al último día del mes. "
         "Esta división aparece en las tarjetas del dashboard y en los informes."),
        ("¿El cooperativa_user puede ver los informes?",
         "No. El módulo de Informes solo es accesible para el rol cooperativa_admin. "
         "El cooperativa_user solo puede ver el Dashboard (filtrado a su ruta) y registrar recolecciones."),
        ("¿Cómo cambio la ruta asignada a un conductor?",
         "Vaya al módulo Usuarios, encuentre al conductor en la tabla y haga clic en el "
         "ícono de edición. Seleccione la nueva ruta en el selector y guarde. "
         "El cambio es efectivo de inmediato."),
        ("¿Se pueden eliminar recolecciones registradas?",
         "Sí, pero solo el cooperativa_admin puede eliminar registros. "
         "El cooperativa_user puede crear registros pero no eliminarlos. "
         "Sea cuidadoso al eliminar recolecciones pues esto afecta los totales del dashboard e informes."),
        ("¿Los informes soportan rangos de fechas personalizados?",
         "Para los informes Excel de liquidación solo se soporta modo quincena (Q1 o Q2). "
         "Los comprobantes de pago sí soportan rango de fechas libre (fechaDesde / fechaHasta), "
         "incluyendo rangos que cruzan diferentes meses."),
    ]

    for i, (q, a) in enumerate(faqs):
        story.append(KeepTogether([
            Paragraph(f"P: {q}", H3),
            Paragraph(f"R: {a}", BODY),
            Spacer(1, 0.2*cm),
        ]))

    # ── Final page: quick ref ───────────────────────────────────────────────
    story.append(PageBreak())
    story.append(section_header("Referencia rápida — URLs del sistema"))
    story.append(Spacer(1, 0.4*cm))

    url_data = [
        ["Módulo", "URL", "Acceso"],
        ["Login", "/login", "Todos"],
        ["Dashboard Cooperativa", "/dashboard/cooperativa", "cooperativa_admin, cooperativa_user"],
        ["Fincas", "/dashboard/fincas-cooperativa", "cooperativa_admin"],
        ["Rutas", "/dashboard/rutas-cooperativa", "cooperativa_admin"],
        ["Itinerarios", "/dashboard/itinerarios", "cooperativa_admin"],
        ["Recolecciones", "/dashboard/recolecciones", "cooperativa_admin, cooperativa_user"],
        ["Informes", "/dashboard/informes-cooperativa", "cooperativa_admin"],
        ["Usuarios", "/dashboard/usuarios-cooperativa", "cooperativa_admin"],
    ]
    url_w = [(PAGE_W - 4*cm) * p for p in [0.26, 0.42, 0.32]]
    url_tbl = Table(url_data, colWidths=url_w)
    url_tbl.setStyle(TableStyle([
        ("BACKGROUND",   (0,0), (-1, 0), DARK_BG),
        ("TEXTCOLOR",    (0,0), (-1, 0), WHITE),
        ("FONTNAME",     (0,0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME",     (0,1), (-1,-1), "Helvetica"),
        ("FONTSIZE",     (0,0), (-1,-1), 9),
        ("TEXTCOLOR",    (0,1), (-1,-1), GRAY_DARK),
        ("VALIGN",       (0,0), (-1,-1), "TOP"),
        ("TOPPADDING",   (0,0), (-1,-1), 6),
        ("BOTTOMPADDING",(0,0), (-1,-1), 6),
        ("LEFTPADDING",  (0,0), (-1,-1), 8),
        ("ROWBACKGROUNDS",(0,1),(-1,-1), [WHITE, GRAY_LIGHT]),
        ("GRID",         (0,0), (-1,-1), 0.5, colors.HexColor("#e2e8f0")),
        ("LINEBELOW",    (0,0), (-1, 0), 2, TEAL),
    ]))
    story.append(url_tbl)

    # ── Build ───────────────────────────────────────────────────────────────
    doc.build(
        story,
        onFirstPage=on_first_page,
        onLaterPages=on_later_pages,
    )
    print(f"PDF generado: {OUTPUT}")


if __name__ == "__main__":
    build()
