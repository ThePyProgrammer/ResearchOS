from types import SimpleNamespace
import unittest

from switch_paper_urls import validate_plan


class CutoverTests(unittest.TestCase):
    def setUp(self):
        self.entry = {'paper_id': 'p_1', 'key': 'p_1.pdf', 'old_url': 'old', 'new_url': 'new',
                      'generation': 123, 'bytes': 10, 'sha256': 'hash',
                      'source_fingerprint': ['id', 'v1', None, 10, None]}
        self.source = {'key': 'p_1.pdf', 'id': 'id', 'version': 'v1', 'metadata': {'size': 10}}
        self.destination = SimpleNamespace(generation=123, size=10,
                                          metadata={'researchos-source-sha256': 'hash'})

    def validate(self, url='old', rollback=False):
        validate_plan([self.entry], [{'id': 'p_1', 'pdf_url': url}], [self.source],
                      {'p_1.pdf': self.destination}, rollback)

    def test_unchanged_and_already_applied_rows_can_resume(self):
        self.validate()
        self.validate('new')

    def test_user_url_edit_blocks_apply(self):
        with self.assertRaisesRegex(ValueError, 'Paper changed'):
            self.validate('edited')

    def test_replaced_destination_blocks_rollback(self):
        self.destination.generation = 124
        with self.assertRaisesRegex(ValueError, 'Destination changed'):
            self.validate('new', rollback=True)

    def test_missing_source_blocks_apply_and_rollback(self):
        self.source['version'] = 'v2'
        with self.assertRaisesRegex(ValueError, 'Source changed'):
            self.validate()


if __name__ == '__main__':
    unittest.main()
