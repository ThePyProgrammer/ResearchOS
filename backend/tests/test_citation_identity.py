import pytest

from services.citation_identity_service import normalize_doi, normalize_arxiv, normalize_title, exact_work_match


@pytest.mark.parametrize('raw,expected', [
    ('https://doi.org/10.1234/ABC', '10.1234/abc'), (' DOI: 10.1234/X ', '10.1234/x'),
    ('https://dx.doi.org/10.1234/x', '10.1234/x'), ('not a doi', None),
])
def test_doi(raw, expected):
    assert normalize_doi(raw) == expected


@pytest.mark.parametrize('raw,expected', [
    ('https://arxiv.org/pdf/2301.12345v3.pdf', '2301.12345'),
    ('arXiv:hep-th/9901001v2', 'hep-th/9901001'),
    ('https://example.org/abs/2301.12345', None),
])
def test_arxiv(raw, expected):
    assert normalize_arxiv(raw) == expected


def test_unicode_and_conflicting_identifiers():
    assert normalize_title('Énergie: 模型!') == 'énergie 模型'
    work = {'doi': 'https://doi.org/10.1234/other', 'locations': [
        {'landing_page_url': 'https://arxiv.org/abs/2301.12345v2'}]}
    assert exact_work_match({'arxiv_id': '2301.12345'}, work)
    assert not exact_work_match({'doi': '10.1234/local', 'arxiv_id': '2301.12345'}, work)
