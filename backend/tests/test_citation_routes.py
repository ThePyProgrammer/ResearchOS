from services import citation_repository


def page():
    return {'items': [{'id': 'b', 'title': 'B', 'authors': ['Writer'], 'year': 2024,
                      'evidence': [{'provider': 'openalex', 'method': 'exact_identifier',
                                    'indexed_at': '2026-11-03T00:00:00Z', 'reference': {'target_work': 'W2'}}]}],
            'total': 1, 'limit': 20, 'offset': 0, 'direction': 'incoming', 'runs': [], 'jobs': [],
            'unresolved_count': 2, 'indexed_papers': 1, 'library_papers': 2}


def test_citation_response_and_direction(client, mocker):
    get = mocker.patch.object(citation_repository, 'get_page', return_value=page())
    response = client.get('/api/papers/a/citations?direction=incoming')
    assert response.status_code == 200
    assert response.json()['unresolvedCount'] == 2
    assert response.json()['items'][0]['evidence'][0]['indexedAt'] == '2026-11-03T00:00:00Z'
    get.assert_called_once_with('a', 'incoming', 20, 0)


def test_read_does_not_enqueue_and_missing_paper(client, mocker):
    enqueue = mocker.patch.object(citation_repository, 'enqueue')
    mocker.patch.object(citation_repository, 'get_page', return_value=None)
    assert client.get('/api/papers/missing/citations').json() == {'error': 'not_found', 'detail': 'Paper not found'}
    enqueue.assert_not_called()


def test_route_validation(client):
    assert client.get('/api/papers/a/citations?direction=similar').status_code == 422
    assert client.get('/api/papers/a/citations?limit=1000').status_code == 422
    assert client.get('/api/papers/a/citations?offset=-1').status_code == 422
    assert client.get('/api/citation-jobs/not-a-uuid').status_code == 422


def test_reindex_is_accepted_and_does_not_expose_payload(client, mocker):
    mocker.patch.object(citation_repository, 'enqueue', return_value=[{
        'id': 'job1', 'paper_id': 'a', 'provider': 'openalex', 'status': 'pending',
        'attempts': 0, 'updated_at': '2026-11-03T00:00:00Z', 'captured_record': {'private': 'value'},
        'lease_token': 'private',
    }])
    response = client.post('/api/papers/a/citations/reindex')
    assert response.status_code == 202
    assert response.json()[0]['paperId'] == 'a'
    assert 'capturedRecord' not in response.json()[0]
    assert 'leaseToken' not in response.json()[0]


def test_missing_migration_reports_setup_problem(client, mocker):
    from postgrest.exceptions import APIError
    mocker.patch.object(citation_repository, 'get_page', side_effect=APIError({
        'code': 'PGRST202', 'message': 'function not found', 'details': '', 'hint': '',
    }))
    response = client.get('/api/papers/a/citations')
    assert response.status_code == 503
    assert 'migration 033' in response.json()['detail']


def test_pdf_indexing_requires_service_and_never_queues_implicitly(client, mocker, monkeypatch):
    from types import SimpleNamespace
    monkeypatch.delenv('GROBID_URL', raising=False)
    mocker.patch('routers.citations.paper_service.get_paper', return_value=SimpleNamespace(pdf_url='stored'))
    queue = mocker.patch.object(citation_repository, 'enqueue_pdf')
    response = client.post('/api/papers/a/citations/pdf/reindex')
    assert response.status_code == 503
    assert 'GROBID' in response.json()['detail']
    queue.assert_not_called()


def test_pdf_indexing_checks_managed_storage_and_accepts_explicit_job(client, mocker, monkeypatch):
    from types import SimpleNamespace
    monkeypatch.setenv('GROBID_URL', 'http://localhost:8070')
    mocker.patch('routers.citations.paper_service.get_paper', return_value=SimpleNamespace(pdf_url='stored'))
    location = mocker.patch('routers.citations.managed_location', return_value=None)
    queue = mocker.patch.object(citation_repository, 'enqueue_pdf', return_value=[{
        'id':'pdf-job', 'paper_id':'a', 'provider':'grobid', 'status':'pending', 'attempts':0,
        'updated_at':'2026-11-03T00:00:00Z',
    }])
    assert client.post('/api/papers/a/citations/pdf/reindex').status_code == 422
    queue.assert_not_called()
    location.return_value = ('gcs','a.pdf')
    response = client.post('/api/papers/a/citations/pdf/reindex')
    assert response.status_code == 202
    assert response.json()[0]['provider'] == 'grobid'
    queue.assert_called_once_with('a', True)


def test_pdf_indexing_missing_migration_has_specific_guidance(client, mocker, monkeypatch):
    from types import SimpleNamespace
    from postgrest.exceptions import APIError
    monkeypatch.setenv('GROBID_URL', 'http://localhost:8070')
    mocker.patch('routers.citations.paper_service.get_paper', return_value=SimpleNamespace(pdf_url='stored'))
    mocker.patch('routers.citations.managed_location', return_value=('gcs','a.pdf'))
    mocker.patch.object(citation_repository, 'enqueue_pdf', side_effect=APIError({
        'code':'PGRST202', 'message':'missing', 'details':'', 'hint':'',
    }))
    response = client.post('/api/papers/a/citations/pdf/reindex')
    assert response.status_code == 503
    assert 'migration 034' in response.json()['detail']
