"""Regression check for sjis_to_utf8 converter.

For each *.sjis.txt in the source directory, convert with the current
converter in memory and compare against the corresponding *.utf8.txt in
the reference directory. Reports any files whose output differs.

Usage:
    uv run python scripts/regression_check_sjis.py
    uv run python scripts/regression_check_sjis.py --sjis-dir /path/to/sjis --ref-dir /path/to/utf-8
    uv run python scripts/regression_check_sjis.py --concurrency 16
"""

import argparse
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path

from aozora_data.sjis_to_utf8.converter import convert_content

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

DEFAULT_SJIS_DIR = "/Users/ksato/git/py-aozora-data/sjis"
DEFAULT_REF_DIR = "/Users/ksato/git/py-aozora-data/utf-8"
DEFAULT_CONCURRENCY = 8


@dataclass
class Stats:
    identical: int = 0
    different: int = 0
    missing: int = 0
    errors: int = 0

    @property
    def total(self) -> int:
        return self.identical + self.different + self.missing + self.errors

    def report(self) -> None:
        logger.info(
            "Done. total=%d identical=%d different=%d missing=%d errors=%d",
            self.total,
            self.identical,
            self.different,
            self.missing,
            self.errors,
        )


def _normalize_line_endings(text: str) -> str:
    """Normalise CRLF and lone CR to LF."""
    return text.replace("\r\n", "\n").replace("\r", "\n")


def first_differing_line(new: str, ref: str) -> tuple[int, str, str]:
    """Return (line_number, new_line, ref_line) for the first differing line.

    Line endings are normalised before comparison so CRLF/CR vs LF differences
    do not obscure genuine content differences.
    """
    new_lines = _normalize_line_endings(new).splitlines()
    ref_lines = _normalize_line_endings(ref).splitlines()
    for i, (a, b) in enumerate(zip(new_lines, ref_lines), 1):
        if a != b:
            return i, a, b
    # One is a prefix of the other
    lineno = min(len(new_lines), len(ref_lines)) + 1
    new_line = new_lines[lineno - 1] if lineno <= len(new_lines) else "<missing>"
    ref_line = ref_lines[lineno - 1] if lineno <= len(ref_lines) else "<missing>"
    return lineno, new_line, ref_line


def check_file(sjis_path: Path, ref_dir: Path) -> str:
    """Convert one SJIS file and compare against the reference UTF-8 output.

    Returns one of: 'identical', 'different', 'missing', 'error'.
    """
    book_id = sjis_path.name.replace(".sjis.txt", "")
    ref_path = ref_dir / f"{book_id}.utf8.txt"

    # Convert in memory
    try:
        new_text = convert_content(sjis_path.read_bytes())
    except Exception as e:
        logger.error("Convert error %s: %s", sjis_path.name, e)
        return "error"

    # Load reference
    if not ref_path.exists():
        logger.warning("Missing reference: %s", ref_path.name)
        return "missing"

    try:
        ref_text = ref_path.read_text(encoding="utf-8")
    except Exception as e:
        logger.error("Read error %s: %s", ref_path.name, e)
        return "error"

    # Normalise line endings before comparing: the reference files were written
    # in binary mode, preserving the original CRLF (or lone CR) from Shift JIS sources.
    # read_text() converts CRLF→LF, so we normalise both sides to avoid
    # false positives from line-ending differences alone.
    if _normalize_line_endings(new_text) == _normalize_line_endings(ref_text):
        return "identical"

    # Report the first differing line
    lineno, new_line, ref_line = first_differing_line(new_text, ref_text)
    logger.warning(
        "DIFF %s  line %d\n  new: %r\n  ref: %r",
        sjis_path.name,
        lineno,
        new_line[:120],
        ref_line[:120],
    )
    return "different"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--sjis-dir", default=DEFAULT_SJIS_DIR,
                        help="Directory of *.sjis.txt source files (default: %(default)s)")
    parser.add_argument("--ref-dir", default=DEFAULT_REF_DIR,
                        help="Directory of *.utf8.txt reference files (default: %(default)s)")
    parser.add_argument("--concurrency", type=int, default=DEFAULT_CONCURRENCY, metavar="N",
                        help="Parallel workers (default: %(default)s)")
    args = parser.parse_args()

    sjis_dir = Path(args.sjis_dir)
    ref_dir = Path(args.ref_dir)

    for d in (sjis_dir, ref_dir):
        if not d.is_dir():
            parser.error(f"directory not found: {d}")

    sjis_files = sorted(sjis_dir.glob("*.sjis.txt"))
    logger.info("Checking %d files (concurrency=%d)…", len(sjis_files), args.concurrency)

    stats = Stats()

    with ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        futures = {executor.submit(check_file, p, ref_dir): p for p in sjis_files}
        for future in as_completed(futures):
            match future.result():
                case "identical":
                    stats.identical += 1
                case "different":
                    stats.different += 1
                case "missing":
                    stats.missing += 1
                case "error":
                    stats.errors += 1

    stats.report()
    if stats.different or stats.errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
