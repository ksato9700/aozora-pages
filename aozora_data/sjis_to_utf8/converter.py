"""Converter module for Shift JIS to UTF-8 with Gaiji support."""

import re

# ruff: noqa: RUF001, RUF002, RUF003

from .gaiji_table import GAIJI_TABLE

# Matches the innermost ［＃...］ annotation (no nested ［＃ inside).
# (?:※)? — optional reference mark prefix
_GAIJI_PATTERN = re.compile(r"(?:※)?［＃(?:(?!［＃).)+?］")

# Matches a placeholder reference inside an annotation: ［＃「X」はY
_PH_PATTERN = re.compile(r"［＃「(.+?)」は")


def get_gaiji(s: str) -> str:
    """Resolve an Aozora Bunko Gaiji annotation string to a Unicode character.

    Examples:
        ※［＃「弓＋椁のつくり」、第3水準1-84-22］
        ※［＃「身＋單」、U+8EC3、56-1］

    """
    # Safety: If string contains nested annotations (multiple ［＃), do not resolve.
    # This happens when a note quotes another annotation, e.g. ［＃「※［＃...］...
    if s.count("［＃") > 1:
        return s

    # Pattern 1: JIS X 0213 plane/row/cell
    # e.g., 第3水準1-84-22 -> plane=1, row=84, cell=22 (in user snippet logic context?)
    # User snippet: m = re.search(r'第(\d)水準\d-(\d{1,2})-(\d{1,2})', s)
    # key = f'{m[1]}-{int(m[2])+32:2X}{int(m[3])+32:2X}'
    # This logic constructs the key format found in the table (e.g., 3-XXXX).
    # Wait, the table keys are like "3-2121".
    # 3-2121 corresponds to: Plane 1 (of JIS X 0213), Row 1, Cell 1 ? No.
    # JIS X 0213 Plane 1 is mapped to prefix "3-" in the file provided?
    # File header says:
    # 3-XXXX	JIS X 0213:2004 plane 1 (GL encoding)
    # 4-XXXX	JIS X 0213:2000 plane 2 (GL encoding)
    # The user snippet logic: key = f'{m[1]}-{int(m[2])+32:2X}{int(m[3])+32:2X}'
    # m[1] is the plane number from "第(N)水準".
    # Actually "第3水準" usually refers to JIS X 0213 Plane 1. "第4水準" is Plane 2.
    # The snippet takes m[1] (which creates '3' or '4').
    # Then takes row and cell, adds 32 (0x20) to convert to GL encoding byte values?
    # Example: 1-84-22. 84+32=116 (0x74). 22+32=54 (0x36). Key: "3-7436" if m[1]=3.

    m = re.search(r"第(\d)水準\d-(\d{1,2})-(\d{1,2})", s)
    if m:
        # m[1] is likely 3 or 4.
        # table keys format: "3-XXXX" where XXXX is hex bytes.
        key = f"{int(m[1])}-{int(m[2]) + 32:2X}{int(m[3]) + 32:2X}"
        return GAIJI_TABLE.get(key, s)

    # Pattern 2: Generic JIS X 0213 plane/row/cell (potentially with text prefix)
    # e.g., ※［＃全角メートル、1-13-35］ -> 1-13-35
    # Mapping: Plane 1 (1-...) -> Key prefix '3'
    #          Plane 2 (2-...) -> Key prefix '4'
    m = re.search(r"(\d)-(\d{1,2})-(\d{1,2})", s)
    if m:
        plane = int(m[1])
        row = int(m[2])
        cell = int(m[3])

        # Map planes to table key prefixes
        prefix = plane
        if plane == 1:
            prefix = 3
        elif plane == 2:
            prefix = 4

        key = f"{prefix}-{row + 32:2X}{cell + 32:2X}"
        return GAIJI_TABLE.get(key, s)

    # Pattern 3: Direct Unicode Reference
    # e.g., U+8EC3
    m = re.search(r"U\+(\w{4})", s)
    if m:
        return chr(int(m[1], 16))

    # Return original string if no match found
    return s


