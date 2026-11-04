"""Conservative, local extraction of numbered bibliographies; no OCR or remote parser."""
import hashlib
import re

import fitz

from models.citation import CitationReference, CitationResult
from services import pdf_service
from services.citation_identity_service import local_identifiers, normalize_arxiv, normalize_doi
from services.openalex_client import CitationProviderError

HEADING = re.compile(r'^(?:\d+[.\s]+)?(?:references|bibliography|works cited)\s*$', re.I)
STOP = re.compile(r'^(?:[A-Z\d]+[.\s]+)?(?:appendix|appendices|supplementary|supplemental|acknowledg\w*|biograph\w*)\b', re.I)
LABEL = re.compile(r'^\s*(?:\[(\d{1,3})\]|(\d{1,3})\.)\s+(.+)')


def _lines(page):
    blocks = [b for b in page.get_text('dict', flags=fitz.TEXTFLAGS_DICT & ~fitz.TEXT_PRESERVE_IMAGES)['blocks'] if b['type'] == 0]
    middle = page.rect.width / 2
    left = [b for b in blocks if b['bbox'][2] < middle + 12 and b['bbox'][0] < middle - 40]
    right = [b for b in blocks if b['bbox'][0] > middle - 12 and b['bbox'][2] > middle + 40]
    columns = bool(left and right)
    blocks.sort(key=lambda b: (0 if not columns or b['bbox'][0] < middle - 12 else 1, b['bbox'][1], b['bbox'][0]))
    for block in blocks:
        column = int(columns and block['bbox'][0] > middle - 12)
        for line in block['lines']:
            text = ''.join(span['text'] for span in line['spans']).strip()
            y0, y1 = line['bbox'][1], line['bbox'][3]
            # Running headers and footers are not bibliography continuation.
            if (y0 < page.rect.height * .06 or y1 > page.rect.height * .94) and not HEADING.fullmatch(text):
                continue
            if text and not text.isdigit():
                size = max(span['size'] for span in line['spans'])
                yield text, size, column, y0, y1


def explicit_identifiers(text):
    values = {'doi': set(), 'arxiv': set()}
    for value in re.findall(r'\b10\.\d{4,9}/[^\s<>]+', text, re.I):
        value = value.rstrip('.,;:')
        while value.endswith(')') and value.count(')') > value.count('('):
            value = value[:-1]
        value = normalize_doi(value)
        if value:
            values['doi'].add(value)
    pattern = r'(?:arxiv\s*:\s*|arxiv\.org/(?:abs|pdf)/)(\d{4}\.\d{4,5}(?:v\d+)?|[a-z.-]+/\d{7}(?:v\d+)?)'
    for value in re.findall(pattern, text, re.I):
        value = normalize_arxiv(value)
        if value:
            values['arxiv'].add(value)
    ambiguous = any(len(v) > 1 for v in values.values())
    return ({} if ambiguous else {k: next(iter(v)) for k, v in values.items() if v}), ambiguous


def extract_references(content: bytes, paper: dict) -> CitationResult:
    digest = hashlib.sha256(content).hexdigest()
    result = CitationResult(provider='pymupdf', identities=local_identifiers(paper),
        version=f'pymupdf:{fitz.VersionBind};adapter:1;sha256:{digest}')
    entries, current, found, stopped = [], None, False, False
    label_style = None
    reference_size, previous, uncertain_boundary = None, None, False
    unsupported = []
    try:
        with fitz.open(stream=content, filetype='pdf') as document:
            if document.needs_pass or len(document) > 1000:
                raise CitationProviderError('Encrypted or oversized PDF cannot be indexed locally')
            for page_number, page in enumerate(document, 1):
                lines = list(_lines(page))
                if entries and any(STOP.match(line[0]) for line in lines[:4]):
                    break
                previous = None
                for line, size, column, y0, y1 in lines:
                    if not found:
                        if HEADING.fullmatch(line):
                            found = True
                        continue
                    if STOP.match(line):
                        stopped = True
                        break
                    if HEADING.fullmatch(line):
                        continue
                    match = LABEL.match(line)
                    style = ('bracket' if match[1] else 'dot') if match else None
                    if match and label_style and style != label_style:
                        match = None
                    if current and not match:
                        if size > reference_size * 1.18:
                            stopped = True
                            break
                        if previous and previous[0] == column and y0 - previous[1] > max(30, reference_size * 3):
                            uncertain_boundary = True
                            stopped = True
                            break
                    previous = (column, y1)
                    if match:
                        reference_size = size
                        label_style = style
                        current = {'label': int(match[1] or match[2]), 'lines': [line], 'pages': [page_number]}
                        entries.append(current)
                    elif current:
                        current['lines'].append(line)
                        if page_number not in current['pages']:
                            current['pages'].append(page_number)
                    else:
                        unsupported.append({'page': page_number, 'text': line})
                if stopped:
                    break
    except CitationProviderError:
        raise
    except Exception:
        raise CitationProviderError('PDF text could not be extracted locally') from None
    complete = bool(entries) and not unsupported and not uncertain_boundary and [e['label'] for e in entries] == list(range(1, len(entries) + 1))
    for entry in entries:
        text = '\n'.join(entry['lines'])
        identifiers, ambiguous = explicit_identifiers(text)
        result.references.append(CitationReference(
            key=hashlib.sha256(f"{entry['label']}:{text}".encode()).hexdigest(),
            identifiers=identifiers if complete else {},
            raw={'unstructured': text, 'pages': entry['pages'], 'reference_label': str(entry['label']),
                 'pdf_sha256': digest, 'parser': 'PyMuPDF', 'parser_version': fitz.VersionBind,
                 'ambiguous_identifiers': ambiguous}))
    if not complete:
        result.status = 'partial'
        result.resolution = 'unresolved'
        result.message = 'No complete numbered bibliography recognized; manual review or another parser is needed'
        # Preserve unnumbered text for inspection without claiming citation identities.
        if unsupported:
            result.candidates.append({'bibliography_lines': unsupported, 'pdf_sha256': digest})
    else:
        result.message = 'Numbered bibliography extracted locally; identifier-only matching, no OCR or title matching'
    return result


async def fetch_local_pdf_references(paper: dict) -> CitationResult:
    if not pdf_service.managed_location(paper.get('pdf_url')):
        return CitationResult(provider='pymupdf', status='not_found', resolution='unresolved',
                              message='Upload or store this PDF before indexing its bibliography')
    try:
        content = pdf_service.read_managed_pdf(paper['pdf_url'])
        result = extract_references(content, paper)
        if hashlib.sha256(pdf_service.read_managed_pdf(paper['pdf_url'])).digest() != hashlib.sha256(content).digest():
            raise CitationProviderError('PDF changed during bibliography extraction', retryable=True, retry_after=1)
        return result
    except CitationProviderError:
        raise
    except ValueError as exc:
        raise CitationProviderError(str(exc)) from None
    except Exception:
        raise CitationProviderError('Managed PDF could not be read', retryable=True) from None
