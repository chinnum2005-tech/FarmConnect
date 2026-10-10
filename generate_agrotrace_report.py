from pathlib import Path
import datetime

BASE_DIR = Path(r"c:\Users\chinn\Desktop\AgroTrace")
TEXT_REPORT = BASE_DIR / "agrotrace_folder_report.txt"
PDF_REPORT = BASE_DIR / "agrotrace_folder_report.pdf"
IGNORE_DIRS = {
    "node_modules",
    ".git",
    ".turbo",
    ".cache",
    "__pycache__",
    "packages/prisma/node_modules",
    "blockchain/node_modules",
    "apps/backend/node_modules",
    "apps/web/node_modules",
    "packages/prisma/.prisma",
}

EXCLUDE_PREFIXES = tuple(str(BASE_DIR / p).replace("\\", "/") for p in IGNORE_DIRS)


def should_skip(path: Path) -> bool:
    path_str = str(path).replace("\\", "/")
    return any(path_str.startswith(prefix) for prefix in EXCLUDE_PREFIXES)


def gather_items(base_dir: Path):
    items = []
    for path in sorted(base_dir.rglob("*")):
        if should_skip(path):
            continue
        try:
            stat = path.stat()
        except (OSError, PermissionError):
            continue
        items.append(
            {
                "relative_path": str(path.relative_to(base_dir)).replace("\\", "/"),
                "is_dir": path.is_dir(),
                "suffix": path.suffix.lower() or "(none)",
                "size": stat.st_size,
                "modified": datetime.datetime.fromtimestamp(stat.st_mtime).isoformat(),
            }
        )
    return items


def write_text_report(items, output_path: Path):
    with output_path.open("w", encoding="utf-8") as f:
        f.write("AgroTrace Folder Report\n")
        f.write("Generated: {}\n".format(datetime.datetime.now().isoformat()))
        f.write("Base directory: {}\n\n".format(BASE_DIR))

        f.write("Top-level entries:\n")
        for child in sorted(BASE_DIR.iterdir(), key=lambda p: p.name.lower()):
            if should_skip(child):
                continue
            f.write(f"- {child.name}{'/' if child.is_dir() else ''}\n")
        f.write("\nAll scanned items:\n")
        for item in items:
            kind = "DIR" if item["is_dir"] else "FILE"
            f.write(
                f"{item['relative_path']} | {kind} | {item['suffix']} | {item['size']} | {item['modified']}\n"
            )
    return output_path


def make_pdf_report(items, output_path: Path):
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas
    from reportlab.lib.units import inch
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    from reportlab.platypus import PageBreak
    from reportlab.lib import utils

    doc = SimpleDocTemplate(str(output_path), pagesize=letter,
                            leftMargin=0.75 * inch, rightMargin=0.75 * inch,
                            topMargin=0.75 * inch, bottomMargin=0.75 * inch)
    styles = getSampleStyleSheet()
    story = []
    story.append(Paragraph("AgroTrace Folder Report", styles["Title"]))
    story.append(Paragraph(f"Generated: {datetime.datetime.now().isoformat()}", styles["Normal"]))
    story.append(Spacer(1, 0.2 * inch))
    story.append(Paragraph(f"Base directory: {BASE_DIR}", styles["Normal"]))
    story.append(Spacer(1, 0.2 * inch))

    story.append(Paragraph("Top-level entries:", styles["Heading2"]))
    for child in sorted(BASE_DIR.iterdir(), key=lambda p: p.name.lower()):
        if should_skip(child):
            continue
        story.append(Paragraph(f"• {child.name}{'/' if child.is_dir() else ''}", styles["Normal"]))
    story.append(PageBreak())

    story.append(Paragraph("Detailed scan summary:", styles["Heading2"]))
    max_lines = 2000
    for idx, item in enumerate(items):
        if idx and idx % 70 == 0:
            story.append(PageBreak())
        prefix = "DIR" if item["is_dir"] else "FILE"
        story.append(
            Paragraph(
                f"{item['relative_path']} — {prefix} — {item['suffix']} — {item['size']} bytes — {item['modified']}",
                styles["Bullet"],
            )
        )
    doc.build(story)
    return output_path


if __name__ == "__main__":
    print("Inspecting AgroTrace repository...")
    items = gather_items(BASE_DIR)
    print(f"Found {len(items)} items.")
    print(f"Writing text report to {TEXT_REPORT}")
    write_text_report(items, TEXT_REPORT)
    print(f"Writing PDF report to {PDF_REPORT}")
    try:
        make_pdf_report(items, PDF_REPORT)
        print("PDF report generated successfully.")
    except Exception as e:
        print("PDF report generation failed:", type(e).__name__, e)
        print("The text report is still available at", TEXT_REPORT)
