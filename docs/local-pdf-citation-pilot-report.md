# Local PDF citation pilot — 2026-11-04

The user approved a local PyMuPDF fallback because no GROBID service is available. This pilot read five managed PDFs and same-library paper metadata, parsed PDFs locally, and saved reports under ignored `backend/data/citations`. It made no database changes and sent no PDF to an external extraction service.

Selection: MAGiC-SLAM (`p_0246e188`), the previously checked positive citation example, plus the first four other managed PDFs in the saved 30-paper provider sample. This is a small convenience sample, not a representative coverage estimate. Local reports ending `-2026-11-04-v2.json` supersede the initial exploratory reports.

| Paper ID | Result | Retained references | References with accepted explicit identifiers | Exact same-library matches |
| --- | --- | ---: | ---: | ---: |
| p_0246e188 | Successful extraction | 47 | 3 | 0 |
| p_00b3abe6 | Successful extraction | 46 | 6 | 0 |
| p_1fd97cce | Successful extraction | 26 | 19 | 0 |
| p_23ef2062 | Partial: bibliography not recognized | 0 | 0 | 0 |
| p_3c3dad3b | Partial: uncertain boundary before biographies | 84 | 0 | 0 |
| **Total** | **3 successful, 2 partial** | **203** | **28** | **0** |

The initial parser mistakenly included appendix text and author biographies in two final reference records. Boundary inspection exposed both problems. Font-size transitions now stop appendix headings, and unexplained large gaps stop extraction with a partial result. Column ordering, year lines mistaken for labels, page continuations, section boundaries and partial-result suppression have regression fixtures. The partial 84-record result retains text but emits no matching identifiers.

MAGiC-SLAM's reference 15 names SplaTAM but contains no explicit DOI/arXiv identifier. Its text and page number are retained, and the local parser correctly leaves it unresolved. The earlier provider pilot supplies the evidence for that pair. This local pilot does not establish new-edge precision or overall recall: there were no newly detected edges to verify, and bibliography review was focused on boundaries and the known positive rather than exhaustive transcription of every reference.

The implemented parser is deliberately limited to numbered bibliographies with recognized headings. Scanned PDFs, unnumbered entries, unusual layouts, clipped margins and line-wrapped identifiers can be missed. Success means the supported layout was recognized, not a guarantee of complete bibliography coverage. Matching uses local DOI/arXiv identities only, without provider alias enrichment or title matching.

Decision: retain local extraction as an **opt-in aid**, but do not automatically backfill every PDF. It adds inspectable bibliography records without requiring GROBID, while this sample demonstrated no additional exact local links. OpenAlex/Crossref remain the primary indexing path. A reviewed title-resolution workflow is a separate future step; GROBID and OCR remain deferred.
