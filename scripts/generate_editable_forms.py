from pathlib import Path
from dataclasses import dataclass
import shutil
import subprocess

from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf"
PREVIEWS = ROOT / "tmp" / "pdfs"
PUBLIC = ROOT / "public" / "editable-forms"
OUTPUT.mkdir(parents=True, exist_ok=True)
PREVIEWS.mkdir(parents=True, exist_ok=True)
PUBLIC.mkdir(parents=True, exist_ok=True)

NAVY = HexColor("#061849")
BLUE = HexColor("#244C91")
GOLD = HexColor("#F4B400")
PALE_BLUE = HexColor("#EAF0FB")
PALE_GOLD = HexColor("#FFF5D6")
INK = HexColor("#1C2737")
MUTED = HexColor("#687486")
LINE = HexColor("#C7D2E2")


@dataclass(frozen=True)
class Brand:
    slug: str
    name: str
    monogram: str
    descriptor: str
    primary: str
    accent: str


BRANDS = {
    "apex": Brand("apex-components", "APEX COMPONENTS", "AC", "PRECISION INDUSTRIAL COMPONENTS", "#123B66", "#47B7C8"),
    "deshazo_fleet": Brand("deshazo-field-service-fleet", "DESHAZO FIELD SERVICE FLEET", "DF", "FIELD OPERATIONS AND FLEET SERVICES", "#061849", "#F4B400"),
    "northline": Brand("northline-foundry", "NORTHLINE FOUNDRY", "NF", "FOUNDRY OPERATIONS AND MAINTENANCE", "#2D333B", "#D97732"),
    "riverbend": Brand("riverbend-steel", "RIVERBEND STEEL", "RS", "STEEL PROCESSING AND FIELD OPERATIONS", "#234B63", "#B76A45"),
    "summit": Brand("summit-packaging", "SUMMIT PACKAGING", "SP", "PACKAGING SYSTEMS AND OPERATIONS", "#205B4F", "#8DBB55"),
}


def text(c, x, y, value, size=8, color=INK, font="Helvetica"):
    c.setFillColor(color)
    c.setFont(font, size)
    c.drawString(x, y, value)


def line(c, x1, y1, x2, y2, color=LINE, width=0.7):
    c.setStrokeColor(color)
    c.setLineWidth(width)
    c.line(x1, y1, x2, y2)


def section_bar(c, y, title, subtitle=""):
    c.setFillColor(PALE_BLUE)
    c.roundRect(36, y - 18, 540, 24, 5, fill=1, stroke=0)
    text(c, 46, y - 9, title.upper(), 9, NAVY, "Helvetica-Bold")
    if subtitle:
        text(c, 566 - c.stringWidth(subtitle, "Helvetica", 7), y - 9, subtitle, 7, MUTED)


def labeled_line(c, x, y, label, width, value_hint=""):
    text(c, x, y, label.upper(), 6.5, MUTED, "Helvetica-Bold")
    if value_hint:
        text(c, x, y - 12, value_hint, 8, HexColor("#A0AABA"))
    line(c, x, y - 15, x + width, y - 15)


def header(c, brand, document_title, form_code):
    primary = HexColor(brand.primary)
    accent = HexColor(brand.accent)
    c.setFillColor(primary)
    c.rect(0, 724, 612, 68, fill=1, stroke=0)
    c.setFillColor(accent)
    c.roundRect(36, 742, 44, 32, 5, fill=1, stroke=0)
    monogram_width = c.stringWidth(brand.monogram, "Helvetica-Bold", 13)
    text(c, 58 - monogram_width / 2, 752, brand.monogram, 13, primary, "Helvetica-Bold")
    brand_size = 17 if len(brand.name) <= 20 else 12.5
    text(c, 92, 758, brand.name, brand_size, white, "Helvetica-Bold")
    text(c, 93, 744, brand.descriptor, 6.2, HexColor("#D4DCE8"), "Helvetica-Bold")
    title_width = c.stringWidth(document_title, "Helvetica-Bold", 12)
    text(c, 576 - title_width, 758, document_title, 12, white, "Helvetica-Bold")
    code_width = c.stringWidth(form_code, "Helvetica", 7)
    text(c, 576 - code_width, 744, form_code, 7, HexColor("#BFC9DD"))


