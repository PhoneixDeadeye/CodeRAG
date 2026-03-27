"""Billing API Router — Subscription Plans, Billing, Invoices.

Manages subscription plans and billing with Stripe-ready models.
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import (
    get_db,
    User,
    SubscriptionPlan,
    Subscription,
    Invoice,
    generate_uuid,
)
from app.services.auth import get_current_user
from app.services.rbac import require_role

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/billing", tags=["Billing"])


# ──────────────────────────────────────────────────────────────
# Response / Request Models
# ──────────────────────────────────────────────────────────────


class PlanResponse(BaseModel):
    id: str
    name: str
    tier: str
    max_repos: int
    max_queries_per_day: int
    max_storage_mb: int
    price_cents: int
    features: dict


class SubscribeRequest(BaseModel):
    plan_id: str


class SubscriptionResponse(BaseModel):
    id: str
    plan_name: str
    tier: str
    status: str
    current_period_start: Optional[str] = None
    current_period_end: Optional[str] = None


class InvoiceResponse(BaseModel):
    id: str
    amount_cents: int
    status: str
    period_start: Optional[str] = None
    period_end: Optional[str] = None
    created_at: Optional[str] = None


# ──────────────────────────────────────────────────────────────
# Seed Default Plans (runs on first access)
# ──────────────────────────────────────────────────────────────


async def _ensure_default_plans(db: AsyncSession):
    """Seed default subscription plans if none exist."""
    existing = await db.scalar(select(SubscriptionPlan.id).limit(1))
    if existing:
        return

    plans = [
        SubscriptionPlan(
            id=generate_uuid(),
            name="Free",
            tier="free",
            max_repos=3,
            max_queries_per_day=50,
            max_storage_mb=500,
            price_cents=0,
            features_json={
                "chat": True,
                "file_explorer": True,
                "diff_analysis": True,
                "export": True,
                "multi_llm": False,
                "priority_support": False,
            },
        ),
        SubscriptionPlan(
            id=generate_uuid(),
            name="Pro",
            tier="pro",
            max_repos=25,
            max_queries_per_day=500,
            max_storage_mb=5000,
            price_cents=2900,  # $29/month
            features_json={
                "chat": True,
                "file_explorer": True,
                "diff_analysis": True,
                "export": True,
                "multi_llm": True,
                "private_repos": True,
                "priority_support": True,
                "analytics": True,
            },
        ),
        SubscriptionPlan(
            id=generate_uuid(),
            name="Enterprise",
            tier="enterprise",
            max_repos=999,
            max_queries_per_day=10000,
            max_storage_mb=50000,
            price_cents=9900,  # $99/month
            features_json={
                "chat": True,
                "file_explorer": True,
                "diff_analysis": True,
                "export": True,
                "multi_llm": True,
                "private_repos": True,
                "priority_support": True,
                "analytics": True,
                "custom_llm": True,
                "sso": True,
                "audit_logs": True,
                "dedicated_support": True,
            },
        ),
    ]

    db.add_all(plans)
    await db.commit()
    logger.info("Seeded default subscription plans.")


# ──────────────────────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────────────────────


@router.get("/plans", response_model=list[PlanResponse])
async def list_plans(
    db: AsyncSession = Depends(get_db),
):
    """List all available subscription plans (public endpoint)."""
    await _ensure_default_plans(db)

    result = await db.execute(
        select(SubscriptionPlan)
        .where(SubscriptionPlan.is_active.is_(True))
        .order_by(SubscriptionPlan.price_cents.asc())
    )
    plans = result.scalars().all()

    return [
        PlanResponse(
            id=p.id,
            name=p.name,
            tier=p.tier,
            max_repos=p.max_repos,
            max_queries_per_day=p.max_queries_per_day,
            max_storage_mb=p.max_storage_mb,
            price_cents=p.price_cents,
            features=p.features_json or {},
        )
        for p in plans
    ]


@router.post("/subscribe", response_model=SubscriptionResponse)
async def subscribe(
    body: SubscribeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Subscribe to a plan."""
    # Verify plan exists
    plan = await db.get(SubscriptionPlan, body.plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    # Check for existing active subscription
    existing = await db.scalar(
        select(Subscription.id).where(
            Subscription.organization_id == current_user.organization_id,
            Subscription.status == "active",
        )
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Active subscription already exists. Cancel first before changing plans.",
        )

    now = datetime.now(timezone.utc)
    subscription = Subscription(
        id=generate_uuid(),
        organization_id=current_user.organization_id,
        plan_id=plan.id,
        status="active",
        current_period_start=now,
        current_period_end=now + timedelta(days=30),
    )
    db.add(subscription)
    await db.commit()

    logger.info(
        f"User {current_user.id} subscribed to plan {plan.name} ({plan.tier})"
    )

    return SubscriptionResponse(
        id=subscription.id,
        plan_name=plan.name,
        tier=plan.tier,
        status=subscription.status,
        current_period_start=subscription.current_period_start.isoformat() if subscription.current_period_start else None,
        current_period_end=subscription.current_period_end.isoformat() if subscription.current_period_end else None,
    )


@router.post("/cancel")
async def cancel_subscription(
    current_user: User = Depends(require_role("admin", "owner")),
    db: AsyncSession = Depends(get_db),
):
    """Cancel the active subscription."""
    result = await db.execute(
        select(Subscription).where(
            Subscription.organization_id == current_user.organization_id,
            Subscription.status == "active",
        )
    )
    subscription = result.scalar_one_or_none()

    if not subscription:
        raise HTTPException(status_code=404, detail="No active subscription found")

    subscription.status = "canceled"
    await db.commit()

    logger.info(f"Subscription {subscription.id} canceled by user {current_user.id}")
    return {"message": "Subscription canceled", "subscription_id": subscription.id}


@router.get("/invoices", response_model=list[InvoiceResponse])
async def list_invoices(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List invoices for the current organization."""
    offset = (page - 1) * limit
    result = await db.execute(
        select(Invoice)
        .where(Invoice.organization_id == current_user.organization_id)
        .order_by(Invoice.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    invoices = result.scalars().all()

    return [
        InvoiceResponse(
            id=inv.id,
            amount_cents=inv.amount_cents,
            status=inv.status,
            period_start=inv.period_start.isoformat() if inv.period_start else None,
            period_end=inv.period_end.isoformat() if inv.period_end else None,
            created_at=inv.created_at.isoformat() if inv.created_at else None,
        )
        for inv in invoices
    ]


@router.get("/current", response_model=Optional[SubscriptionResponse])
async def get_current_subscription(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the current active subscription."""
    result = await db.execute(
        select(Subscription, SubscriptionPlan)
        .join(SubscriptionPlan, Subscription.plan_id == SubscriptionPlan.id)
        .where(
            Subscription.organization_id == current_user.organization_id,
            Subscription.status == "active",
        )
    )
    row = result.first()

    if not row:
        return None

    sub, plan = row
    return SubscriptionResponse(
        id=sub.id,
        plan_name=plan.name,
        tier=plan.tier,
        status=sub.status,
        current_period_start=sub.current_period_start.isoformat() if sub.current_period_start else None,
        current_period_end=sub.current_period_end.isoformat() if sub.current_period_end else None,
    )
