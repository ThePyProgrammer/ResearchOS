from types import SimpleNamespace
import unittest

from cleanup_source_pdfs import eligible_sources


class CleanupTests(unittest.TestCase):
    def setUp(self):
        self.plan = [{'paper_id': 'p_1', 'key': 'p_1.pdf', 'old_url': 'source', 'new_url': 'dest',
                      'generation': 123, 'bytes': 10, 'sha256': 'hash',
                      'source_fingerprint': ['id', 'v1', None, 10, None]}]
        self.papers = [{'id': 'p_1', 'pdf_url': 'dest'}]
        self.sources = {'p_1.pdf': {'id': 'id', 'version': 'v1', 'metadata': {'size': 10}},
                        'orphan.pdf': {'id': 'unrelated', 'metadata': {'size': 20}}}
        self.destinations = {'p_1.pdf': SimpleNamespace(generation=123, size=10,
                                metadata={'researchos-source-sha256': 'hash'})}

    def result(self):
        return eligible_sources(self.plan, self.papers, self.sources, self.destinations)

    def test_only_verified_manifest_objects_are_eligible(self):
        self.assertEqual(self.result(), (['p_1.pdf'], []))

    def test_source_still_referenced_by_any_paper_is_retained(self):
        self.papers.append({'id': 'p_2', 'pdf_url': 'source'})
        self.assertEqual(self.result(), ([], ['p_1.pdf']))

    def test_changed_destination_is_retained_for_review(self):
        self.destinations['p_1.pdf'].generation = 124
        self.assertEqual(self.result(), ([], ['p_1.pdf']))

    def test_changed_source_is_retained_for_review(self):
        self.sources['p_1.pdf']['version'] = 'v2'
        self.assertEqual(self.result(), ([], ['p_1.pdf']))


if __name__ == '__main__':
    unittest.main()
