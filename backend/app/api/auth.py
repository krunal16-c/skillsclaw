from datetime import datetime, timedelta, timezone
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import JWTError, jwt
from pydantic import BaseModel

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.services.github import exchange_code_for_token, get_github_user
from app.services.stripe_service import create_customer

router = APIRouter(prefix="/api/auth", tags=["auth"])


def create_access_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {"sub": user_id, "exp": expire}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


DEV_USER_ID = "00000000-0000-0000-0000-000000000001"


async def _get_or_create_dev_user(db: AsyncSession) -> User:
    """Return a fixed test user when DEV_MODE=true. Created on first call."""
    result = await db.execute(select(User).where(User.id == UUID(DEV_USER_ID)))
    user = result.scalar_one_or_none()
    if user is None:
        user = User(
            id=UUID(DEV_USER_ID),
            email="dev@skillsclaw.local",
            name="Dev User",
            github_username="dev",
            plan="pro",
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    return user


async def get_current_user(
    request: Request, db: AsyncSession = Depends(get_db)
) -> User:
    if settings.DEV_MODE:
        return await _get_or_create_dev_user(db)

    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = auth_header.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    result = await db.execute(select(User).where(User.id == UUID(user_id)))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def get_optional_user(
    request: Request, db: AsyncSession = Depends(get_db)
) -> User | None:
    if settings.DEV_MODE:
        return await _get_or_create_dev_user(db)
    try:
        return await get_current_user(request, db)
    except HTTPException:
        return None


@router.get("/github/login")
async def github_login():
    github_oauth_url = (
        f"https://github.com/login/oauth/authorize"
        f"?client_id={settings.GITHUB_CLIENT_ID}"
        f"&scope=user:email,repo"
        f"&redirect_uri={settings.FRONTEND_URL}/auth/callback"
    )
    return RedirectResponse(url=github_oauth_url)


@router.get("/github/callback")
async def github_callback(code: str, db: AsyncSession = Depends(get_db)):
    try:
        token = exchange_code_for_token(code)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"GitHub OAuth failed: {str(e)}")

    try:
        gh_user = get_github_user(token)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to get GitHub user: {str(e)}")

    github_id = str(gh_user["id"])
    result = await db.execute(select(User).where(User.github_id == github_id))
    user = result.scalar_one_or_none()

    if user is None:
        # Create new user
        user = User(
            github_id=github_id,
            github_username=gh_user.get("login"),
            github_token=token,
            name=gh_user.get("name") or gh_user.get("login"),
            avatar_url=gh_user.get("avatar_url"),
            email=gh_user.get("email"),
        )
        db.add(user)
        await db.flush()

        # Create Stripe customer
        try:
            customer_id = create_customer(
                email=user.email or f"{user.github_username}@github.local",
                name=user.name or user.github_username or "SkillsClaw User",
            )
            user.stripe_customer_id = customer_id
        except Exception:
            pass  # Don't fail auth if Stripe is unavailable

        await db.commit()
        await db.refresh(user)
    else:
        user.github_token = token
        user.github_username = gh_user.get("login")
        user.name = gh_user.get("name") or gh_user.get("login")
        user.avatar_url = gh_user.get("avatar_url")
        if gh_user.get("email"):
            user.email = gh_user["email"]
        await db.commit()

    access_token = create_access_token(str(user.id))
    redirect_url = f"{settings.FRONTEND_URL}/auth/success?token={access_token}"
    return RedirectResponse(url=redirect_url)


class UserResponse(BaseModel):
    id: UUID
    email: str | None
    github_username: str | None
    name: str | None
    avatar_url: str | None
    plan: str
    skills_this_month: int
    stripe_customer_id: str | None

    model_config = {"from_attributes": True}


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user


@router.post("/logout")
async def logout():
    return {"message": "Logged out successfully"}
