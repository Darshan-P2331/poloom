/**
 * Poloom — Root application component.
 *
 * Layout:
 *  ┌───────────────────────────────────────────────────────────────┐
 *  │  Header (logo, pipeline name, Config/YAML/Vars/Run tabs)      │
 *  ├──────────┬───────────────────────┬────────────────────────────┤
 *  │          │                       │  Stage Config /            │
 *  │ Node     │   Flow Canvas         │  Monaco YAML /             │
 *  │ Palette  │                       │  Variables Manager /       │
 *  │          │                       │  Run & Telemetry           │
 *  └──────────┴───────────────────────┴────────────────────────────┘
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Code2,
  Settings2,
  Play,
  ArrowLeft,
  Workflow,
  Variable as VariableIcon,
} from 'lucide-react';

import { usePipelineSync } from './hooks/usePipelineSync';
import { NodePalette } from './components/NodePalette';
import { FlowCanvas } from './components/FlowCanvas';
import { StageConfigPanel } from './components/StageConfigPanel';
import { YamlEditor } from './components/YamlEditor';
import { VariablesPanel } from './components/VariablesPanel';
import { RunPanel } from './components/RunPanel';
import { PipelineList } from './components/PipelineList';
import type { PipelineConfig, StageType } from './types/pipeline';

type RightPanel = 'config' | 'yaml' | 'variables' | 'run';
type View = 'dashboard' | 'editor';

function App() {
  const sync = usePipelineSync();
  const [rightPanel, setRightPanel] = useState<RightPanel>('yaml');
  const [view, setView] = useState<View>('dashboard');

  // Auto-switch to config tab when a node is selected
  useEffect(() => {
    if (sync.selectedNode && rightPanel !== 'config') {
      setRightPanel('config');
    }
  }, [sync.selectedNode]);

  const handleAddStage = useCallback(
    (stageType: StageType, name: string) => {
      sync.addStage(stageType, name);
    },
    [sync],
  );

  const handleOpenPipeline = useCallback(
    (config: PipelineConfig, id: string) => {
      sync.loadFromConfig(config, id);
      setView('editor');
    },
    [sync],
  );

  const handleNewPipeline = useCallback(() => {
    sync.loadNewPipeline();
    setView('editor');
  }, [sync]);

  const handleBackToDashboard = useCallback(() => {
    setView('dashboard');
  }, []);

  const varCount = Object.keys(sync.metadata.variables || {}).length;

  // Dashboard view
  if (view === 'dashboard') {
    return (
      <div className="app">
        <header className="app-header">
          <div className="app-header__brand">
            <Workflow size={24} className="app-header__logo" />
            <span className="app-header__name">Poloom</span>
          </div>
        </header>
        <main className="app-dashboard">
          <PipelineList onOpen={handleOpenPipeline} onNew={handleNewPipeline} />
        </main>
      </div>
    );
  }

  // Visual studio editor view
  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__brand">
          <button
            className="app-header__back"
            onClick={handleBackToDashboard}
            title="Back to dashboard"
          >
            <ArrowLeft size={18} />
          </button>
          <Workflow size={24} className="app-header__logo" />
          <span className="app-header__name">Poloom</span>
          <span className="app-header__separator">·</span>
          <input
            className="app-header__pipeline-name"
            value={sync.metadata.name}
            onChange={(e) => sync.updateMetadata({ name: e.target.value })}
            placeholder="Pipeline Name"
          />
        </div>

        <div className="app-header__tabs">
          <button
            className={`app-header__tab ${rightPanel === 'config' ? 'app-header__tab--active' : ''}`}
            onClick={() => setRightPanel('config')}
          >
            <Settings2 size={14} />
            Config
          </button>
          <button
            className={`app-header__tab ${rightPanel === 'yaml' ? 'app-header__tab--active' : ''}`}
            onClick={() => setRightPanel('yaml')}
          >
            <Code2 size={14} />
            YAML
          </button>
          <button
            className={`app-header__tab ${rightPanel === 'variables' ? 'app-header__tab--active' : ''}`}
            onClick={() => setRightPanel('variables')}
          >
            <VariableIcon size={14} />
            Variables
            {varCount > 0 && <span className="tab-pill">{varCount}</span>}
          </button>
          <button
            className={`app-header__tab ${rightPanel === 'run' ? 'app-header__tab--active' : ''}`}
            onClick={() => setRightPanel('run')}
          >
            <Play size={14} />
            Run
          </button>
        </div>
      </header>

      <main className="app-main">
        {/* Left sidebar: Node Palette */}
        <NodePalette onAddStage={handleAddStage} />

        {/* Center: Flow Canvas */}
        <FlowCanvas sync={sync} />

        {/* Right panel */}
        <div className="right-panel">
          {rightPanel === 'config' && <StageConfigPanel sync={sync} />}
          {rightPanel === 'yaml' && (
            <YamlEditor value={sync.yamlText} onChange={sync.updateYaml} />
          )}
          {rightPanel === 'variables' && <VariablesPanel sync={sync} />}
          {rightPanel === 'run' && <RunPanel sync={sync} />}
        </div>
      </main>
    </div>
  );
}

export default App;
