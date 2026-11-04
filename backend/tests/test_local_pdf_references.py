import asyncio
import hashlib

import fitz
import pytest

from services import local_pdf_reference_service as service
from services.openalex_client import CitationProviderError


def pdf(*pages):
    with fitz.open() as document:
        for text in pages:
            page = document.new_page()
            page.insert_text((50, 60), text)
        return document.tobytes()


def test_only_bibliography_identifiers_and_raw_evidence():
    content = pdf('Body DOI: 10.1234/body\nReferences\n[1] Author. Title. doi:10.1234/target.\n[2] Other. arXiv:2401.12345v2.\n[3] Title only.')
    result = service.extract_references(content, {})
    assert result.status == 'succeeded'
    assert [r.identifiers for r in result.references] == [{'doi': '10.1234/target'}, {'arxiv': '2401.12345'}, {}]
    assert result.references[0].raw['pages'] == [1]
    assert result.references[0].raw['pdf_sha256'] == hashlib.sha256(content).hexdigest()
    assert 'Author. Title.' in result.references[0].raw['unstructured']


def test_columns_years_page_continuations_and_appendix_boundary():
    with fitz.open() as document:
        page = document.new_page(width=600, height=800)
        page.insert_text((50, 60), 'References\n[1] First author.\n2024. 4\n[2] Second author.')
        page.insert_text((320, 60), '[3] Third author.\ndoi:10.1234/third')
        page = document.new_page(width=600, height=800)
        page.insert_text((50, 60), 'continued text.\n[4] Fourth author.')
        page = document.new_page()
        page.insert_text((50, 60), 'Paper title\nSupplementary Material\ndoi:10.1234/not-a-reference')
        content = document.tobytes()
    result = service.extract_references(content, {})
    assert result.status == 'succeeded'
    assert len(result.references) == 4
    assert result.references[2].raw['pages'] == [1, 2]
    assert '2024. 4' in result.references[0].raw['unstructured']
    assert 'Paper title' not in result.references[-1].raw['unstructured']


@pytest.mark.parametrize('text', [
    'Body text DOI:10.1234/body',
    'References\nSmith. An unnumbered work. DOI:10.1234/work',
    'References\n[1] First DOI:10.1234/first\n[3] Missing entry.',
    'References\n[1] First.\n[1] Duplicate label.',
    'References\n[2] Missing beginning.',
    '',
])
def test_unsupported_or_incomplete_bibliographies_do_not_publish_identifiers(text):
    result = service.extract_references(pdf(text), {})
    assert result.status == 'partial'
    assert all(not r.identifiers for r in result.references)


def test_dotted_labels_and_conflicting_identifiers():
    result = service.extract_references(pdf('Bibliography\n1. doi:10.1234/a doi:10.1234/b\n2. arXiv:hep-th/9901001v3.'), {})
    assert result.status == 'succeeded'
    assert result.references[0].identifiers == {}
    assert result.references[0].raw['ambiguous_identifiers']
    assert result.references[1].identifiers == {'arxiv': 'hep-th/9901001'}


def test_large_appendix_heading_ends_bibliography():
    with fitz.open() as document:
        page = document.new_page()
        page.insert_text((50, 60), 'References\n[1] Work. doi:10.1234/reference', fontsize=10)
        page.insert_text((50, 110), 'A', fontsize=15)
        page.insert_text((80, 110), 'Implementation details', fontsize=15)
        page.insert_text((50, 140), 'doi:10.1234/body', fontsize=10)
        result = service.extract_references(document.tobytes(), {})
    assert result.status == 'succeeded'
    assert result.references[0].identifiers == {'doi': '10.1234/reference'}
    assert 'Implementation' not in result.references[0].raw['unstructured']


def test_unheaded_biography_gap_is_incomplete_and_not_reference_text():
    with fitz.open() as document:
        page = document.new_page()
        page.insert_text((50, 60), 'References\n[1] Work. doi:10.1234/reference', fontsize=10)
        page.insert_text((50, 250), 'Author received a degree. doi:10.1234/body', fontsize=10)
        result = service.extract_references(document.tobytes(), {})
    assert result.status == 'partial'
    assert result.references[0].identifiers == {}
    assert 'received' not in result.references[0].raw['unstructured']


def test_replacement_during_extraction_is_not_published(mocker):
    mocker.patch.object(service.pdf_service, 'managed_location', return_value=('gcs', 'a.pdf'))
    mocker.patch.object(service.pdf_service, 'read_managed_pdf', side_effect=[pdf('References\n[1] Work.'), pdf('replacement')])
    with pytest.raises(CitationProviderError, match='changed') as error:
        asyncio.run(service.fetch_local_pdf_references({'pdf_url': 'managed'}))
    assert error.value.retryable


def test_local_extraction_needs_no_grobid_or_http(mocker, monkeypatch):
    monkeypatch.delenv('GROBID_URL', raising=False)
    mocker.patch.object(service.pdf_service, 'managed_location', return_value=('gcs', 'a.pdf'))
    read = mocker.patch.object(service.pdf_service, 'read_managed_pdf', return_value=pdf('References\n[1] Work.'))
    result = asyncio.run(service.fetch_local_pdf_references({'pdf_url': 'managed'}))
    assert result.provider == 'pymupdf'
    assert result.status == 'succeeded'
    assert read.call_count == 2
