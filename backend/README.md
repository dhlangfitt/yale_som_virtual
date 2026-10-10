# Faculty agents

Every professor on floor 2 is a [Pydantic AI](https://pydantic.dev/docs/ai/) agent.
Nine of them: the eight who teach, plus Hagrid in the courtyard.

## Run it

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env        # then fill in PORTKEY_API_KEY
.venv/bin/uvicorn main:app --reload --port 8000
```

Check it came up:

```bash
curl localhost:8000/api/health
```

Interactive API docs are at <http://localhost:8000/docs>.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | liveness, course count, professor count |
| `GET` | `/api/professors` | who you can talk to, with course and room |
| `POST` | `/api/chat/{key}` | one turn of conversation |

`key` is `dumbledore`, `mcgonagall`, `trelawney`, `slughorn`, `snape`, `lockhart`,
`moody`, `flitwick`, or `hagrid`.

```bash
curl -X POST localhost:8000/api/chat/snape \
  -H 'content-type: application/json' \
  -d '{"message": "Why does my balance sheet not balance?"}'
```

The reply contains a `history` array. Pass it back unchanged in the next request
and the professor remembers the conversation:

```json
{ "message": "And if it still does not?", "history": [ ...previous history... ] }
```

## How the agents are built

`agents.py` assembles each one from three pieces:

- **Static instructions** — the persona, from `professors.py`. Voice and subject
  lens, written per character. These go first in the prompt so they cache well.
- **Dynamic instructions** — the real catalogue entry for the course that
  professor teaches, pulled from `data/yale_som.db` at request time via
  `courses.py`. This is what makes Flitwick know when MGT 541 actually meets.
- **A shared tool** — `search_catalogue`, so any professor can look up any of the
  234 courses when a student asks about something outside their own.

Agents are cached per professor. A Pydantic AI `Agent` is stateless across runs,
so one instance serves every student; the conversation lives entirely in the
message history the caller passes in.

The personas are instructed that the character is the *delivery*, never an excuse
for a wrong answer — Trelawney is theatrical about uncertainty but still gives
you a correct confidence interval.

## Configuration

| Variable | Default | Notes |
| --- | --- | --- |
| `PORTKEY_API_KEY` | — | required; from the course |
| `PORTKEY_BASE_URL` | `https://api.portkey.ai/v1` | Portkey is OpenAI-compatible, so the OpenAI provider works pointed at it |
| `LLM_MODEL` | `gpt-4.1-mini` | whatever your Portkey config routes |
| `CORS_ORIGINS` | `http://localhost:5173` | comma-separated; add the Render static site URL in production |
| `COURSES_DB` | `../data/yale_som.db` | override if the catalogue moves |

## Testing without a key

`pydantic_ai.models.test.TestModel` substitutes for the real model, so the wiring
can be exercised offline:

```python
from pydantic_ai.models.test import TestModel
with agents.agent_for("snape").override(model=TestModel(custom_output_text="Obviously.")):
    ...
```

## Not done yet

- **No authentication.** Anyone who can reach the API can talk to a professor and
  spend tokens. Lecture 8 adds bcrypt-hashed users.
- **No persistence.** History round-trips through the client, so it is lost on
  reload and a client could forge it. Lecture 8 moves it into a `chats` table.
- **Courses still read from SQLite**, not Supabase. `courses.py` is the only file
  that touches the database, so that swap is contained.
- **Not wired to the 3D frontend.** Nothing in `src/` calls this yet.
