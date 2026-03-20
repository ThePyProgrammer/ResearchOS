/**
 * LaTeXPreviewPanel — read-only panel that displays raw .tex source with syntax highlighting.
 *
 * Props:
 *   texContent {string} — the raw LaTeX string to display
 */

import { Light as SyntaxHighlighter } from 'react-syntax-highlighter'
import { github } from 'react-syntax-highlighter/dist/esm/styles/hljs'
import latex from 'react-syntax-highlighter/dist/esm/languages/hljs/latex'

SyntaxHighlighter.registerLanguage('latex', latex)

export default function LaTeXPreviewPanel({ texContent }) {
  if (!texContent || !texContent.trim()) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#94a3b8',
          fontSize: 12,
          fontStyle: 'italic',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        }}
      >
        LaTeX preview will appear here...
      </div>
    )
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', fontSize: 12, fontFamily: 'monospace' }}>
      <SyntaxHighlighter
        language="latex"
        style={github}
        showLineNumbers={false}
        customStyle={{
          margin: 0,
          padding: '12px 16px',
          background: '#f8fafc',
          fontSize: 12,
          lineHeight: '1.6',
          minHeight: '100%',
        }}
      >
        {texContent}
      </SyntaxHighlighter>
    </div>
  )
}
