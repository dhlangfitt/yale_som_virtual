"""One Pydantic AI agent per professor.

Each agent is the same machinery with a different persona and a different course
bolted on: static instructions carry the voice, dynamic instructions inject the
live catalogue entry for the course they teach, and a shared tool lets them look
up any of the other 234 courses when a student asks something off-topic.

Agents are built once and cached — a Pydantic AI `Agent` is stateless across
runs, so a single instance serves every student. Conversation state lives in the
message history the caller passes in, not in the agent.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import cache

from pydantic_ai import Agent, RunContext
from pydantic_ai.models.openai import OpenAIChatModel, OpenAIChatModelSettings
from pydantic_ai.providers.openai import OpenAIProvider

import courses
import professors
from professors import Professor

#: Portkey is an OpenAI-compatible gateway, so the OpenAI provider works as-is
#: with the base_url pointed at it. Override either via .env.
PORTKEY_BASE_URL = os.getenv("PORTKEY_BASE_URL", "https://api.portkey.ai/v1")
MODEL_NAME = os.getenv("LLM_MODEL", "gpt-6-luna")

#: gpt-6-luna refuses function tools over /v1/chat/completions unless reasoning
#: effort is 'none'. Every professor uses tools, so default it off. Set
#: LLM_REASONING_EFFORT to low/medium/high on a model that allows both.
REASONING_EFFORT = os.getenv("LLM_REASONING_EFFORT", "none")


@dataclass
class Deps:
    """Per-request context handed to the agent's tools and dynamic instructions."""

    professor: Professor
    student_name: str | None = None


def _model() -> OpenAIChatModel:
    api_key = os.getenv("PORTKEY_API_KEY")
    if not api_key:
        raise RuntimeError(
            "PORTKEY_API_KEY is not set. Copy backend/.env.example to backend/.env "
            "and fill it in, or export the variable before starting the server."
        )
    provider = OpenAIProvider(base_url=PORTKEY_BASE_URL, api_key=api_key)
    return OpenAIChatModel(MODEL_NAME, provider=provider)


def _instructions(p: Professor) -> str:
    """The persona half of the prompt. Static per professor, so it caches well."""
    if p.key == "hagrid":
        return f"""
You are {p.name}, keeper of the courtyard on the 2nd floor of Evans Hall at the
Yale School of Management — a world where the faculty are Hogwarts professors
and the students are Labubus.

Voice: {p.voice}
Role: {p.lens}

You are talking to a student who has walked up to you in the courtyard. Keep
replies short — two or three sentences. If they ask about course content, send
them to the right professor by name and room number rather than answering it
yourself. You may use the course catalogue tool to find who teaches what.
""".strip()

    return f"""
You are Professor {p.name}, teaching {p.course_code} ({p.course_title}) in room
{p.room} on the 2nd floor of Evans Hall at the Yale School of Management. The
students here are Labubus and most of your colleagues are Hogwarts professors —
play it straight, as though this were entirely ordinary.

Voice: {p.voice}
How you frame the subject: {p.lens}

You know this material cold: {p.expertise}

You are talking with a student who has walked into your classroom. Hold the
character throughout, but the teaching must be real: when the student asks a
substantive question, give them a genuinely correct and useful answer in your own
voice. Work through the actual reasoning — define the term, give the formula if
there is one, and ground it in a concrete example. The persona is the delivery,
never an excuse for a wrong, vague, or empty answer. If you are not sure of
something, say so plainly rather than inventing it.

Keep replies conversational — a short paragraph, or a few lines. Do not lecture
at length unless asked.

Your reply is rendered as plain text in a small chat window, so write plain
prose. No markdown, no bullet lists, no bold, and no LaTeX: write formulas in
plain notation a person would type, like "SE = sigma / sqrt(n)" or
"P(A|B) = P(B|A)P(A) / P(B)". Stay in voice the whole way through, including the
technical parts — the explanation itself should sound like you, not like a
textbook paragraph with a greeting bolted on the front.

You have tools for looking things up in the real Yale SOM course catalogue. Use
them rather than guessing whenever a student asks about another course, who
teaches something, when a class meets, or what is offered in a subject area.
""".strip()


@cache
def agent_for(key: str) -> Agent[Deps, str]:
    """Build (and cache) the agent for one professor."""
    p = professors.get(key)
    agent = Agent(
        _model(),
        deps_type=Deps,
        instructions=_instructions(p),
        name=f"prof-{p.key}",
        model_settings=OpenAIChatModelSettings(openai_reasoning_effort=REASONING_EFFORT),
    )

    @agent.instructions
    def course_context(ctx: RunContext[Deps]) -> str:
        """Inject the live catalogue entry for this professor's course."""
        prof = ctx.deps.professor
        if not prof.course_code:
            return ""
        entry = courses.by_code(prof.course_code)
        if not entry:
            return ""
        return (
            "Here is the real catalogue entry for the course you teach. Treat it as "
            "authoritative for logistics (meeting times, room, units, term) and as the "
            "syllabus you are teaching from:\n\n" + courses.brief(entry)
        )

    @agent.instructions
    def student_context(ctx: RunContext[Deps]) -> str:
        if ctx.deps.student_name:
            return f"The student you are speaking with is named {ctx.deps.student_name}."
        return ""

    @agent.tool
    async def search_catalogue(ctx: RunContext[Deps], query: str) -> str:
        """Search the Yale SOM course catalogue by topic, title or subject area.

        Use when a student asks what courses cover a subject — "what's offered in
        sustainable operations?", "any electives on negotiation?". `query` is matched
        against course titles, descriptions and categories.
        """
        hits = courses.search(query, limit=4)
        if not hits:
            return f"No courses in the catalogue match {query!r}."
        return "\n\n".join(courses.brief(h, description_chars=400) for h in hits)

    @agent.tool
    async def course_detail(ctx: RunContext[Deps], course_code: str) -> str:
        """Full catalogue entry for one course by its code, e.g. 'MGT 541'.

        Use when a student names a specific course and you need its description,
        meeting time, room, units or instructor.
        """
        entry = courses.by_code(course_code.strip().upper())
        if not entry:
            return f"No course numbered {course_code!r} is in the catalogue."
        return courses.brief(entry)

    @agent.tool
    async def courses_by_instructor(ctx: RunContext[Deps], name: str) -> str:
        """Which courses a given faculty member teaches. `name` is a surname or full name.

        Use when a student asks who teaches what, or what else a professor offers.
        """
        hits = courses.by_instructor(name, limit=6)
        if not hits:
            return f"No courses in the catalogue are taught by anyone matching {name!r}."
        return "\n\n".join(courses.brief(h, description_chars=250) for h in hits)

    return agent


async def ask(
    professor_key: str,
    message: str,
    history: list | None = None,
    student_name: str | None = None,
):
    """Run one turn of conversation with a professor.

    Returns the Pydantic AI result; `.output` is the reply text and
    `.all_messages()` is the history to persist and pass back on the next turn.
    """
    p = professors.get(professor_key)
    agent = agent_for(p.key)
    return await agent.run(
        message,
        deps=Deps(professor=p, student_name=student_name),
        message_history=history or [],
    )
