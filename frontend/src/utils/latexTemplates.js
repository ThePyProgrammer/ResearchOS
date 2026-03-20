/**
 * LaTeX document templates for the export feature.
 *
 * Each template has:
 *   name             — display name
 *   documentclass    — the \documentclass line (without leading backslash)
 *   preamble         — full preamble block (from \documentclass through \geometry or end of packages)
 *   bibliographystyle — value for \bibliographystyle{}
 */

export const TEMPLATES = {
  article: {
    name: 'Article',
    documentclass: 'article',
    preamble: `\\documentclass[12pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{hyperref}
\\usepackage{geometry}
\\usepackage{ulem}
\\geometry{margin=1in}`,
    bibliographystyle: 'plain',
  },

  ieee: {
    name: 'IEEE Conference',
    documentclass: 'IEEEtran',
    preamble: `\\documentclass[conference]{IEEEtran}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{hyperref}
\\usepackage{ulem}`,
    bibliographystyle: 'IEEEtran',
  },

  neurips: {
    name: 'NeurIPS',
    documentclass: 'article',
    preamble: `\\documentclass{article}
\\usepackage[preprint]{neurips_2024}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{hyperref}
\\usepackage{ulem}`,
    bibliographystyle: 'plain',
  },
}
