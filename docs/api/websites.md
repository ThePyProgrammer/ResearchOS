# Websites API

All endpoints are prefixed with `/api/websites`.

---

## Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/websites` | List websites |
| POST | `/api/websites` | Create a website manually |
| POST | `/api/websites/import` | Fetch URL metadata and create a website |
| GET | `/api/websites/{id}` | Get a single website |
| PATCH | `/api/websites/{id}` | Update a website |
| DELETE | `/api/websites/{id}` | Delete a website |

---

### GET /api/websites

Query parameters:

| Parameter | Description |
|---|---|
| `collection_id` | Filter by collection membership |
| `status` | Filter by status (`inbox`, `to-read`, `read`) |
| `library_id` | Filter by library |

Returns an array of Website objects.

---

### POST /api/websites

Create a website with manually provided metadata.

Request body (`WebsiteCreate`):

```json
{
  "title": "The Illustrated Transformer",
  "url": "https://jalammar.github.io/illustrated-transformer/",
  "authors": ["Alammar, J."],
  "publishedDate": "2018-06-27",
  "description": "A visual walkthrough of the Transformer architecture.",
  "tags": ["transformers", "visualization"],
  "status": "inbox",
  "source": "human",
  "libraryId": "lib_default"
}
```

Returns the created Website at `201`.

---

### POST /api/websites/import

Fetch a URL's metadata (title, description, author, date) via og:* meta tags and HTML citation tags, then add it to the library.

Deduplicates by URL — if the URL already exists, returns `200` with the existing website and `"alreadyExists": true`.

Request body:

```json
{
  "url": "https://jalammar.github.io/illustrated-transformer/",
  "libraryId": "lib_default"
}
```

Response on new website (`201`):

```json
{
  "id": "w_abc123",
  "title": "The Illustrated Transformer",
  "alreadyExists": false,
  ...
}
```

Response on duplicate (`200`):

```json
{
  "id": "w_existing",
  "alreadyExists": true,
  ...
}
```

---

### PATCH /api/websites/{id}

Partial update. All fields optional. Request body (`WebsiteUpdate`):

```json
{
  "title": "Updated Title",
  "status": "read",
  "tags": ["transformers"]
}
```

---

### DELETE /api/websites/{id}

Returns `204 No Content`.

---

## Notes and Chat

See [notes.md](notes.md) for website note endpoints and [chat.md](chat.md) for website chat endpoints.

Website notes: `GET/POST /api/websites/{id}/notes`, `POST /api/websites/{id}/notes/generate`

Website chat: `GET/POST/DELETE /api/websites/{id}/chat`

---

## Website Object Shape

```json
{
  "id": "w_abc123",
  "title": "The Illustrated Transformer",
  "url": "https://jalammar.github.io/illustrated-transformer/",
  "authors": ["Alammar, J."],
  "publishedDate": "2018-06-27",
  "description": "A visual walkthrough...",
  "tags": ["transformers"],
  "status": "inbox",
  "source": "human",
  "githubUrl": null,
  "links": [],
  "collections": ["c_ml"],
  "libraryId": "lib_default",
  "createdAt": "2024-03-15T10:00:00Z",
  "itemType": "website"
}
```

---

## GitHub Repos API

All endpoints are prefixed with `/api/github-repos`.

| Method | Path | Description |
|---|---|---|
| GET | `/api/github-repos` | List repos |
| POST | `/api/github-repos` | Create a repo manually |
| POST | `/api/github-repos/import` | Fetch GitHub metadata and create a repo |
| GET | `/api/github-repos/{id}` | Get a single repo |
| PATCH | `/api/github-repos/{id}` | Update a repo |
| DELETE | `/api/github-repos/{id}` | Delete a repo |

### GET /api/github-repos

Query parameters: `collection_id`, `status`, `library_id` (same semantics as websites).

### POST /api/github-repos/import

Fetch a GitHub repository's metadata, README, and CITATION.cff, then add it to the library.

Normalizes the URL to `https://github.com/{owner}/{repo}` before dedup check. Deduplicates by canonical URL.

Request body:

```json
{
  "url": "https://github.com/huggingface/transformers",
  "libraryId": "lib_default"
}
```

Returns `200` with `"alreadyExists": true` if the repo is already in the library, otherwise `201`.

### GitHub Repo Notes and Chat

GitHub repo notes: `GET/POST /api/github-repos/{id}/notes`, `POST /api/github-repos/{id}/notes/generate`

GitHub repo chat: `GET/POST/DELETE /api/github-repos/{id}/chat`

### GitHub Repo Object Shape

```json
{
  "id": "gh_abc123",
  "title": "transformers",
  "url": "https://github.com/huggingface/transformers",
  "owner": "huggingface",
  "repoName": "transformers",
  "description": "State-of-the-art ML for Pytorch, TensorFlow, and JAX.",
  "abstract": null,
  "stars": 125000,
  "language": "Python",
  "topics": ["nlp", "machine-learning"],
  "authors": ["Wolf, T."],
  "publishedDate": "2019-10-09",
  "version": "v4.38.0",
  "doi": null,
  "license": "Apache-2.0",
  "websiteUrl": "https://huggingface.co/transformers",
  "links": [],
  "tags": ["nlp", "machine-learning"],
  "status": "inbox",
  "source": "human",
  "collections": [],
  "libraryId": "lib_default",
  "createdAt": "2024-03-15T10:00:00Z",
  "itemType": "github_repo"
}
```