def footer(c, brand, form_code):
    line(c, 36, 34, 576, 34, HexColor("#AAB7CA"))
    text(c, 36, 20, f"{brand.name} - CONTROLLED FORM", 6.5, MUTED, "Helvetica-Bold")
    text(c, 491, 20, f"{form_code}  |  PAGE 1 OF 1", 6.5, MUTED, "Helvetica-Bold")


def build_work_order(brand, revision):
    path = OUTPUT / f"{brand.slug}-preventative-maintenance-work-order.pdf"
    c = canvas.Canvas(str(path), pagesize=letter)
    c.setTitle("Preventative Maintenance Work Order")
    form_code = f"FORM PM-WO  |  REV {revision}"
    header(c, brand, "PREVENTATIVE MAINTENANCE WORK ORDER", form_code)

    text(c, 36, 704, "Customer-specific field service record", 8, BLUE, "Helvetica-Bold")
    text(c, 409, 704, "STATUS", 6.5, MUTED, "Helvetica-Bold")
    c.setFillColor(PALE_GOLD)
    c.roundRect(454, 695, 122, 18, 5, fill=1, stroke=0)
    text(c, 476, 701, "TECHNICIAN DRAFT", 7, HexColor("#8A6200"), "Helvetica-Bold")

    section_bar(c, 674, "Customer and work order", "Complete before service begins")
    labeled_line(c, 46, 638, "Customer company", 238, "Enter customer legal name")
    labeled_line(c, 310, 638, "Work order number", 118, "WO-000000")
    labeled_line(c, 454, 638, "Service date", 112, "MM / DD / YYYY")
    labeled_line(c, 46, 599, "Service address", 238, "Street, city, state, ZIP")
    labeled_line(c, 310, 599, "Customer contact", 118, "Full name")
    labeled_line(c, 454, 599, "Phone", 112, "(000) 000-0000")

    section_bar(c, 560, "Service details", "Describe work completed and operating condition")
    text(c, 46, 531, "SCOPE OF WORK / SERVICE PERFORMED", 6.5, MUTED, "Helvetica-Bold")
    c.setFillColor(white)
    c.setStrokeColor(LINE)
    c.roundRect(46, 450, 520, 70, 4, fill=1, stroke=1)
    text(c, 56, 504, "Document the requested service, inspection findings, adjustments, and testing performed.", 7.5, HexColor("#A0AABA"))
    for y in (489, 474, 459):
        line(c, 56, y, 556, y, HexColor("#E1E7F0"), 0.5)

    section_bar(c, 428, "Labor and materials", "Enter billable quantities")
    c.setFillColor(NAVY)
    c.rect(46, 375, 520, 23, fill=1, stroke=0)
    headers = [(56, "DESCRIPTION"), (344, "HOURS / QTY"), (420, "RATE"), (490, "AMOUNT")]
    for x, value in headers:
        text(c, x, 383, value, 6.5, white, "Helvetica-Bold")
    for row_y in (350, 325, 300):
        c.setFillColor(white)
        c.setStrokeColor(LINE)
        c.rect(46, row_y, 520, 25, fill=1, stroke=1)
        for x in (334, 410, 480):
            line(c, x, row_y, x, row_y + 25)
    text(c, 56, 359, "Labor / service activity", 7, HexColor("#A0AABA"))
    text(c, 56, 334, "Parts and materials", 7, HexColor("#A0AABA"))
    text(c, 56, 309, "Equipment rental / other", 7, HexColor("#A0AABA"))

    section_bar(c, 278, "Authorization and totals", "Customer review required")
    labeled_line(c, 46, 241, "Technician name", 220, "Printed name")
    labeled_line(c, 46, 202, "Technician signature", 220, "Sign and date")
    labeled_line(c, 46, 163, "Customer signature", 220, "Sign and date")
    c.setFillColor(PALE_BLUE)
    c.roundRect(310, 150, 256, 93, 6, fill=1, stroke=0)
    totals = [(225, "LABOR TOTAL"), (204, "MATERIALS TOTAL"), (183, "TAX / FEES"), (162, "TOTAL")]
    for y, label in totals:
        text(c, 326, y, label, 7, MUTED if label != "TOTAL" else NAVY, "Helvetica-Bold")
        line(c, 456, y - 3, 550, y - 3, HexColor("#B6C4D8"))
    text(c, 46, 116, "CUSTOMER ACKNOWLEDGEMENT", 6.5, MUTED, "Helvetica-Bold")
    text(c, 46, 101, "I acknowledge that the services and materials recorded above were reviewed with me.", 7, INK)
    text(c, 46, 87, "Any follow-up recommendations will be documented on the associated service report.", 7, MUTED)
    footer(c, brand, "PM-WO")
    c.save()
    return path


