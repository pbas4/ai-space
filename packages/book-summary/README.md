# book-summary

Turn an EPUB or PDF book into a structured summary in **Markdown + PDF**, then file
both copies in a Google Drive folder and (optionally) an Obsidian vault.

The skill lives at [`skills/book-summary/`](skills/book-summary/). Everything the
model needs is in `SKILL.md`; the summarizing method is in
`references/workflow.md`; the fixed section template and PDF stylesheet are in
`assets/`.

## Install (Claude Code)

Symlink the skill into your personal skills directory so Claude discovers it:

```bash
ln -s "$PWD/packages/book-summary/skills/book-summary" \
      "$HOME/.claude/skills/book-summary"
```

Or install the whole package as a plugin via `.claude-plugin/plugin.json`.

## One-time setup

1. **Tools:**

   ```bash
   brew install poppler pandoc weasyprint
   ```

   `poppler` gives `pdftotext`; `pandoc` + `weasyprint` render the PDF. EPUB
   parsing uses only the Python standard library. `ocrmypdf` is optional, for
   scanned PDFs.

2. **Config** — machine-local, never committed. Copy the example and edit:

   ```bash
   mkdir -p ~/.config/book-summary
   cp packages/book-summary/config.example.json ~/.config/book-summary/config.json
   ```

   | key | meaning |
   |---|---|
   | `gdrive_dir` | Local path of the Google Drive for Desktop folder for summaries. Required. |
   | `obsidian_vault` | Vault root. Leave `""` to skip vault delivery. |
   | `obsidian_books_subdir` | Where `.md` summaries go inside the vault. Default `Books`. |
   | `obsidian_attachments_subdir` | Where the `.pdf` goes. Default `Books/attachments`. |
   | `moc_file` | Map-of-Content note that gets a `- [[Author - Title]]` line appended. |

   Override the config path with `BOOK_SUMMARY_CONFIG=/path/to/config.json`.

## Usage

Point Claude at a book file:

> Summarize `~/Downloads/atomic-habits.epub` and file it.

The skill then: checks deps → extracts text → summarizes per the workflow →
fills the template → renders the PDF → runs `distribute.sh` → reports paths.

## Scripts (runnable standalone)

| script | does |
|---|---|
| `scripts/check_deps.sh` | Verify `pdftotext`, `pandoc`, `weasyprint`, `python3`. |
| `scripts/extract.sh <in> <out.txt>` | EPUB/PDF → plain text. |
| `scripts/render_pdf.sh <in.md> <out.pdf>` | Markdown → house-style PDF. |
| `scripts/distribute.sh <in.md> <in.pdf>` | Copy to Drive + vault, update MOC. Idempotent. |
