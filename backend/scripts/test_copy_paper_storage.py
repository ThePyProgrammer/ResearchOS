import unittest
from unittest.mock import Mock, patch

from copy_paper_storage import copy_one, fingerprint, select_entries


class CopyTests(unittest.TestCase):
    def test_pilot_selects_small_median_large_and_excludes_orphans(self):
        report = {
            "objects": [{"key": f"p_{i}.pdf", "metadata": {"size": i + 10}}
                        for i in range(6)],
            "managed_references": [{"id": f"p_{i}", "source_key": f"p_{i}.pdf"}
                                   for i in range(5)],
        }
        self.assertEqual([entry["id"] for entry in select_entries(report, 3)],
                         ["p_0", "p_2", "p_4"])
        self.assertEqual(len(select_entries(report, 0)), 5)

    def test_fingerprint_ignores_last_access_time(self):
        original = {"id": "object1", "version": "v1", "metadata": {"size": 10}}
        self.assertEqual(fingerprint(original), fingerprint({**original, "last_accessed_at": "now"}))
        self.assertNotEqual(fingerprint(original), fingerprint({**original, "version": "v2"}))

    @patch("copy_paper_storage.lookup_source")
    def test_changed_source_stops_before_download_or_upload(self, listing):
        url = "https://example.supabase.co/storage/v1/object/public/pdfs/p_1.pdf"
        source = Mock()
        source.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
            {"id": "p_1", "pdf_url": url}
        ]
        entry = {"id": "p_1", "pdf_url": url, "source_key": "p_1.pdf",
                 "object": {"key": "p_1.pdf", "version": "v1"}}
        listing.return_value = {"key": "p_1.pdf", "version": "v2"}
        target, http = Mock(), Mock()
        with self.assertRaisesRegex(ValueError, "Source changed"):
            copy_one(entry, target, http, source, "pdfs", "https://example.supabase.co")
        http.stream.assert_not_called()
        target.get_blob.assert_not_called()

    @patch('copy_paper_storage.lookup_source')
    def test_resume_reuses_only_the_previously_hashed_generation(self, lookup):
        from types import SimpleNamespace
        url = 'https://example.supabase.co/storage/v1/object/public/pdfs/p_1.pdf'
        obj = {'id': 'object1', 'key': 'p_1.pdf', 'version': 'v1', 'metadata': {'size': 10}}
        lookup.return_value = obj
        entry = {'id': 'p_1', 'source_key': 'p_1.pdf', 'pdf_url': url, 'object': obj}
        source = Mock()
        source.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [{'pdf_url': url}]
        target, http = Mock(), Mock()
        target.name = 'test-bucket'
        target.get_blob.return_value = SimpleNamespace(generation=123, size=10,
                                                       metadata={'researchos-source-sha256': 'hash'})
        previous = {'status': 'copied_verified', 'original_url': url, 'destination_bucket': 'test-bucket',
                    'destination_key': 'p_1.pdf', 'source_fingerprint': list(fingerprint(obj)),
                    'destination_generation': 123, 'bytes': 10, 'sha256': 'hash'}
        result = copy_one(entry, target, http, source, 'pdfs', 'https://example.supabase.co', previous)
        self.assertEqual(result['verification'], 'previously-hashed-generation-unchanged')
        http.stream.assert_not_called()
        target.blob.assert_not_called()


if __name__ == "__main__":
    unittest.main()
