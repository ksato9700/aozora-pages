from typing import Any
from unittest.mock import patch

import pytest
from requests_mock import Mocker

from aozora_data.importer.csv_importer import import_from_csv, import_from_csv_url


class FakeDB:
    """Minimal in-memory DB stub for testing the CSV importer."""

    def __init__(self) -> None:
        self.watermark: str | None = None
        self.stored_books: dict[str, dict] = {}
        self.stored_persons: dict[str, dict] = {}
        self.stored_contributors: dict[str, dict] = {}

    def get_watermark(self) -> str | None:
        return self.watermark

    def save_watermark(self, date_str: str) -> None:
        self.watermark = date_str

    def upsert_book(self, book_id: str, data: dict[str, Any]) -> None:
        self.stored_books[book_id] = data

    def upsert_person(self, person_id: str, data: dict[str, Any]) -> None:
        self.stored_persons[person_id] = data

    def upsert_contributor(self, contributor_id: str, data: dict[str, Any]) -> None:
        self.stored_contributors[contributor_id] = data

    def update_book_author(self, book_id: str, data: dict[str, Any]) -> None:
        if book_id in self.stored_books:
            self.stored_books[book_id].update(data)
        else:
            self.stored_books[book_id] = data

    def commit(self) -> None:
        pass


@pytest.fixture()
def db() -> FakeDB:
    return FakeDB()


def test_import_from_csv(db: FakeDB):
    with open("tests/data/test.csv") as fp:
        import_from_csv(fp, db)

        assert len(db.stored_books) == 4

        # In the test CSV (assumed same as before), we check specific data
        book_id = "10001"
        person_id = "20001"

        # Ensure data is stored
        assert book_id.zfill(6) in [db.stored_books[k]["book_id"] for k in db.stored_books]
        # Our stored_books keys are string IDs from CSV, but values are typed.
        # Let's check based on the key
        book_id_padded = book_id.zfill(6)
        assert book_id_padded in db.stored_books
        book_data = db.stored_books[book_id_padded]
        assert book_data["book_id"] == book_id_padded

        # Person
        person_id_padded = person_id.zfill(6)
        assert person_id_padded in db.stored_persons
        person_data = db.stored_persons[person_id_padded]
        assert person_data["person_id"] == person_id_padded

        # Contributor
        found = False
        for _cid, cdata in db.stored_contributors.items():
            if cdata["book_id"] == "010001" and cdata["person_id"] == "020001":
                found = True
                assert cdata["role"] == 1  # Translator
                break
        assert found

        # Author denormalization
        assert db.stored_books["010003"]["author_name"] == "last_name_03 first_name_03"
        assert db.stored_books["010003"]["author_id"] == "020003"

        assert db.stored_books["010001"]["author_name"] == "last_name_01 first_name_01"
        assert db.stored_books["010001"]["author_id"] == "020001"

        assert db.stored_books["010000"]["author_name"] == "last_name_00 first_name_00"
        assert db.stored_books["010000"]["author_id"] == "020000"

        assert db.stored_books["010002"]["author_name"] == "last_name_02 first_name_02"
        assert db.stored_books["010002"]["author_id"] == "020002"


def test_import_from_csv_url(db: FakeDB, requests_mock: Mocker):
    csv_url = "http://test.csv.zip"
    with open("tests/data/test.csv.zip", "rb") as fp:
        requests_mock.get(csv_url, body=fp)
        with patch("aozora_data.importer.csv_importer._sync_algolia"):
            import_from_csv_url(csv_url, db)

        assert len(db.stored_books) == 4

        book_id = "010003"
        person_id = "020003"

        assert book_id in db.stored_books
        book_data = db.stored_books[book_id]

        assert person_id in db.stored_persons
        person_data = db.stored_persons[person_id]

        # Check integrity
        assert book_data["book_id"] == "010003"
        assert person_data["person_id"] == "020003"


def test_import_from_csv_url_with_limit(db: FakeDB, requests_mock: Mocker):
    csv_url = "http://test.csv.zip"
    with open("tests/data/test.csv.zip", "rb") as fp:
        requests_mock.get(csv_url, body=fp)
        with patch("aozora_data.importer.csv_importer._sync_algolia"):
            import_from_csv_url(csv_url, db, limit=2)

        assert len(db.stored_books) == 2


def test_import_with_release_date_watermark(db: FakeDB):
    # Watermark is 2022-09-01
    db.save_watermark("2022-09-01")

    # CSV with a book that has release_date > watermark but last_modified <= watermark
    csv_content = """作品ID,作品名,作品名読み,ソート用読み,副題,副題読み,原題,初出,分類番号,文字遣い種別,作品著作権フラグ,公開日,最終更新日,図書カードURL,人物ID,姓,名,姓読み,名読み,姓読みソート用,名読みソート用,姓ローマ字,名ローマ字,役割フラグ,生年月日,没年月日,人物著作権フラグ,底本名1,底本出版社名1,底本初版発行年1,入力に使用した版1,校正に使用した版1,底本の親本名1,底本の親本出版社名1,底本の親本初版発行年1,底本名2,底本出版社名2,底本初版発行年2,入力に使用した版2,校正に使用した版2,底本の親本名2,底本の親本出版社名2,底本の親本初版発行年2,入力者,校正者,テキストファイルURL,テキストファイル最終更新日,テキストファイル符号化方式,テキストファイル文字集合,テキストファイル修正回数,XHTML/HTMLファイルURL,XHTML/HTMLファイル最終更新日,XHTML/HTMLファイル符号化方式,XHTML/HTMLファイル文字集合,XHTML/HTMLファイル修正回数
12345,New Book,よみ,sort,,,初出,,123,新字新仮名,なし,2022-09-02,2022-09-01,https://card,678,姓,名,せい,めい,せい,めい,sei,mei,著者,,,,,,,,,,,,,,,,,,,,,,,,,,,https://txt,2022-09-01,ShiftJIS,JIS X 0208,0,https://html,2022-09-01,ShiftJIS,JIS X 0208,0
"""
    import io
    stream = io.StringIO(csv_content)
    
    with patch("aozora_data.importer.csv_importer._sync_algolia"):
        new_watermark, changed_books = import_from_csv(stream, db)
        
    assert new_watermark == "2022-09-02"
    assert len(changed_books) == 1
    assert changed_books[0]["book_id"] == "012345"