def sub_gaiji(text: str) -> str:
    """Replace Aozora Bunko Gaiji annotations in the text.

    Handles standard patterns like ※［＃...］ and also
    patterns where a placeholder character precedes the annotation,
    e.g. 1［＃「1」は...］ -> Replace '1' with the gaiji char.

    Supports nested annotations by iteratively resolving innermost tags first.
    Iterates until no further substitutions are made (typically one pass).
    """
    for _ in range(10):  # iteration cap handles rare nesting; exits after 1 pass in common case
        result = []
        last_end = 0
        changed = False

        for m in _GAIJI_PATTERN.finditer(text):
            annotation = m.group(0)
            replacement = get_gaiji(annotation)
            preceding = text[last_end:m.start()]

            # Placeholder removal: if the annotation contains 「X」は and resolves
            # to a short substitution, strip the preceding occurrence of X.
            ph_m = _PH_PATTERN.search(annotation)
            if ph_m and replacement != annotation and len(replacement) < 4:
                placeholder = ph_m.group(1)
                if preceding.endswith(placeholder):
                    preceding = preceding[: -len(placeholder)]
                    changed = True

            if replacement != annotation:
                changed = True

            result.append(preceding)
            result.append(replacement)
            last_end = m.end()

        if not changed:
            break

        result.append(text[last_end:])
        text = "".join(result)

    return text


def _replace_backslash_in_bytes(content: bytes) -> bytes:
    r"""Safely replace 0x815F (Fullwidth Backslash) with a placeholder.

    JIS X 0213:2004 codec maps 0x815F to '\' (U+005C), losing the full-width distinction.
    We identify 0x815F in the byte stream (ensuring 0x81 is a lead byte) and replace it.
    """
    new_content = bytearray()
    i = 0
    n = len(content)
    # Null byte cannot appear in valid Shift JIS text, so it is a safe sentinel.
    placeholder = b"\x00"

    while i < n:
        b = content[i]
        # Lead byte check: 0x81-0x9F, 0xE0-0xFC
        is_lead = (0x81 <= b <= 0x9F) or (0xE0 <= b <= 0xFC)

        if is_lead and i + 1 < n:
            b2 = content[i + 1]
            if b == 0x81 and b2 == 0x5F:
                new_content.extend(placeholder)
                i += 2
                continue

            # Copy valid lead+trail
            new_content.append(b)
            new_content.append(b2)
            i += 2
        else:
            # ASCII or isolated trail (shouldn't happen in valid SJIS)
            new_content.append(b)
            i += 1

    return bytes(new_content)


def convert_content(content: bytes) -> str:
    """Decode Shift JIS (JIS X 0208) bytes to a UTF-8 string and replaces Aozora Bunko Gaiji.

    Args:
        content: The bytes content encoded in Shift JIS.

    Returns:
        The decoded string (Unicode) with Gaiji replaced.

    """
    # Pre-process to protect 0x815F (Fullwidth Backslash) from being normalized to '\'
    content = _replace_backslash_in_bytes(content)

    # Using 'shift_jis_2004' (JIS X 0213:2004) to support both:
    # 1. Common ext characters like ① (0x8740) which are in JIS X 0213
    # 2. Rare JIS X 0213 kanji like 譃 (U+8B43) which are NOT in CP932
    text = content.decode("shift_jis_2004")

    # Restore Fullwidth Backslash
    text = text.replace("\x00", "＼")

    return sub_gaiji(text)


def convert_file(src_path: str, dest_path: str) -> None:
    """Read a Shift JIS file and saves it as a UTF-8 file with Gaiji replacement.

    Args:
        src_path: Path to the source file (Shift JIS).
        dest_path: Path to the destination file (will be UTF-8).

    """
    with open(src_path, "rb") as f:
        content = f.read()

    decoded_content = convert_content(content)

    # Write as UTF-8
    with open(dest_path, "w", encoding="utf-8") as f:
        f.write(decoded_content)
