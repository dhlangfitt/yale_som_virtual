"""FastAPI server for the Yale SOM Virtual professors.

    uvicorn main:app --host 0.0.0.0 --port $PORT

Conversation history round-trips through the client for now. Lecture 8 moves it
into Supabase behind a login; see README.md in this folder for what that changes.
"""

from __future__ import annotations

import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pydantic_ai.messages import ModelMessagesTypeAdapter
from pydantic_core import to_jsonable_python

load_dotenv()

import agents  # noqa: E402  (after load_dotenv, so it sees PORTKEY_API_KEY)
import courses  # noqa: E402
import professors  # noqa: E402

app = FastAPI(title="Yale SOM Virtual — faculty agents")

# The frontend is served from a different origin in dev (5173) and in production
# (a Render static site), so it needs explicit CORS.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",") if o],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    #: Opaque history from the previous reply. Pass it straight back.
    history: list[dict] = Field(default_factory=list)
    student_name: str | None = None


class ChatReply(BaseModel):
    professor: str
    name: str
    reply: str
    history: list[dict]
    usage: dict


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "courses": courses.count(), "professors": len(professors.PROFESSORS)}


@app.get("/api/professors")
def list_professors() -> list[dict]:
    """Everyone a student can talk to, with their course and room."""
    out = []
    for p in professors.PROFESSORS.values():
        entry = courses.by_code(p.course_code) if p.course_code else None
        out.append(
            {
                "key": p.key,
                "name": p.name,
                "course_code": p.course_code or None,
                "course_title": p.course_title or None,
                "room": p.room or None,
                "meets": (entry or {}).get("daytimes"),
            }
        )
    return out


@app.post("/api/chat/{professor_key}", response_model=ChatReply)
async def chat(professor_key: str, req: ChatRequest) -> ChatReply:
    try:
        prof = professors.get(professor_key)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e)) from None

    try:
        history = ModelMessagesTypeAdapter.validate_python(req.history)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"malformed history: {e}") from None

    try:
        result = await agents.ask(
            prof.key, req.message, history=history, student_name=req.student_name
        )
    except RuntimeError as e:  # missing API key, and other setup failures
        raise HTTPException(status_code=503, detail=str(e)) from None

    usage = result.usage
    return ChatReply(
        professor=prof.key,
        name=prof.name,
        reply=result.output,
        history=to_jsonable_python(result.all_messages()),
        usage={
            "requests": usage.requests,
            "tool_calls": usage.tool_calls,
            "input_tokens": usage.input_tokens,
            "output_tokens": usage.output_tokens,
        },
    )
