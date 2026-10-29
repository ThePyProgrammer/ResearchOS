from types import SimpleNamespace

import pytest

from models.paper import Paper, PaperCreate
from services import paper_service, pdf_service


@pytest.fixture(autouse=True)
def storage_environment(monkeypatch):
    monkeypatch.setenv('SUPABASE_URL', 'https://source.supabase.co')
    monkeypatch.setenv('GCS_PDF_BUCKET', 'test-papers')
    monkeypatch.setenv('PAPER_STORAGE_PROVIDER', 'gcs')


@pytest.mark.parametrize('url,expected', [
    ('https://source.supabase.co/storage/v1/object/public/pdfs/p_1.pdf', ('supabase', 'p_1.pdf')),
    ('https://storage.googleapis.com/test-papers/p_1.pdf', ('gcs', 'p_1.pdf')),
    ('https://test-papers.storage.googleapis.com/p_1.pdf', ('gcs', 'p_1.pdf')),
    ('https://storage.googleapis.com/other-bucket/p_1.pdf', None),
    ('https://other.supabase.co/storage/v1/object/public/pdfs/p_1.pdf', None),
    ('https://storage.googleapis.com.evil.test/test-papers/p_1.pdf', None),
    ('https://arxiv.org/pdf/1234', None),
    (None, None),
])
def test_managed_location_checks_origin_and_bucket(url, expected):
    assert pdf_service.managed_location(url) == expected


@pytest.mark.parametrize('generation', [None, 123])
def test_upload_uses_generation_preconditions_without_delete(mocker, generation):
    bucket = mocker.Mock(name='bucket')
    bucket.name = 'test-papers'
    bucket.get_blob.return_value = None if generation is None else SimpleNamespace(generation=generation)
    mocker.patch.object(pdf_service, '_gcs_bucket', return_value=bucket)
    url = pdf_service.upload_pdf('p_1', b'%PDF-test')
    assert url == 'https://storage.googleapis.com/test-papers/p_1.pdf'
    assert bucket.blob.return_value.upload_from_string.call_args.kwargs['if_generation_match'] == (generation or 0)
    bucket.blob.return_value.delete.assert_not_called()


def test_delete_uses_record_location_even_after_write_provider_switch(mocker):
    db = mocker.patch.object(pdf_service, 'get_client').return_value
    pdf_service.delete_pdf('p_1', 'https://source.supabase.co/storage/v1/object/public/pdfs/p_1.pdf')
    db.storage.from_.return_value.remove.assert_called_once_with(['p_1.pdf'])


def test_failed_gcs_delete_does_not_clear_database_reference(client, mocker):
    paper = SimpleNamespace(pdf_url='https://storage.googleapis.com/test-papers/p_1.pdf')
    mocker.patch.object(paper_service, 'get_paper', return_value=paper)
    clear = mocker.patch.object(paper_service, 'set_pdf_url')
    mocker.patch.object(pdf_service, 'delete_pdf', side_effect=RuntimeError('storage unavailable'))
    assert client.delete('/api/papers/p_1/pdf').status_code == 500
    clear.assert_not_called()


def test_external_pdf_delete_does_not_touch_storage(mocker):
    db = mocker.patch.object(pdf_service, 'get_client')
    gcs = mocker.patch.object(pdf_service, '_gcs_bucket')
    pdf_service.delete_pdf('p_1', 'https://arxiv.org/pdf/1234')
    db.assert_not_called()
    gcs.assert_not_called()


def test_computed_storage_flag_is_in_api_but_not_database_insert(mocker):
    query = mocker.patch.object(paper_service, 'get_client').return_value.table.return_value
    paper = paper_service.create_paper(PaperCreate(title='Test', authors=[], year=2026, venue='',
                                                pdf_url='https://storage.googleapis.com/test-papers/p_1.pdf'))
    assert paper.model_dump(by_alias=True)['hasStoredPdf'] is True
    assert 'has_stored_pdf' not in query.insert.call_args.args[0]
    assert 'hasStoredPdf' not in query.insert.call_args.args[0]


def test_fetch_rejects_gcs_managed_pdf(client, mocker):
    mocker.patch.object(paper_service, 'get_paper', return_value=SimpleNamespace(
        pdf_url='https://storage.googleapis.com/test-papers/p_1.pdf'))
    response = client.post('/api/papers/p_1/pdf/fetch')
    assert response.status_code == 422
    assert response.json()['detail'] == 'PDF is already in storage'


def test_maintenance_pauses_mutations_and_allows_reads(client, mocker, tmp_path):
    marker = tmp_path / 'maintenance.flag'
    marker.touch()
    mocker.patch('app.STORAGE_MAINTENANCE_FILE', marker)
    mocker.patch.object(paper_service, 'list_papers', return_value=[])
    assert client.get('/api/papers').status_code == 200
    response = client.delete('/api/papers/p_1')
    assert response.status_code == 503
    assert response.headers['Retry-After'] == '60'
