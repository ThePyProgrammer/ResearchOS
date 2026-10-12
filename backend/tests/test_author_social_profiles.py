from unittest.mock import MagicMock

import pytest

from models.author import Author, AuthorCreate, AuthorUpdate
from services import author_service


LINKS = {"linkedinUrl": "https://www.linkedin.com/in/jane", "twitterUrl": "https://twitter.com/jane"}


def profile(**fields):
    return Author(id="a1", name="Jane", name_normalized="jane", created_at="2026-01-01", **fields)


def test_create_persists_social_links(mocker):
    db = MagicMock()
    mocker.patch.object(author_service, "get_client", return_value=db)
    mocker.patch.object(author_service, "get_author", return_value=profile(**LINKS))
    result = author_service.create_author(AuthorCreate(name="Jane", **LINKS))
    row = db.table.return_value.insert.call_args.args[0]
    assert row["linkedin_url"] == LINKS["linkedinUrl"]
    assert row["twitter_url"] == LINKS["twitterUrl"]
    assert result.model_dump(by_alias=True)["linkedinUrl"] == LINKS["linkedinUrl"]


def test_patch_clears_only_the_selected_social_link(mocker):
    db = MagicMock()
    mocker.patch.object(author_service, "get_client", return_value=db)
    mocker.patch.object(author_service, "get_author", return_value=profile(**LINKS))
    author_service.update_author("a1", AuthorUpdate(linkedinUrl=None))
    db.table.return_value.update.assert_called_once_with({"linkedin_url": None})
    db.table.return_value.update.return_value.eq.assert_called_once_with("id", "a1")


@pytest.mark.parametrize("method,path,service,status", [
    ("post", "/api/authors", "create_author", 201),
    ("patch", "/api/authors/a1", "update_author", 200),
    ("get", "/api/authors/a1", "get_author", 200),
    ("get", "/api/authors", "list_authors", 200),
])
def test_social_links_keep_camel_case_contract(client, mocker, method, path, service, status):
    result = profile(**LINKS)
    mocked = mocker.patch.object(author_service, service, return_value=[result] if service == "list_authors" else result)
    response = getattr(client, method)(path, **({"json": {"name": "Jane", **LINKS}} if method != "get" else {}))
    assert response.status_code == status
    payload = response.json()[0] if service == "list_authors" else response.json()
    assert {key: payload[key] for key in LINKS} == LINKS
    assert "linkedin_url" not in payload and "twitter_url" not in payload
    if method != "get":
        data = mocked.call_args.args[-1]
        assert data.linkedin_url == LINKS["linkedinUrl"]
        assert data.twitter_url == LINKS["twitterUrl"]


@pytest.mark.parametrize("field", ["linkedinUrl", "twitterUrl"])
@pytest.mark.parametrize("value", ["javascript:alert(1)", "not-a-url", "ftp://example.com/profile"])
@pytest.mark.parametrize("method,path", [("post", "/api/authors"), ("patch", "/api/authors/a1")])
def test_invalid_social_urls_are_rejected(client, field, value, method, path):
    response = getattr(client, method)(path, json={"name": "Jane", field: value})
    assert response.status_code == 422


@pytest.mark.parametrize("url", ["https://x.com/jane", "https://twitter.com/jane"])
def test_both_twitter_domains_are_supported(url):
    assert AuthorUpdate(twitterUrl=url).twitter_url == url


def test_older_profiles_default_to_no_social_links():
    assert profile().linkedin_url is None
    assert profile().twitter_url is None
    assert AuthorUpdate(name="Jane").model_dump(exclude_unset=True) == {"name": "Jane"}
