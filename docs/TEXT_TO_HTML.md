# text_to_html — Aozora Bunko Text to HTML Converter

## Overview

`aozora_data/text_to_html/` converts Aozora Bunko plain text files (UTF-8) into HTML5 documents. It is used to generate the `aozora.ksato9700.com` HTML mirror, which the site's in-browser reader embeds via `<iframe>`.

---

## Input Format

Aozora Bunko text files use a custom markup dialect on top of plain Japanese text:

- **Header**: First non-empty block of lines — title, author, translator/editor, subtitle
- **Dash block**: Lines of 20+ dashes (`----...`) enclose bibliographic preamble that is skipped
- **Ruby annotations**: `｜base text《reading》` or automatic kanji detection + `《reading》`
- **Commands**: `［＃command］` — control indentation, headings, page breaks, etc.
- **Notes**: `※［＃note text］` — editorial annotations
- **Footer**: Lines starting with `底本：` mark the bibliographic source section

---

## Output Format

A self-contained HTML5 document with:

- `<title>` and Dublin Core `<meta>` tags (title, creator, publisher, language, license)
- Schema.org JSON-LD (`@type: schema:Book`) embedded in `<script>`
- A link to `./css/aozora.css` for styling
- Semantic structure: `<article>`, `<section>`, `<footer>`
- CSS classes for layout: `aozora-work`, `metadata`, `main_text`, `bibliographical_information`

### Document structure

```html
<!DOCTYPE html>
<html lang="ja-JP">
<head>
  <!-- meta, CSS link, Dublin Core, Schema.org JSON-LD -->
</head>
<body><main>
  <article class="aozora-work">
    <div class="metadata">
      <h1 class="title">...</h1>
      <h2 class="author">...</h2>        <!-- if present -->
      <h2 class="translator">...</h2>    <!-- if present -->
    </div>
    <div class="main_text">
      <section>
        <p>...</p>                       <!-- body paragraphs -->
        <h3 class="midashi">...</h3>     <!-- large heading -->
        <section><p>...</p></section>    <!-- sections between headings -->
        <div class="jisage_2"><p>...</p></div>  <!-- indented block -->
      </section>
    </div>
    <footer>
      <div class="bibliographical_information">
        <!-- 底本： source info -->
      </div>
    </footer>
  </article>
</main></body>
</html>
```

---

## Markup Conversion Reference

### Ruby (furigana)

| Input | Output |
|---|---|
| `｜漱石《そうせき》` | `<ruby><rb>漱石</rb><rp>（</rp><rt>そうせき</rt><rp>）</rp></ruby>` |
| `漱石《そうせき》` | Same — kanji sequence before `《` is auto-detected as ruby base |

When no `｜` delimiter is present, the converter backtracks through the buffer to collect the preceding run of same-type characters (kanji, hiragana, katakana, or ASCII). Mixed character types stop the backtrack.

### Commands `［＃...］`

| Command | HTML output |
|---|---|
| `［＃ここからN字下げ］` | `<div class="jisage_N">` |
| `［＃ここから罫囲み］` | `<div class="keigakomi">` |
| `［＃ここで字下げ終わり］` | `</div>` (closes matching div) |
| `［＃大見出し］text` | `</section><section><h3 class="midashi">` |
| `［＃中見出し］text` | `</section><section><h4 class="midashi">` |
| `［＃見出し］text` | `</section><section><h5 class="midashi">` |
| `［＃改ページ］` | `<hr><div class="page_break"></div>` |
| Other / unknown | Silently ignored |

### Notes `※［＃...］`

Rendered as `<aside class="notes">［＃...］</aside>` inline.

### Newlines

Each newline in the source becomes `</p>\n<p>` — one HTML paragraph per line.

### Footer detection

When a line begins with `底本：` (source book info), the converter closes the main text section and opens a `<footer><div class="bibliographical_information">` block.

---

## Implementation

### `CharStream`

A character-level stream over the input file with:
- `read()` / `peek()` — single-character access
- `push_back(chars)` — unread characters (used for backtracking in ruby detection)
- `read_until(terminator)` — read up to a delimiter character

### `TextToHtmlConverter`

| Method | Responsibility |
|---|---|
| `convert()` | Top-level: open files, call header/body/footer phases |
| `_parse_header()` | Read lines until blank line; extract title, author, etc. |
| `_skip_dash_block()` | Detect and discard preamble enclosed by `----` lines |
| `_write_html_header()` | Emit `<head>` and opening `<body>` structure |
| `_parse_and_write_body()` | Character-by-character dispatch loop |
| `_handle_bracket()` | Detect `［＃...］` commands vs. literal `［` |
| `_handle_ruby()` | Backtrack buffer or use `｜` marker to build `<ruby>` |
| `_handle_note_symbol()` | Convert `※［＃...］` to `<aside>` |
| `_handle_cmd()` | Dispatch individual `［＃...］` command strings |
| `_flush()` | Write buffered text to output; detects `底本：` for footer |
| `_write_footer()` | Close open tags and write `</html>` |

---

## Usage

### Single file (CLI)

```bash
uv run text-to-html <input.utf8.txt> <output.utf8.html>
```

Or equivalently, using the module entry point:

```bash
python -m aozora_data.text_to_html <input.utf8.txt> <output.utf8.html>
```

### Batch conversion (`html_convert_all.py`)

Converts all `*.utf8.txt` files in `utf-8/` → `*.utf8.html` in `utf-8_html/`. Skips files where the output is already newer than the input.

```bash
# Convert all (incremental — skips up-to-date files)
python -m aozora_data.html_convert_all

# Dry run — show what would be converted without writing
python -m aozora_data.html_convert_all --dry-run
```

Expected directory layout:

```
./
├── utf-8/           # Input: UTF-8 text files named <book_id>.utf8.txt
└── utf-8_html/      # Output: HTML files named <book_id>.utf8.html
```

---

## Relationship to the Site

The converter generates the static HTML files served at `aozora.ksato9700.com`. The Aozora Pages site embeds these files via `<iframe>` in the reader's HTML mode:

```
/read/[bookId] (HTML mode)
  └──► <iframe src="https://aozora.ksato9700.com/{bookId}.utf8.html">
```
