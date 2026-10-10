"""Read-only access to the Yale SOM course catalogue.

Reads data/yale_som.db (SQLite, 234 courses) today. When the catalogue moves to
Supabase in Lecture 8, only `_connect` and the two query functions below need to
change — the agents talk to this module, not to a database.
"""

import os
import sqlite3
import textwrap
from functools import lru_cache
from pathlib import Path

DB_PATH = Path(os.getenv("COURSES_DB", Path(__file__).parent.parent / "data" / "yale_som.db"))

#: Columns worth showing an agent. The table has 21; most are internal codes.
FIELDS = (
    "course_number, course_title, course_category, course_session, course_description, "
    "faculty_1, faculty_bio, daytimes, room, units, term_code, syllabus"
)


def _connect() -> sqlite3.Connection:
    if not DB_PATH.exists():
        raise FileNotFoundError(
            f"course database not found at {DB_PATH}. Set COURSES_DB to point at it."
        )
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def _clean(row: sqlite3.Row) -> dict:
    """Drop empty columns and tidy the whitespace the registrar export is full of."""
    out = {}
    for k in row.keys():
        v = row[k]
        if v is None or not str(v).strip():
            continue
        out[k] = " ".join(str(v).split())
    return out


@lru_cache(maxsize=32)
def by_code(code: str) -> dict | None:
    """One course by its code, e.g. 'MGT 409'. Sections are deduplicated."""
    with _connect() as conn:
        row = conn.execute(
            f"SELECT {FIELDS} FROM courses WHERE course_number = ? "
            "AND course_description IS NOT NULL AND course_description != '' LIMIT 1",
            (code,),
        ).fetchone()
        if row is None:
            # fall back to a looser match: the export is inconsistent about spacing
            row = conn.execute(
                f"SELECT {FIELDS} FROM courses WHERE REPLACE(course_number, ' ', '') = ? LIMIT 1",
                (code.replace(" ", ""),),
            ).fetchone()
    return _clean(row) if row else None


def search(query: str, limit: int = 5) -> list[dict]:
    """Keyword search across title, description, category and faculty name."""
    like = f"%{query.strip()}%"
    with _connect() as conn:
        rows = conn.execute(
            f"SELECT DISTINCT {FIELDS} FROM courses WHERE "
            "course_title LIKE ? OR course_description LIKE ? "
            "OR course_category LIKE ? OR faculty_1 LIKE ? "
            "ORDER BY LENGTH(course_description) DESC LIMIT ?",
            (like, like, like, like, limit),
        ).fetchall()
    return [_clean(r) for r in rows]


def by_instructor(name: str, limit: int = 6) -> list[dict]:
    """Courses taught by a faculty member. `name` is matched loosely on surname."""
    like = f"%{name.strip()}%"
    with _connect() as conn:
        rows = conn.execute(
            f"SELECT DISTINCT {FIELDS} FROM courses WHERE faculty_1 LIKE ? "
            "GROUP BY course_number ORDER BY course_number LIMIT ?",
            (like, limit),
        ).fetchall()
    return [_clean(r) for r in rows]


def brief(course: dict, description_chars: int = 1200) -> str:
    """Render a course as compact text for a system prompt."""
    if not course:
        return "(no catalogue entry found)"
    bits = [f"{course.get('course_number', '?')} — {course.get('course_title', '?')}"]
    for label, key in (
        ("Category", "course_category"),
        ("Term", "course_session"),
        ("Meets", "daytimes"),
        ("Room", "room"),
        ("Units", "units"),
        ("Instructor of record", "faculty_1"),
    ):
        if key in course:
            bits.append(f"{label}: {course[key]}")
    if "course_description" in course:
        bits.append("Description: " + textwrap.shorten(
            course["course_description"], description_chars, placeholder=" …"
        ))
    if "faculty_bio" in course:
        bits.append("Instructor bio: " + textwrap.shorten(course["faculty_bio"], 500, placeholder=" …"))
    return "\n".join(bits)


def count() -> int:
    with _connect() as conn:
        return conn.execute("SELECT COUNT(*) FROM courses").fetchone()[0]
