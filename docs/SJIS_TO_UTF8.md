# sjis_to_utf8 — Aozora Bunko Shift JIS to UTF-8 Converter

## Overview

`aozora_data/sjis_to_utf8/` converts Aozora Bunko text files from Shift JIS (JIS X 0213:2004) to UTF-8, with special handling for **gaiji** (外字) — characters outside the standard Shift JIS range that Aozora Bunko encodes as structured text annotations.

---

## Background

Aozora Bunko originally published texts in Shift JIS. Characters not representable in standard Shift JIS are encoded as gaiji annotations — inline markup that describes the character by name and its JIS X 0213 or Unicode code point. This converter:

1. Decodes Shift JIS bytes to Unicode using the `shift_jis_2004` codec
2. Resolves gaiji annotations to their actual Unicode characters
3. Pre-processes one known codec edge case (fullwidth backslash)

---

## Input Format

Shift JIS files (`*.sjis.txt`) from the Aozora Bunko ZIP archives. Files may contain:

- **Standard Shift JIS text** — decoded normally by the `shift_jis_2004` codec
- **CP932 extensions** — characters like `①` (0x8740) that are in CP932 and also covered by `shift_jis_2004`
- **Gaiji annotations** — two forms:

  ```
  ※［＃「弓＋椁のつくり」、第3水準1-84-22］   ← JIS X 0213 plane/row/cell
  ※［＃「身＋單」、U+8EC3、56-1］              ← Direct Unicode code point
  ※［＃全角メートル、1-13-35］                  ← Generic plane-row-cell (no description)
  ```

- **Placeholder annotations** — the annotation describes a replacement for the character immediately preceding it:

  ```
  詩集1［＃「1」はローマ数字、1-13-21］   →   詩集Ⅰ
  ```

- **Editorial notes** — annotations that describe textual differences from the source book (not gaiji; must be left unchanged):

  ```
  ［＃「譃」は底本では「謔」］
  ```

---

## Output Format

UTF-8 text with all gaiji annotations replaced by their corresponding Unicode characters. Non-gaiji annotations (editorial notes) are preserved as-is.

---

## Gaiji Resolution

### Annotation forms

| Form | Example | Resolution |
|---|---|---|
| `第N水準P-R-C` | `第3水準1-84-22` | JIS X 0213 table lookup |
| `U+XXXX` | `U+8EC3` | Direct `chr(0x8EC3)` |
| Generic `P-R-C` | `1-13-35` | JIS X 0213 table lookup |

### JIS X 0213 table key format

The JIS X 0213 standard uses GL (Graphic Left) encoding. The table keys are:

```
"3-XXXX"   JIS X 0213 Plane 1  (第3水準 or P=1 in generic form)
"4-XXXX"   JIS X 0213 Plane 2  (第4水準 or P=2 in generic form)
```

Where `XXXX` is a 4-digit uppercase hex string computed as:

```python
key = f"{prefix}-{row + 32:2X}{cell + 32:2X}"
```

Adding 32 (0x20) converts from 1-based row/cell to GL-encoded byte values.

Example: `第3水準1-84-22` → `prefix=3, row=84, cell=22` → `key="3-7436"` → `U+5F34` (弴)

### Placeholder removal

When an annotation has the form `「placeholder」は...` and the resolved character is a valid single-character substitution (length < 4), the converter also removes the placeholder text that immediately precedes the annotation in the source:

```
詩集1［＃「1」はローマ数字、1-13-21］
      ↑ placeholder "1" removed and replaced by Ⅰ
→ 詩集Ⅰ
```

### Iterative resolution

`sub_gaiji()` processes annotations in a loop, always targeting the innermost annotation (no nested `［＃` inside). This handles rare cases where gaiji annotations are nested. Each pass continues until no further substitutions are made.

---

## Codec Choice: `shift_jis_2004`

Python's `shift_jis_2004` codec (JIS X 0213:2004) is used instead of `cp932` because:

- It covers JIS X 0213 Plane 1 and Plane 2 characters not in CP932 (e.g., `譃` U+8B43)
- It also handles CP932 extensions like `①` (0x8740) that appear in older Aozora files

### Fullwidth backslash edge case

`shift_jis_2004` normalises byte sequence `0x815F` to `\` (U+005C, ASCII backslash), losing the fullwidth distinction. A byte-level pre-processing step (`_replace_backslash_in_bytes`) identifies `0x815F` in the byte stream and substitutes a placeholder string before decoding. After decoding, the placeholder is replaced with `＼` (U+FF3C, fullwidth backslash).

---

## Module Structure

| File | Responsibility |
|---|---|
| `converter.py` | Core conversion logic |
| `gaiji_table.py` | Pre-generated JIS X 0213 → Unicode dict (~11,000 entries) |
| `cli.py` | Single-file CLI entry point |
| `aozora_data/convert_all.py` | Batch converter: `sjis/*.sjis.txt` → `utf-8/*.utf8.txt` |

### `converter.py` functions

| Function | Responsibility |
|---|---|
| `convert_file(src, dst)` | Read Shift JIS file, write UTF-8 file |
| `convert_content(content)` | Decode bytes → preprocess backslash → decode → `sub_gaiji` |
| `_replace_backslash_in_bytes(content)` | Byte-level 0x815F → placeholder substitution |
| `sub_gaiji(text)` | Iteratively replace all gaiji annotations in a string |
| `get_gaiji(s)` | Resolve a single annotation string to a Unicode character |
| `load_gaiji_table()` | Deprecated no-op; table is imported from `gaiji_table.py` |

### `gaiji_table.py`

Auto-generated Python dict with ~11,000 entries. Keys are JIS X 0213 GL-encoded strings (`"3-XXXX"` / `"4-XXXX"`); values are Unicode characters or strings. The comment at the top of the file references `scripts/generate_gaiji_table.py` as the generator.

---

## Usage

### Single file (CLI)

```bash
uv run sjis-to-utf8 <input.sjis.txt> <output.utf8.txt>
```

### Batch conversion (`convert_all`)

Converts all `*.sjis.txt` files in `sjis/` → `*.utf8.txt` in `utf-8/`. Skips files where the output already exists.

```bash
uv run convert-all
```

Expected directory layout:

```
./
├── sjis/     # Input: Shift JIS files named <book_id>.sjis.txt
└── utf-8/    # Output: UTF-8 files named <book_id>.utf8.txt
```

---

## Relationship to the Pipeline

`sjis_to_utf8` is an **offline preprocessing step**, not part of the daily import pipeline. Aozora Bunko distributes most texts in Shift JIS ZIP archives. These are downloaded and converted once; the resulting `*.utf8.txt` files are stored in Cloudflare R2 and consumed by both the `text_to_html` converter and the in-browser text reader.

```
Aozora Bunko ZIP (Shift JIS)
  └──► sjis_to_utf8 (offline, one-time per book)
         └──► *.utf8.txt  →  Cloudflare R2
                              ├──► text_to_html → *.utf8.html (HTML mirror)
                              └──► /api/read (browser text reader)
```
