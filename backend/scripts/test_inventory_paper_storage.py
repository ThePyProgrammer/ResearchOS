import unittest
from unittest.mock import Mock

from inventory_paper_storage import build_report, list_objects, list_papers, source_key


class InventoryTests(unittest.TestCase):
    def test_classification_requires_exact_project_and_bucket(self):
        base = "https://example.supabase.co"
        url = base + "/storage/v1/object/public/pdfs/folder/p%20one.pdf"
        self.assertEqual(source_key(url, base, "pdfs"), "folder/p one.pdf")
        self.assertIsNone(source_key(url.replace("example.", "other."), base, "pdfs"))
        self.assertIsNone(source_key(url.replace("/pdfs/", "/other/"), base, "pdfs"))

    def test_pagination_continues_after_short_database_page(self):
        client = Mock()
        query = client.table.return_value.select.return_value.order.return_value
        query.range.return_value.execute.side_effect = [
            Mock(data=[{"id": "p_1"}]), Mock(data=[{"id": "p_2"}]), Mock(data=[])
        ]
        self.assertEqual(len(list_papers(client)), 2)
        self.assertEqual(query.range.call_args_list[1].args, (1, 500))

    def test_storage_pagination_and_nested_prefix(self):
        client = Mock()
        listing = client.storage.from_.return_value.list
        listing.side_effect = [
            [{"name": "folder", "id": None, "metadata": None}], [],
            [{"name": "p_1.pdf", "id": "object-1", "metadata": {"size": 12}}], [],
        ]
        self.assertEqual(list_objects(client, "pdfs")[0]["key"], "folder/p_1.pdf")
        self.assertEqual(listing.call_args_list[1].args[1]["offset"], 1)

    def test_report_distinguishes_missing_shared_and_unreferenced_objects(self):
        base = "https://example.supabase.co"
        prefix = base + "/storage/v1/object/public/pdfs/"
        papers = [
            {"id": "p_1", "pdf_url": prefix + "shared.pdf"},
            {"id": "p_2", "pdf_url": prefix + "shared.pdf"},
            {"id": "p_3", "pdf_url": prefix + "missing.pdf"},
            {"id": "p_4", "pdf_url": "https://arxiv.org/pdf/1234"},
        ]
        objects = [{"key": key, "metadata": {"size": 10}}
                   for key in ("shared.pdf", "orphan.pdf")]
        report = build_report(papers, objects, base, "pdfs")
        self.assertEqual(report["shared_source_keys"], {"shared.pdf": 2})
        self.assertEqual(report["missing_sources"][0]["id"], "p_3")
        self.assertEqual(report["unreferenced_objects"][0]["key"], "orphan.pdf")
        self.assertEqual(report["summary"]["pdf_bytes_from_metadata"], 20)


if __name__ == "__main__":
    unittest.main()