def checkbox_row(c, x, y, width, title, detail):
    c.setFillColor(white)
    c.setStrokeColor(LINE)
    c.roundRect(x, y - 34, width, 32, 4, fill=1, stroke=1)
    text(c, x + 10, y - 14, title.upper(), 7.2, NAVY, "Helvetica-Bold")
    text(c, x + 10, y - 26, detail, 6.2, MUTED)
    labels = [(x + width - 110, "OK"), (x + width - 73, "REPAIR"), (x + width - 27, "N/A")]
    for bx, label in labels:
        c.setStrokeColor(BLUE)
        c.rect(bx, y - 20, 8, 8, fill=0, stroke=1)
        text(c, bx + 11, y - 19, label, 5.5, MUTED, "Helvetica-Bold")


def build_vehicle_inspection(brand, revision):
    path = OUTPUT / f"{brand.slug}-annual-vehicle-inspection.pdf"
    c = canvas.Canvas(str(path), pagesize=letter)
    c.setTitle("Annual Periodic Vehicle Inspection")
    form_code = f"FORM FLT-AVI  |  REV {revision}"
    header(c, brand, "ANNUAL PERIODIC VEHICLE INSPECTION", form_code)

    text(c, 36, 704, "Annual fleet condition and compliance record", 8, BLUE, "Helvetica-Bold")
    c.setFillColor(PALE_GOLD)
    c.roundRect(456, 695, 120, 18, 5, fill=1, stroke=0)
    text(c, 475, 701, "ANNUAL INSPECTION", 7, HexColor("#8A6200"), "Helvetica-Bold")

    section_bar(c, 674, "Vehicle and inspector", "Record identifying information")
    labeled_line(c, 46, 638, "Carrier / company", 238, "Company name")
    labeled_line(c, 310, 638, "Inspector", 256, "Qualified inspector name")
    labeled_line(c, 46, 599, "Vehicle number", 118, "Unit 000")
    labeled_line(c, 190, 599, "VIN", 238, "17-character VIN")
    labeled_line(c, 454, 599, "Inspection date", 112, "MM / DD / YYYY")

    section_bar(c, 560, "Vehicle systems", "Mark OK, Repair, or N/A for every system")
    rows = [
        ("Brake system", "Service, parking, hoses, drums, ABS"),
        ("Coupling devices", "Fifth wheel, pintle hook, safety devices"),
        ("Exhaust and fuel", "Leaks, routing, tanks, caps, mounting"),
        ("Lighting devices", "Headlamps, signals, markers, reflectors"),
        ("Safe loading", "Load securement, body, doors, tailgate"),
        ("Steering and suspension", "Linkage, frame, springs, shocks"),
        ("Tires, wheels, and rims", "Tread, inflation, fasteners, cracks"),
        ("Glazing and wipers", "Windshield, visibility, washers, blades"),
    ]
    y = 529
    for index in range(0, len(rows), 2):
        checkbox_row(c, 46, y, 254, rows[index][0], rows[index][1])
        checkbox_row(c, 312, y, 254, rows[index + 1][0], rows[index + 1][1])
        y -= 42

    section_bar(c, 352, "Deficiencies and corrective action", "Describe every item marked Repair")
    c.setFillColor(white)
    c.setStrokeColor(LINE)
    c.roundRect(46, 245, 520, 88, 4, fill=1, stroke=1)
    text(c, 56, 316, "SYSTEM / COMPONENT", 6.5, MUTED, "Helvetica-Bold")
    text(c, 260, 316, "DEFICIENCY AND REQUIRED ACTION", 6.5, MUTED, "Helvetica-Bold")
    text(c, 487, 316, "REPAIRED", 6.5, MUTED, "Helvetica-Bold")
    for row_y in (300, 280, 260):
        line(c, 46, row_y, 566, row_y)
    line(c, 245, 245, 245, 333)
    line(c, 475, 245, 475, 333)

    section_bar(c, 224, "Inspector certification", "Signature and qualification required")
    text(c, 46, 192, "I certify that I inspected the vehicle systems listed above and accurately recorded their condition.", 7.5, INK)
    text(c, 46, 178, "The vehicle is safe to operate except for deficiencies clearly identified in this report.", 7.5, MUTED)
    labeled_line(c, 46, 148, "Inspector signature", 238, "Sign and date")
    labeled_line(c, 310, 148, "Certification / qualification", 256, "Credential or qualification reference")
    labeled_line(c, 46, 105, "Vehicle owner acknowledgement", 238, "Printed name and signature")
    labeled_line(c, 310, 105, "Next inspection due", 118, "MM / DD / YYYY")
    c.setFillColor(PALE_GOLD)
    c.roundRect(454, 76, 112, 30, 5, fill=1, stroke=0)
    text(c, 469, 94, "OVERALL RESULT", 6, HexColor("#8A6200"), "Helvetica-Bold")
    text(c, 469, 82, "PASS  /  REPAIR", 7, NAVY, "Helvetica-Bold")
    footer(c, brand, "FLT-AVI")
    c.save()
    return path


