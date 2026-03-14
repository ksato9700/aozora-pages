from typing import Any, Protocol


class AozoraDB(Protocol):
    """Interface shared by AozoraFirestore and AozoraJSON."""

    def get_watermark(self) -> str | None:
        """Return the last-processed date, or None if not set."""
        ...

    def save_watermark(self, date_str: str) -> None:
        """Persist the last-processed date."""
        ...

    def upsert_book(self, book_id: str, data: dict[str, Any]) -> None:
        """Insert or update a book record."""
        ...

    def upsert_person(self, person_id: str, data: dict[str, Any]) -> None:
        """Insert or update a person record."""
        ...

    def upsert_contributor(self, contributor_id: str, data: dict[str, Any]) -> None:
        """Insert or update a contributor record."""
        ...

    def update_book_author(self, book_id: str, data: dict[str, Any]) -> None:
        """Merge author_name and author_id into an existing book record."""
        ...

    def commit(self) -> None:
        """Flush any pending writes."""
        ...
