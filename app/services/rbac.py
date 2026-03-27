"""Role-Based Access Control (RBAC) for CodeRAG.

Provides a FastAPI dependency that enforces role-based permissions on endpoints.
Roles: owner > admin > member > viewer > guest
"""

import logging

from fastapi import Depends, HTTPException, status

from app.core.database import User
from app.services.auth import get_current_user

logger = logging.getLogger(__name__)

# Role hierarchy — higher index = more permissions
ROLE_HIERARCHY = {
    "Guest": 0,
    "User": 1,
    "Admin": 2,
}


def get_role_level(role: str) -> int:
    """Get numeric level for a role. Unknown roles get -1."""
    return ROLE_HIERARCHY.get(role, -1)


def require_role(*allowed_roles: str):
    """FastAPI dependency that checks if the current user has one of the allowed roles.

    Usage:
        @router.get("/admin/users", dependencies=[Depends(require_role("admin", "owner"))])
        async def list_users(): ...

    Or as a parameter dependency:
        async def endpoint(user: User = Depends(require_role("admin"))):
            ...
    """
    min_role_level = min(get_role_level(r) for r in allowed_roles)

    async def _check_role(
        current_user: User = Depends(get_current_user),
    ) -> User:
        user_role = getattr(current_user, "organization_role", "member") or "member"
        user_level = get_role_level(user_role)

        if user_level < min_role_level and user_role not in allowed_roles:
            logger.warning(
                f"RBAC denied: user={current_user.id} role={user_role} "
                f"required={allowed_roles}"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": "insufficient_permissions",
                    "message": f"This action requires one of: {', '.join(allowed_roles)}",
                    "your_role": user_role,
                },
            )

        return current_user

    return _check_role


def require_admin():
    """Shortcut dependency for admin-only endpoints."""
    return require_role("admin", "owner")


def require_member():
    """Shortcut dependency for member+ endpoints."""
    return require_role("member", "admin", "owner")


def require_viewer():
    """Shortcut dependency for viewer+ endpoints (read-only access)."""
    return require_role("viewer", "member", "admin", "owner")
