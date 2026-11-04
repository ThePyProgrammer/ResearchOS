"""Opt-in bibliography extraction from managed PDFs through a configured GROBID service."""
import hashlib
import os
import re
from urllib.parse import urlsplit
import xml.etree.ElementTree as ET

import httpx

from models.citation import CitationReference, CitationResult
from services import pdf_service
from services.citation_identity_service import local_identifiers, normalize_arxiv, normalize_doi
from services.openalex_client import CitationProviderError, retry_seconds

NS = {'tei': 'http://www.tei-c.org/ns/1.0'}
MAX_XML_BYTES = 10 * 1024 * 1024


def configured_url() -> str | None:
    value = os.environ.get('GROBID_URL', '').strip().rstrip('/')
    if not value:
        return None
    parsed = urlsplit(value)
    if parsed.scheme not in {'http', 'https'} or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise CitationProviderError('GROBID_URL must be an HTTP(S) service URL without credentials, query, or fragment')
    return value


def _text(node) -> str:
    return ' '.join(' '.join(node.itertext()).split()) if node is not None else ''


def parse_references(xml: bytes, paper: dict, pdf_hash: str) -> CitationResult:
    if len(xml) > MAX_XML_BYTES or b'<!DOCTYPE' in xml.upper() or b'<!ENTITY' in xml.upper():
        raise CitationProviderError('GROBID returned unsupported XML')
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        raise CitationProviderError('GROBID returned invalid XML') from None
    if root.tag != '{http://www.tei-c.org/ns/1.0}TEI':
        raise CitationProviderError('GROBID did not return a TEI document')
    application = root.find('.//tei:application', NS)
    parser_version = application.get('version', 'unknown') if application is not None else 'unknown'
    result = CitationResult(provider='grobid', identities=local_identifiers(paper),
                            version=f'grobid:{parser_version};adapter:1;sha256:{pdf_hash}')
    seen = set()
    for entry in root.findall('.//tei:listBibl/tei:biblStruct', NS):
        serialized = ET.tostring(entry, encoding='unicode')
        key = hashlib.sha256(serialized.encode()).hexdigest()
        if key in seen:
            continue
        seen.add(key)
        identifiers = {}
        # Only explicit parsed identifiers are trusted, never title similarity.
        values = {'doi': set(), 'arxiv': set()}
        for identifier in entry.findall('.//tei:idno', NS):
            kind = (identifier.get('type') or '').lower()
            value = _text(identifier)
            if kind == 'doi':
                value = normalize_doi(value)
                if value:
                    values['doi'].add(value)
            elif kind in {'arxiv', 'arxiv_id'}:
                value = normalize_arxiv(value)
                if value:
                    values['arxiv'].add(value)
        for pointer in entry.findall('.//tei:ptr', NS):
            value = pointer.get('target')
            doi = normalize_doi(value) if value and re.match(r'https?://(?:dx\.)?doi\.org/', value, re.I) else None
            arxiv = normalize_arxiv(value)
            if doi:
                values['doi'].add(doi)
            if arxiv:
                values['arxiv'].add(arxiv)
        # Conflicting identifiers make the whole target ambiguous.
        if all(len(v) <= 1 for v in values.values()):
            identifiers = {kind: next(iter(v)) for kind, v in values.items() if v}
        title = entry.find('tei:analytic/tei:title', NS)
        if title is None:
            title = entry.find('tei:monogr/tei:title', NS)
        date = entry.find('.//tei:imprint/tei:date', NS)
        raw = {
            'unstructured': _text(entry.find(".//tei:note[@type='raw_reference']", NS)),
            'title': _text(title),
            'authors': [_text(author) for author in entry.findall('.//tei:author/tei:persName', NS)],
            'date': date.get('when') if date is not None else None,
            'pdf_sha256': pdf_hash, 'parser': 'GROBID', 'parser_version': parser_version,
            'reference_label': entry.get('{http://www.w3.org/XML/1998/namespace}id'),
            'tei': serialized,
            'ambiguous_identifiers': any(len(v) > 1 for v in values.values()),
        }
        result.references.append(CitationReference(key=key, identifiers=identifiers, raw=raw))
    if not result.references:
        result.status = 'partial'
        result.message = 'No structured bibliography extracted; scanned or unsupported PDFs may need OCR'
    return result


async def fetch_pdf_references(paper: dict, client: httpx.AsyncClient) -> CitationResult:
    base = configured_url()
    if not base:
        raise CitationProviderError('PDF indexing requires a configured GROBID_URL')
    if not pdf_service.managed_location(paper.get('pdf_url')):
        return CitationResult(provider='grobid', status='not_found', resolution='unresolved',
                              message='Upload or store this PDF before indexing its bibliography')
    try:
        content = pdf_service.read_managed_pdf(paper['pdf_url'])
    except ValueError as exc:
        raise CitationProviderError(str(exc)) from None
    except Exception:
        raise CitationProviderError('Managed PDF could not be read', retryable=True) from None
    pdf_hash = hashlib.sha256(content).hexdigest()
    try:
        response = await client.post(base + '/api/processReferences',
            files={'input': ('paper.pdf', content, 'application/pdf')},
            data={'includeRawCitations': '1', 'consolidateCitations': '0'},
            headers={'Accept': 'application/xml'}, timeout=120, follow_redirects=False)
    except httpx.RequestError:
        raise CitationProviderError('GROBID connection failed', retryable=True) from None
    if response.status_code == 204:
        return CitationResult(provider='grobid', status='partial', resolution='unresolved',
                              version=f'grobid:unknown;adapter:1;sha256:{pdf_hash}',
                              message='No structured bibliography extracted; scanned or unsupported PDFs may need OCR')
    if response.status_code != 200:
        raise CitationProviderError(f'GROBID returned HTTP {response.status_code}',
            retryable=response.status_code == 429 or response.status_code >= 500,
            retry_after=retry_seconds(response.headers.get('Retry-After')))
    result = parse_references(response.content, paper, pdf_hash)
    # Re-read to catch object replacement during extraction, even at the same URL.
    try:
        current_hash = hashlib.sha256(pdf_service.read_managed_pdf(paper['pdf_url'])).hexdigest()
    except Exception:
        raise CitationProviderError('Could not verify PDF after extraction', retryable=True) from None
    if current_hash != pdf_hash:
        raise CitationProviderError('PDF changed during bibliography extraction', retryable=True, retry_after=1)
    return result
