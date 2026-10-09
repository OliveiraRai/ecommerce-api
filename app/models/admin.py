"""Administrative identity and revocable bearer sessions."""

from sqlalchemy import CheckConstraint, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Admin(Base):
    __tablename__ = "admins"
    __table_args__ = (CheckConstraint("id = 1", name="ck_admins_singleton"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    username: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    sessions: Mapped[list["AdminSession"]] = relationship(back_populates="admin")


class AdminSession(Base):
    __tablename__ = "admin_sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    admin_id: Mapped[int] = mapped_column(ForeignKey("admins.id", ondelete="CASCADE"), nullable=False)
    expires_at: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    revoked_at: Mapped[int | None] = mapped_column(Integer, nullable=True)
    admin: Mapped[Admin] = relationship(back_populates="sessions")
