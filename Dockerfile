FROM python:3.13-slim

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Install Node.js LTS
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy dependency files
COPY pyproject.toml uv.lock README.md ./

# Install Python dependencies
# --frozen: use uv.lock
# --no-dev: exclude dev dependencies
RUN uv sync --frozen --no-dev --no-cache

# Copy only the modules needed for the import pipeline
COPY aozora_data/__init__.py ./aozora_data/__init__.py
COPY aozora_data/db ./aozora_data/db
COPY aozora_data/importer ./aozora_data/importer
COPY aozora_data/algolia ./aozora_data/algolia

# Copy Astro project source
COPY astro /astro

# Install Astro dependencies including wrangler (cached as a layer; re-runs only when package-lock.json changes)
WORKDIR /astro
RUN npm ci

WORKDIR /app

# Set environment variables
ENV PATH="/app/.venv/bin:$PATH"
# DATA_DIR must match where Astro's Vite import resolves to:
# astro/src/lib/data.ts imports '../../data/books.json' → /astro/data/
ENV DATA_DIR=/astro/data

# Entrypoint: Python import → JSON files → astro build → wrangler pages deploy
CMD ["/bin/sh", "-c", "python -m aozora_data.importer.main && cd /astro && npx astro build && npx wrangler pages deploy dist/ --project-name=aozora-pages"]
