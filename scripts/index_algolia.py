#!/usr/bin/env python3
"""
Configure and sync Firestore books and persons collections to Algolia indices.
Safe to re-run (idempotent) — uses book_id / person_id as objectID.

Usage:
  # Full re-index (run on deploy)
  python index_algolia.py

  # Index a single document
  python index_algolia.py --collection books --id 001234
  python index_algolia.py --collection persons --id 000123

Required env vars:
  ALGOLIA_APP_ID    — Algolia Application ID
  ALGOLIA_ADMIN_KEY — Algolia Admin API Key
  GOOGLE_CLOUD_PROJECT (or FIRESTORE_PROJECT_ID) — GCP project ID
"""

import argparse
import os
from algoliasearch.search.client import SearchClientSync
import google.cloud.firestore as firestore

ALGOLIA_APP_ID = os.environ["ALGOLIA_APP_ID"]
ALGOLIA_ADMIN_KEY = os.environ["ALGOLIA_ADMIN_KEY"]

BATCH_SIZE = 500

BOOKS_FIELDS = {
    "objectID", "book_id", "title", "title_yomi",
    "author_name", "author_name_yomi", "author_id",
    "font_kana_type", "copyright",
}

PERSONS_FIELDS = {
    "objectID", "person_id", "last_name", "first_name",
    "last_name_yomi", "first_name_yomi",
}

COLLECTION_CONFIG = {
    "books":   BOOKS_FIELDS,
    "persons": PERSONS_FIELDS,
}

BOOKS_SETTINGS = {
    "searchableAttributes": [
        "title",
        "title_yomi",
        "author_name",
        "author_name_yomi",
    ],
    "attributesToRetrieve": [
        "book_id", "title", "title_yomi", "author_name",
        "author_id", "font_kana_type", "copyright",
    ],
    "customRanking": ["desc(book_id)"],
    "queryLanguages": ["ja"],
    "ignorePlurals": False,
    "removeStopWords": False,
}

PERSONS_SETTINGS = {
    "searchableAttributes": [
        "last_name",
        "first_name",
        "last_name_yomi",
        "first_name_yomi",
    ],
    "attributesToRetrieve": [
        "person_id", "last_name", "first_name", "last_name_yomi", "first_name_yomi",
    ],
    "queryLanguages": ["ja"],
}


def configure_index(client: SearchClientSync, index_name: str, settings: dict) -> None:
    print(f"Configuring '{index_name}' index settings...")
    client.set_settings(index_name=index_name, index_settings=settings)
    print(f"  Done.")


def fetch_collection(db: firestore.Client, collection: str, fields: set[str]):
    for doc in db.collection(collection).stream():
        record = {"objectID": doc.id, **doc.to_dict()}
        yield {k: v for k, v in record.items() if k in fields}


def fetch_document(db: firestore.Client, collection: str, doc_id: str, fields: set[str]) -> dict | None:
    doc = db.collection(collection).document(doc_id).get()
    if not doc.exists:
        return None
    record = {"objectID": doc.id, **doc.to_dict()}
    return {k: v for k, v in record.items() if k in fields}


def index_collection(client: SearchClientSync, index_name: str, records) -> None:
    print(f"Indexing '{index_name}'...")
    total = 0
    batch = []
    for record in records:
        batch.append(record)
        if len(batch) >= BATCH_SIZE:
            client.save_objects(index_name=index_name, objects=batch)
            total += len(batch)
            print(f"  Uploaded {total}...")
            batch = []
    if batch:
        client.save_objects(index_name=index_name, objects=batch)
        total += len(batch)
    print(f"  Done. Total: {total}")


def index_one(client: SearchClientSync, db: firestore.Client, collection: str, doc_id: str) -> None:
    fields = COLLECTION_CONFIG[collection]
    record = fetch_document(db, collection, doc_id, fields)
    if record is None:
        print(f"Document '{doc_id}' not found in '{collection}'.")
        return
    client.save_object(index_name=collection, body=record)
    print(f"Indexed {collection}/{doc_id}: {record.get('title') or record.get('last_name', '')}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync Firestore to Algolia indices.")
    parser.add_argument("--collection", choices=["books", "persons"], help="Collection to index a single document from")
    parser.add_argument("--id", dest="doc_id", help="Document ID to index")
    args = parser.parse_args()

    db = firestore.Client()
    client = SearchClientSync(ALGOLIA_APP_ID, ALGOLIA_ADMIN_KEY)

    if args.collection and args.doc_id:
        index_one(client, db, args.collection, args.doc_id)
        return

    if args.collection or args.doc_id:
        parser.error("--collection and --id must be used together.")

    # Full re-index
    configure_index(client, "books", BOOKS_SETTINGS)
    index_collection(client, "books", fetch_collection(db, "books", BOOKS_FIELDS))

    configure_index(client, "persons", PERSONS_SETTINGS)
    index_collection(client, "persons", fetch_collection(db, "persons", PERSONS_FIELDS))

    print("Algolia indexing complete.")


if __name__ == "__main__":
    main()
