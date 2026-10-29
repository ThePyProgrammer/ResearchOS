"""Explicit live integration check using temporary papers, cleaned up on exit."""
import argparse
import json
import os
from pathlib import Path
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args()
    if not args.execute:
        print('Use --execute to create temporary validation papers and GCS objects, then remove them.')
        return
    root = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(root))
    from dotenv import load_dotenv
    load_dotenv(root / '.env', override=False)
    os.environ.update(PAPER_STORAGE_PROVIDER='gcs', GCS_PROJECT_ID='researchos-513104',
                      GCS_PDF_BUCKET='researchos-papers')
    import httpx
    import pymupdf
    from fastapi.testclient import TestClient
    from app import app
    from models.paper import PaperCreate
    from services import paper_service, pdf_service, pdf_text_service
    from services.db import get_client

    def make_pdf(text):
        doc = pymupdf.open()
        page = doc.new_page()
        page.insert_text((72, 72), text)
        result = doc.tobytes()
        doc.close()
        return result

    # Do not enter the context manager: avoid unrelated startup seeding writes.
    client = TestClient(app)
    ids = []
    checks = []
    try:
        paper = paper_service.create_paper(PaperCreate(
            title='Temporary GCS migration validation', authors=[], year=2026, venue=''))
        ids.append(paper.id)
        first = make_pdf('ResearchOS GCS first validation document')
        response = client.post(f'/api/papers/{paper.id}/pdf', files={'file': ('test.pdf', first, 'application/pdf')})
        response.raise_for_status()
        assert response.json()['hasStoredPdf'] is True
        url = response.json()['pdfUrl']
        assert url.startswith('https://storage.googleapis.com/researchos-papers/')
        checks.append('API upload and managed-PDF flag')
        with httpx.Client(timeout=60) as http:
            response = http.get(url, headers={'Origin': 'http://localhost:5173'})
            response.raise_for_status()
            assert response.content == first
            assert response.headers.get('access-control-allow-origin') == 'http://localhost:5173'
            assert 'application/pdf' in response.headers.get('content-type', '')
            assert 'inline' in response.headers.get('content-disposition', '')
            response = http.get(url, headers={'Range': 'bytes=0-4', 'Origin': 'http://localhost:5173'})
            assert response.status_code == 206 and response.content == b'%PDF-'
        checks.append('Anonymous download, CORS, PDF metadata, and Range requests')
        assert client.post(f'/api/papers/{paper.id}/pdf/fetch').status_code == 422
        checks.append('Already-stored GCS fetch rejected')
        extracted = pdf_text_service.extract_and_cache(paper.id, url)
        assert 'first validation' in extracted['markdown']
        checks.append('Cache-miss PDF text extraction')
        replacement = make_pdf('ResearchOS GCS replacement validation document')
        response = client.post(f'/api/papers/{paper.id}/pdf', files={'file': ('test.pdf', replacement, 'application/pdf')})
        response.raise_for_status()
        assert pdf_text_service.get_cached_text(paper.id) is None
        with httpx.Client(timeout=60) as http:
            assert http.get(url).content == replacement
        extracted = pdf_text_service.extract_and_cache(paper.id, url)
        assert 'replacement validation' in extracted['markdown']
        checks.append('Atomic replacement and extracted-text cache invalidation')
        response = client.delete(f'/api/papers/{paper.id}/pdf')
        assert response.status_code == 204
        assert paper_service.get_paper(paper.id).pdf_url is None
        assert pdf_text_service.get_cached_text(paper.id) is None
        assert pdf_service.get_gcs_client().bucket('researchos-papers').get_blob(f'{paper.id}.pdf') is None
        checks.append('PDF removal clears storage, reference, and text cache')
        client.post(f'/api/papers/{paper.id}/pdf', files={'file': ('test.pdf', first, 'application/pdf')}).raise_for_status()
        assert client.delete(f'/api/papers/{paper.id}').status_code == 204
        assert paper_service.get_paper(paper.id) is None
        assert pdf_service.get_gcs_client().bucket('researchos-papers').get_blob(f'{paper.id}.pdf') is None
        checks.append('Whole-paper deletion removes managed PDF')
        second = paper_service.create_paper(PaperCreate(
            title='Temporary GCS bulk deletion validation', authors=[], year=2026, venue=''))
        ids.append(second.id)
        client.post(f'/api/papers/{second.id}/pdf', files={'file': ('test.pdf', first, 'application/pdf')}).raise_for_status()
        response = client.post('/api/batch/items', json={'items': [{'id': second.id, 'itemType': 'paper'}], 'action': 'delete'})
        response.raise_for_status()
        assert response.json()['succeededIds'] == [second.id]
        assert pdf_service.get_gcs_client().bucket('researchos-papers').get_blob(f'{second.id}.pdf') is None
        checks.append('Bulk paper deletion removes managed PDF')
        print(json.dumps({'checks_passed': checks}, indent=2))
    finally:
        for paper_id in ids:
            url = f'https://storage.googleapis.com/researchos-papers/{paper_id}.pdf'
            pdf_service.delete_pdf(paper_id, url)
            pdf_text_service.delete_cached_text(paper_id)
            get_client().table('papers').delete().eq('id', paper_id).execute()
        client.close()
        print('Temporary validation records and live GCS objects removed.')


if __name__ == '__main__':
    main()
