# Search API

---

## Search Endpoint

### GET /api/search

Search across papers, websites, and GitHub repos.

Query parameters:

| Parameter | Default | Description |
|---|---|---|
| `q` | `""` | Search query string |
| `mode` | `"lexical"` | Search mode: `"lexical"` or `"semantic"` |
| `limit` | `10` | Max results (1–50) |
| `library_id` | null | Restrict results to a specific library |
| `types` | all | Comma-separated item types: `"paper"`, `"website"`, `"github_repo"` |

Returns an empty array if `q` is blank.

#### Search Modes

**`lexical`** (default): Fast weighted keyword match. No API key required. Matches against title, abstract/description, authors, tags, and venue. Results are ranked by weighted term frequency.

**`semantic`**: OpenAI embedding cosine similarity. Requires `OPENAI_API_KEY`. Generates an embedding for the query, then compares to cached item embeddings. Falls back to lexical search if `OPENAI_API_KEY` is absent.

#### Response

Returns an array of item objects, each extended with a `score` field (0–1 range, rounded to 4 decimal places):

```json
[
  {
    "id": "p_abc123",
    "title": "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks",
    "authors": ["Lewis, P.", "Perez, E."],
    "year": 2020,
    "itemType": "paper",
    "score": 0.9432,
    ...
  },
  {
    "id": "w_def456",
    "title": "LangChain Documentation",
    "url": "https://langchain.com",
    "itemType": "website",
    "score": 0.7810,
    ...
  }
]
```

The `itemType` field (`"paper"`, `"website"`, or `"github_repo"`) identifies the object type.

---

## Library Map Endpoint

### GET /api/search/map

Returns 2D UMAP coordinates for every item in a library that has a cached embedding. Used by the Library Map visualization.

Query parameters:

| Parameter | Description |
|---|---|
| `library_id` | Filter to a specific library |

Response is an array of map point objects:

```json
[
  {
    "id": "p_abc123",
    "x": 0.342,
    "y": -0.178,
    "title": "Attention Is All You Need",
    "itemType": "paper",
    "collections": ["c_ml"],
    "url": null
  }
]
```

Coordinates are normalized to the range `[-1, 1]`.

The projection is cached in `data/map_cache.json` and only recomputed when the set of embedded items changes.

Returns `503` if `umap-learn` is not installed:

```json
{
  "detail": "umap-learn is not installed. Run: pip install umap-learn"
}
```

---

## Authors Search

### GET /api/authors/search

Search for authors by name prefix. Used by the author linking UI.

Query parameters:

| Parameter | Default | Description |
|---|---|---|
| `q` | required | Search query (min 1 char) |
| `limit` | `10` | Max results (1–50) |

Returns an array of `AuthorSearchResult` objects:

```json
[
  {
    "id": "a_abc123",
    "name": "Vaswani, Ashish",
    "currentAffiliation": "Google Brain",
    "orcid": "0000-0001-2345-6789",
    "paperCount": 12
  }
]
```

### POST /api/authors/match

Find author records that match a given name string. Useful before linking to detect potential duplicates.

Request body:

```json
{
  "name": "A. Vaswani",
  "context": {
    "title": "Attention Is All You Need",
    "venue": "NeurIPS",
    "co_authors": ["Shazeer, N."]
  }
}
```

Returns an array of match candidates with confidence scores:

```json
[
  {
    "author": { "id": "a_abc123", "name": "Vaswani, Ashish", ... },
    "confidence": 0.92
  }
]
```
