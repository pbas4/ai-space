#!/usr/bin/env python3
"""Look up book metadata from Open Library, then Google Books (no API key).

Usage:
  fetch_meta.py --isbn 9780735211292
  fetch_meta.py --title "Thinking in Systems" --author "Meadows"
  fetch_meta.py --isbn 9788417399641 --title "The Millionaire Fastlane" --author "DeMarco"

Pass both an ISBN and a title/author when you have them: the ISBN pins the exact
edition, and the title/author lets the lookup fall back cleanly (Open Library's
ISBN coverage is thin for non-English editions).

Prints a JSON object to stdout with whatever it can resolve:
  { "title", "authors": [..], "year", "original_year", "original_title",
    "publishers": [..], "subjects": [..], "isbn", "cover_url", "openlibrary_url" }
`year` is the looked-up edition; `original_year` / `original_title` describe the
work's first publication when they differ. Prints "{}" and exits 0 on a miss.
Only an ISBN or title/author is sent; no personal data leaves the machine.
"""
import json
import re
import sys
import urllib.parse
import urllib.request

UA = "book-summary-skill/0.4 (+https://github.com/pbas4/ai-space)"


def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.load(r)


def resolve_authors(work_or_edition):
    names = []
    for a in work_or_edition.get("authors", []):
        key = a.get("key") or (a.get("author") or {}).get("key")
        if not key:
            if a.get("name"):
                names.append(a["name"])
            continue
        try:
            names.append(get_json("https://openlibrary.org%s.json" % key).get("name", key))
        except Exception:
            names.append(key)
    return names


def year_from(s):
    if not s:
        return None
    m = re.search(r"(1[5-9]\d\d|20\d\d)", str(s))
    return int(m.group(1)) if m else None


def by_isbn(isbn):
    isbn = isbn.replace("-", "").strip()
    try:
        ed = get_json("https://openlibrary.org/isbn/%s.json" % isbn)
    except Exception:
        return {}
    out = {
        "title": ed.get("title"),
        "authors": resolve_authors(ed),
        "year": year_from(ed.get("publish_date")),
        "publishers": ed.get("publishers", []),
        "subjects": ed.get("subjects", [])[:12],
        "isbn": isbn,
        "cover_url": "https://covers.openlibrary.org/b/isbn/%s-L.jpg" % isbn,
    }
    if ed.get("works"):
        try:
            work = get_json("https://openlibrary.org%s.json" % ed["works"][0]["key"])
            if not out.get("subjects"):
                out["subjects"] = work.get("subjects", [])[:12]
            if not out.get("authors"):
                out["authors"] = resolve_authors(work)
            out["openlibrary_url"] = "https://openlibrary.org%s" % ed["works"][0]["key"]
            wy = year_from(work.get("first_publish_date"))
            if wy and wy != out.get("year"):
                out["original_year"] = wy
            wt = work.get("title")
            if wt and out.get("title") and wt.lower() != out["title"].lower():
                out["original_title"] = wt
        except Exception:
            pass
    return {k: v for k, v in out.items() if v}


def by_search(title, author):
    q = {"title": title, "limit": 1}
    if author:
        q["author"] = author
    try:
        res = get_json("https://openlibrary.org/search.json?" + urllib.parse.urlencode(q))
    except Exception:
        return {}
    docs = res.get("docs") or []
    if not docs:
        return {}
    d = docs[0]
    isbn = (d.get("isbn") or [None])[0]
    out = {
        "title": d.get("title"),
        "authors": d.get("author_name", []),
        "year": d.get("first_publish_year"),
        "original_year": d.get("first_publish_year"),
        "publishers": d.get("publisher", [])[:5],
        "subjects": d.get("subject", [])[:12],
        "isbn": isbn,
        "openlibrary_url": "https://openlibrary.org%s" % d["key"] if d.get("key") else None,
    }
    if isbn:
        out["cover_url"] = "https://covers.openlibrary.org/b/isbn/%s-L.jpg" % isbn
    elif d.get("cover_i"):
        out["cover_url"] = "https://covers.openlibrary.org/b/id/%d-L.jpg" % d["cover_i"]
    return {k: v for k, v in out.items() if v}


def by_googlebooks(isbn, title, author):
    if isbn:
        q = "isbn:" + isbn.replace("-", "").strip()
    else:
        q = "intitle:" + title
        if author:
            q += "+inauthor:" + author
    try:
        res = get_json("https://www.googleapis.com/books/v1/volumes?country=US&q="
                       + urllib.parse.quote(q))
    except Exception:
        return {}
    items = res.get("items") or []
    if not items:
        return {}
    v = items[0].get("volumeInfo", {})
    img = (v.get("imageLinks") or {}).get("thumbnail")
    ids = {x.get("type"): x.get("identifier") for x in v.get("industryIdentifiers", [])}
    out = {
        "title": v.get("title"),
        "authors": v.get("authors", []),
        "year": year_from(v.get("publishedDate")),
        "publishers": [v["publisher"]] if v.get("publisher") else [],
        "subjects": v.get("categories", [])[:12],
        "isbn": ids.get("ISBN_13") or ids.get("ISBN_10") or (isbn or "").replace("-", "") or None,
        "cover_url": img.replace("http://", "https://") if img else None,
    }
    return {k: val for k, val in out.items() if val}


def merge(base, extra):
    for k, v in extra.items():
        if v and not base.get(k):
            base[k] = v
    return base


def main() -> int:
    a = sys.argv[1:]
    isbn = title = author = None
    i = 0
    while i < len(a):
        if a[i] == "--isbn":
            isbn = a[i + 1]; i += 2
        elif a[i] == "--title":
            title = a[i + 1]; i += 2
        elif a[i] == "--author":
            author = a[i + 1]; i += 2
        else:
            print("unknown arg: %s" % a[i], file=sys.stderr); return 2
    if not isbn and not title:
        print(__doc__, file=sys.stderr); return 2

    data = by_isbn(isbn) if isbn else {}
    if title and (not data or not data.get("subjects")):
        data = merge(data, by_search(title, author))
    if not data.get("title") or not data.get("subjects") or not data.get("cover_url"):
        data = merge(data, by_googlebooks(isbn, title, author))
    print(json.dumps(data, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