def publish(generated_forms):
    renderer = shutil.which("pdftoppm")
    if not renderer:
        raise RuntimeError("pdftoppm is required to render the form preview images")

    legacy_names = (
        "annual-vehicle-inspection.pdf",
        "annual-vehicle-inspection.png",
        "preventative-maintenance-work-order.pdf",
        "preventative-maintenance-work-order.png",
    )
    for directory in (OUTPUT, PUBLIC):
        for name in legacy_names:
            stale = directory / name
            if stale.exists():
                stale.unlink()

    for pdf_path in generated_forms:
        public_pdf = PUBLIC / pdf_path.name
        shutil.copy2(pdf_path, public_pdf)
        preview_prefix = PREVIEWS / pdf_path.stem
        subprocess.run(
            [renderer, "-f", "1", "-singlefile", "-r", "150", "-png", str(pdf_path), str(preview_prefix)],
            check=True,
        )
        preview_path = preview_prefix.with_suffix(".png")
        shutil.copy2(preview_path, PUBLIC / f"{pdf_path.stem}.png")
        preview_path.unlink()


if __name__ == "__main__":
    generated_forms = (
        build_vehicle_inspection(BRANDS["apex"], "2.1"),
        build_vehicle_inspection(BRANDS["deshazo_fleet"], "2.4"),
        build_work_order(BRANDS["northline"], "3.0"),
        build_work_order(BRANDS["riverbend"], "3.2"),
        build_vehicle_inspection(BRANDS["riverbend"], "0.8 DRAFT"),
        build_work_order(BRANDS["summit"], "2.7"),
    )
    publish(generated_forms)
    for generated in generated_forms:
        print(generated)
