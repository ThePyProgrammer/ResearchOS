import asyncio
import hashlib

import httpx
import pytest

from services import pdf_reference_service as service
from services.openalex_client import CitationProviderError

TEI = b'''<TEI xmlns="http://www.tei-c.org/ns/1.0">
<teiHeader><encodingDesc><appInfo><application version="0.8.test"/></appInfo></encodingDesc></teiHeader>
<text><back><listBibl>
<biblStruct xml:id="b0"><analytic><title>Referenced paper</title><author><persName><forename>A</forename><surname>Writer</surname></persName></author></analytic>
<monogr><imprint><date when="2024"/></imprint></monogr><idno type="DOI">10.1234/TARGET</idno>
<note type="raw_reference">A. Writer. Referenced paper. 2024.</note></biblStruct>
<biblStruct xml:id="b1"><analytic><title>Title-only reference</title></analytic><note type="raw_reference">Unresolved book.</note></biblStruct>
<biblStruct xml:id="b2"><idno type="arXiv">hep-th/9901001v2</idno></biblStruct>
</listBibl></back></text></TEI>'''
PDF = b'%PDF-fixture'
PAPER = {'id': 'p_source', 'pdf_url': 'https://storage.googleapis.com/papers/p_source.pdf'}


def test_structured_references_keep_raw_evidence_and_pdf_hash():
    result = service.parse_references(TEI, PAPER, 'abc123')
    assert result.provider == 'grobid'
    assert result.status == 'succeeded'
    assert result.identities == {}  # PDF-only sources need no external identity.
    assert len(result.references) == 3
    assert result.references[0].identifiers == {'doi': '10.1234/target'}
    assert result.references[0].raw['unstructured'] == 'A. Writer. Referenced paper. 2024.'
    assert result.references[0].raw['authors'] == ['A Writer']
    assert result.references[0].raw['pdf_sha256'] == 'abc123'
    assert result.references[0].raw['parser_version'] == '0.8.test'
    assert result.references[1].identifiers == {}
    assert result.references[2].identifiers == {'arxiv': 'hep-th/9901001'}


def test_conflicting_reference_identifiers_are_not_promoted():
    xml = TEI.replace(b'<idno type="DOI">10.1234/TARGET</idno>',
        b'<idno type="DOI">10.1234/TARGET</idno><idno type="DOI">10.1234/other</idno>')
    result = service.parse_references(xml, PAPER, 'hash')
    assert result.references[0].identifiers == {}
    assert result.references[0].raw['ambiguous_identifiers']


@pytest.mark.parametrize('xml', [b'<bad', b'<html/>', b'<!DOCTYPE x [<!ENTITY y "x">]><TEI/>'])
def test_invalid_or_unsafe_xml_is_not_empty_success(xml):
    with pytest.raises(CitationProviderError):
        service.parse_references(xml, PAPER, 'hash')


def test_empty_bibliography_is_partial():
    result = service.parse_references(b'<TEI xmlns="http://www.tei-c.org/ns/1.0"><text/></TEI>', PAPER, 'hash')
    assert result.status == 'partial'
    assert 'OCR' in result.message


def run_fetch(monkeypatch, handler, contents=None):
    monkeypatch.setenv('GROBID_URL', 'http://localhost:8070')
    monkeypatch.setattr(service.pdf_service, 'managed_location', lambda _: ('gcs', 'p_source.pdf'))
    values = iter(contents or [PDF, PDF])
    monkeypatch.setattr(service.pdf_service, 'read_managed_pdf', lambda _: next(values))
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await service.fetch_pdf_references(PAPER, client)
    return asyncio.run(run())


def test_pdf_request_disables_external_consolidation_and_preserves_hash(monkeypatch):
    def handler(request):
        assert str(request.url) == 'http://localhost:8070/api/processReferences'
        assert b'name="consolidateCitations"\r\n\r\n0' in request.content
        assert b'name="includeRawCitations"\r\n\r\n1' in request.content
        assert PDF in request.content
        return httpx.Response(200, content=TEI)
    result = run_fetch(monkeypatch, handler)
    assert hashlib.sha256(PDF).hexdigest() in result.version


def test_pdf_replacement_during_extraction_is_retryable(monkeypatch):
    with pytest.raises(CitationProviderError, match='PDF changed') as exc:
        run_fetch(monkeypatch, lambda _: httpx.Response(200, content=TEI), [PDF, b'%PDF-replaced'])
    assert exc.value.retryable


def test_no_content_is_partial_and_busy_server_honors_delay(monkeypatch):
    result = run_fetch(monkeypatch, lambda _: httpx.Response(204))
    assert result.status == 'partial'
    with pytest.raises(CitationProviderError) as exc:
        run_fetch(monkeypatch, lambda _: httpx.Response(503, headers={'Retry-After':'12'}))
    assert exc.value.retryable and exc.value.retry_after == 12


def test_redirect_is_not_followed_with_pdf_data(monkeypatch):
    requests = []
    def handler(request):
        requests.append(request)
        return httpx.Response(307, headers={'Location': 'https://unexpected.example/upload'})
    with pytest.raises(CitationProviderError, match='HTTP 307'):
        run_fetch(monkeypatch, handler)
    assert len(requests) == 1


def test_missing_configuration_never_reads_or_sends_pdf(monkeypatch):
    monkeypatch.delenv('GROBID_URL', raising=False)
    monkeypatch.setattr(service.pdf_service, 'read_managed_pdf', lambda _: pytest.fail('Unexpected read'))
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _: pytest.fail('Unexpected request'))) as client:
            await service.fetch_pdf_references(PAPER, client)
    with pytest.raises(CitationProviderError, match='GROBID_URL'):
        asyncio.run(run())
