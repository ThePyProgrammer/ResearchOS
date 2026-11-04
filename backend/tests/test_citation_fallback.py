import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

from services import citation_fallback_service as fallback
from scripts import citation_worker as worker


def test_scheduler_skips_unmanaged_pdf_and_handles_capped_pages(mocker):
    read = mocker.patch.object(fallback.repository, 'fallback_candidates', side_effect=[
        [{'paper_id': 'a', 'pdf_url': 'external', 'fingerprint': '1'}],
        [{'paper_id': 'b', 'pdf_url': 'managed', 'fingerprint': '2'}], [],
    ])
    mocker.patch.object(fallback, 'managed_location', side_effect=lambda url: ('gcs', 'b.pdf') if url=='managed' else None)
    enqueue = mocker.patch.object(fallback.repository, 'enqueue_fallback', return_value=[{'id': 'pdf-job'}])
    assert fallback.schedule_pdf_fallbacks(['a', 'b']) == ['pdf-job']
    enqueue.assert_called_once_with('b', '2')
    assert [call.args[1] for call in read.call_args_list] == ['', 'a', 'b']


def test_scheduler_accepts_candidate_invalidated_by_concurrent_publication(mocker):
    mocker.patch.object(fallback.repository, 'fallback_candidates', side_effect=[
        [{'paper_id': 'a', 'pdf_url': 'managed', 'fingerprint': 'old'}], [],
    ])
    mocker.patch.object(fallback, 'managed_location', return_value=('gcs', 'a.pdf'))
    mocker.patch.object(fallback.repository, 'enqueue_fallback', return_value=[])
    assert fallback.schedule_pdf_fallbacks() == []


def test_batch_drain_includes_fallback_created_after_last_provider_and_on_resume(tmp_path, mocker):
    manifest = tmp_path / 'batch.json'
    manifest.write_text(json.dumps({'jobs': {'a': ['provider-job']}}))
    schedule = mocker.patch.object(worker, 'schedule_pdf_fallbacks')
    local_jobs = mocker.patch.object(worker, 'local_pdf_job_ids', side_effect=[[], ['pdf-job'], ['pdf-job']])
    process = mocker.patch.object(worker, 'run_one', new=AsyncMock(side_effect=[
        {'id': 'provider-job', 'status': 'succeeded'}, None,
        {'id': 'pdf-job', 'status': 'succeeded'}, None, None,
    ]))
    mocker.patch.object(worker.asyncio, 'sleep', new=AsyncMock())
    asyncio.run(worker.run(SimpleNamespace(batch=manifest, once=False, drain=True, interval=0)))
    assert [c.args[0] for c in process.call_args_list] == ['provider-job','provider-job','pdf-job','provider-job','pdf-job']
    assert all(c.args == (['a'],) for c in schedule.call_args_list)
    assert local_jobs.call_count == 3


def test_empty_batch_never_claims_global_jobs(tmp_path, mocker):
    manifest = tmp_path / 'empty.json'
    manifest.write_text(json.dumps({'jobs': {}}))
    schedule = mocker.patch.object(worker, 'schedule_pdf_fallbacks')
    mocker.patch.object(worker, 'local_pdf_job_ids', return_value=[])
    process = mocker.patch.object(worker, 'run_one', new=AsyncMock())
    asyncio.run(worker.run(SimpleNamespace(batch=manifest, once=False, drain=True, interval=0)))
    schedule.assert_called_once_with([])
    process.assert_not_called()
