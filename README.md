# Aozora Pages

A modern platform for Aozora Bunko (青空文庫), providing a beautiful reading experience for timeless Japanese literature.

## Project Structure

- **[astro/](./astro)**: Astro 6.0 static site (pages, components, Cloudflare Pages Function)
- **[aozora_data/](./aozora_data)**: Python import pipeline (CSV → JSON files → Algolia)
- **[docs/](./docs)**: Architecture, data format, and setup documentation

## Documentation

- [OVERVIEW.md](./docs/OVERVIEW.md) — tech stack, routes, daily pipeline
- [ARCHITECTURE.md](./docs/ARCHITECTURE.md) — system diagram and component architecture
- [DATA_FORMAT.md](./docs/DATA_FORMAT.md) — JSON file schema reference
- [SETUP_CLOUDRUN.md](./docs/SETUP_CLOUDRUN.md) — one-time Cloud Run Job setup
