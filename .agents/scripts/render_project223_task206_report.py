from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[2]
PDF = ROOT / ".agents/outputs/project-223-task206-predictive-nt-replay/report.pdf"
OUT = ROOT / ".agents/outputs/project-223-task206-predictive-nt-replay/rendered"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    metadata = subprocess.check_output(["pdfinfo", str(PDF)], text=True)
    page_count = int(
        next(line.split(":", 1)[1] for line in metadata.splitlines() if line.startswith("Pages:"))
    )
    selected = sorted(set([1, 2, 3, max(1, page_count - 1), page_count]))
    for page_number in selected:
        target = OUT / f"page-{page_number:02d}"
        subprocess.run(
            [
                "pdftoppm",
                "-f",
                str(page_number),
                "-l",
                str(page_number),
                "-png",
                "-r",
                "144",
                "-singlefile",
                str(PDF),
                str(target),
            ],
            check=True,
        )
    print({"pageCount": page_count, "renderedPages": selected})


if __name__ == "__main__":
    main()