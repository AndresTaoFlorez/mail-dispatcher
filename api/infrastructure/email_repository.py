"""
infrastructure/email_repository.py — Email (conversations) persistence.
"""

from __future__ import annotations

import uuid

from sqlalchemy import or_, select, func
from sqlalchemy.ext.asyncio import AsyncSession

from api.domain.models import Email
from api.shared.logger import get_logger

logger = get_logger("email_repository")


# ---------------------------------------------------------------------------
# Field-presence filter (reusable)
# ---------------------------------------------------------------------------

_FILTERABLE_FIELDS: dict[str, any] = {
    "body": Email.body,
    "tags": Email.tags,
    "subject": Email.subject,
    "sender": Email.sender,
    "sender_email": Email.sender_email,
    "to_address": Email.to_address,
    "from_address": Email.from_address,
    "conversation_id": Email.conversation_id,
}


def apply_field_filters(q, filters: list[str], field_map: dict | None = None):
    """Apply field presence/absence filters to a query.

    Each filter is a field name (has value) or !field (empty/null).
    Example: ["tags", "!body"] → has tags AND body is empty.
    """
    fmap = field_map or _FILTERABLE_FIELDS
    for f in filters:
        negate = f.startswith("!")
        field_name = f.lstrip("!")
        col = fmap.get(field_name)
        if col is None:
            continue
        if negate:
            q = q.where((col == "") | (col.is_(None)))
        else:
            q = q.where(col != "").where(col.is_not(None))
    return q


# ---------------------------------------------------------------------------
# Stored conversation queries
# ---------------------------------------------------------------------------


async def get_conversations(
    session: AsyncSession,
    app: str,
    folder: str | None = None,
    limit: int = 100,
    offset: int = 0,
    filters: list[str] | None = None,
    conversation_ids: list[str] | None = None,
    ids: list[uuid.UUID] | None = None,
) -> list[Email]:
    q = select(Email).where(Email.app == app)
    if folder:
        q = q.where(Email.folder == folder)
    if ids:
        q = q.where(Email.id.in_(ids))
    if conversation_ids:
        q = q.where(or_(*(Email.conversation_id.like(f"{cid}%") for cid in conversation_ids)))
    if filters:
        q = apply_field_filters(q, filters)
    q = q.order_by(Email.created_at.desc()).limit(limit).offset(offset)
    result = await session.execute(q)
    return list(result.scalars().all())


async def count_conversations(
    session: AsyncSession,
    app: str,
    folder: str | None = None,
    filters: list[str] | None = None,
    conversation_ids: list[str] | None = None,
    ids: list[uuid.UUID] | None = None,
) -> int:
    q = select(func.count(Email.id)).where(Email.app == app)
    if folder:
        q = q.where(Email.folder == folder)
    if ids:
        q = q.where(Email.id.in_(ids))
    if conversation_ids:
        q = q.where(or_(*(Email.conversation_id.like(f"{cid}%") for cid in conversation_ids)))
    if filters:
        q = apply_field_filters(q, filters)
    result = await session.execute(q)
    return result.scalar() or 0
