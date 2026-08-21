/**
 * Monaco-based YAML editor with bidirectional sync.
 */

import Editor from '@monaco-editor/react';
import { Code2 } from 'lucide-react';

interface YamlEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function YamlEditor({ value, onChange }: YamlEditorProps) {
  return (
    <div className="yaml-editor">
      <div className="yaml-editor__header">
        <Code2 size={16} />
        <span>YAML Configuration</span>
      </div>
      <div className="yaml-editor__body">
        <Editor
          height="100%"
          language="yaml"
          theme="vs-dark"
          value={value}
          onChange={(v) => onChange(v || '')}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            tabSize: 2,
            renderWhitespace: 'selection',
            bracketPairColorization: { enabled: true },
            padding: { top: 12, bottom: 12 },
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            cursorSmoothCaretAnimation: 'on',
          }}
        />
      </div>
    </div>
  );
}
