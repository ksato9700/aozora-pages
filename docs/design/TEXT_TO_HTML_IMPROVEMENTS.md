# Design: text_to_html Improvements

**Status:** Proposed
**Date:** 2026-03-15
**Context:** Analysis of `aozora_data/text_to_html/converter.py` prior to planned rework.

---

## 1. Bug: Heading content writes the command string, not the heading text

**Severity:** High — headings are rendered with the wrong content in the output HTML.

**Location:** `_handle_cmd()`, line 318

```python
f.write(f'</p>\n</section>\n<section>\n<{tag} class="midashi">{cmd}</{tag}>\n<p>')
```

`cmd` is the raw command string (e.g. `「第一章」は大見出し`), not the heading text. In Aozora Bunko format, the heading text precedes the command on the same line:

```
第一章［＃「第一章」は大見出し］
```

When the `［＃...］` command is encountered, the heading text is already sitting in the buffer. The correct approach is:

1. Extract the heading text from the `「...」` pattern in `cmd` to confirm what it should be.
2. Use the buffer content as the heading text (it was accumulated character-by-character before the command was reached).
3. Write `<hN class="midashi">{buffer content}</hN>` instead of `{cmd}`.

---

## 2. Bug: Unclosed indent blocks at end of document

**Severity:** Medium — produces invalid HTML for any document with an unclosed `ここから` block.

**Location:** `_write_footer()`

If the source text has a `［＃ここから字下げ］` with no matching `［＃ここで字下げ終わり］`, items remain in `indent_stack` but `_write_footer()` never closes them. The output ends with unclosed `<div>` tags.

**Fix:** At the start of `_write_footer()`, close any remaining open divs:

```python
# Close any unclosed indent blocks
for _ in self.indent_stack:
    f.write("</p></div>\n<p>")
self.indent_stack.clear()
```

---

## 3. Bug: `_is_orig()` misidentifies English names as foreign titles

**Severity:** Medium — incorrect metadata for works translated from English.

**Location:** `_process_header()` / `_is_orig()`, lines 106–129

```python
def _is_orig(self, t: str) -> bool:
    try:
        t.encode("ascii")
        return True
    except UnicodeEncodeError:
        return False
```

The intent is to detect foreign-language original titles (e.g. `"The Scarlet Letter"`). However, it also matches English translator or editor names (e.g. `"Hans Christian Andersen"`), incorrectly placing them in `original_title` instead of `author` or `translator`.

**Fix:** The heuristic is fundamentally unreliable. A better approach is to look for the role suffix on the preceding lines (`訳`, `編`, `校訂`) and only treat a line as an original title if it appears after a role-identified contributor line and no role suffix is present.

---

## 4. Dead code: `cmd != "文頭"` in the `終わり` handler

**Severity:** Low — cosmetic, no functional impact.

**Location:** `_handle_cmd()`, line 303

```python
elif cmd.endswith("終わり") and cmd != "文頭":
```

`"文頭"` never ends with `"終わり"`, so the second condition is always `True` and serves no purpose. It should be removed.

---

## 5. Missing common Aozora markup commands

**Severity:** Medium — silently ignored markup leaves content unstyled or semantically incorrect.

**Location:** `_handle_cmd()`, `else: pass`

Many frequently-used Aozora Bunko commands fall through to `pass` with no output. The most impactful:

| Command | Meaning | Suggested HTML |
|---|---|---|
| `傍点` | Emphasis dots (bouten) | `<em class="bouten">` |
| `太字` | Bold | `<strong>` |
| `斜体` | Italic | `<em class="italic">` |
| `縦中横` | Horizontal text in vertical layout | `<span class="tcy">` |
| `右に寄せる` / `右寄せ` | Right-align | `<div class="align-right">` |
| `センタリング` | Centre-align | `<div class="align-center">` |
| `割り注` | Inline annotation (wari-chuu) | `<span class="warichuu">` |

These are block or inline spans using the same `ここから...終わり` or `「...」はXX` patterns already handled for indentation and headings. The dispatch logic in `_handle_cmd()` can be extended to cover them.

---

## 6. No CSS bundled with the tool

**Severity:** Low — the output is functionally correct but unstyled without an external stylesheet.

The generated HTML references `./css/aozora.css` but no stylesheet is generated or documented. Classes used in the output — `jisage_2`, `keigakomi`, `midashi`, `bouten`, `tcy`, `bibliographical_information` — are undefined for consumers of the tool.

**Options:**
- Bundle a minimal default `aozora.css` alongside the converter
- Document the expected CSS class contract so users can supply their own

---

## 7. Minor: `convert()` is not safe to call twice on the same instance

**Severity:** Low — unlikely to matter in practice since the CLI and batch script create a new instance per file.

Instance state (`buffer`, `indent_stack`, `in_footer`, `ruby_rb_start`, `metadata`) is initialised in `__init__` but not reset at the start of `convert()`. A second call on the same instance would start with stale state from the first run.

**Fix:** Move state initialisation into `convert()`, or add a `_reset()` helper called at the top of `convert()`.

---

## Summary

| # | Severity | Issue | Status |
|---|---|---|---|
| 1 | High | Heading writes command string instead of heading text | Done |
| 2 | Medium | Unclosed indent blocks produce invalid HTML | Done |
| 3 | Medium | `_is_orig()` misidentifies English names as foreign titles | Done |
| 4 | Low | Dead code in `終わり` handler | Done |
| 5 | Medium | Many common Aozora commands silently ignored | Done |
| 6 | Low | No CSS bundled or documented | Open |
| 7 | Low | `convert()` unsafe to call twice on same instance | Open |

---

## Implementation Plan

### Commit 1 — Bug fixes (issues 1–3) ✓ Implemented

**Issue 1 — Heading content (`_handle_cmd()`, line 318)**

Extract heading text from the `「...」` pattern in `cmd`. Clear the buffer without writing it, then emit `<hN class="midashi">{heading_text}</hN>` instead of `{cmd}`. Fall back to rendering the buffer content if no `「...」` match is found.

**Issue 2 — Unclosed indent blocks (`_write_footer()`)**

At the top of `_write_footer()`, drain `indent_stack` by writing `</p></div>\n<p>` for each remaining entry before writing the closing article/footer tags.

**Issue 3 — `_is_orig()` / `_process_header()`**

Re-order the checks in `_process_header()`:
1. Check role suffixes (`訳`, `編`, `編集`, `校訂`) first; set a `has_contributor` flag.
2. If no author yet, take this line as the author regardless of character type.
3. Only classify as `original_title` if `has_contributor` is set AND the line is ASCII.

This prevents ASCII author names (e.g. `Hans Christian Andersen`) from being misclassified as `original_title` before a role-identified contributor is seen.

### Commit 2 — Dead code + missing commands (issues 4–5) ✓ Implemented

**Issue 4 — Dead code** — Remove the `and cmd != "文頭"` guard on line 303.

**Issue 5 — Missing commands** — Extend `_handle_cmd()` to handle `傍点`, `太字`, `斜体`, `縦中横`, `右に寄せる`/`右寄せ`, `センタリング`, and `割り注` using the existing `ここから...終わり` and `「...」はXX` patterns.
