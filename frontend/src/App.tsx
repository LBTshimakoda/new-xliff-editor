import React, { useState } from 'react';
import XliffEditor from './XliffEditor';
import FileManager from './FileManager';
import WorkflowsPage from './components/WorkflowsPage';
import ExecutionHistory from './components/ExecutionHistory';
import BatchExecutor from './components/BatchExecutor';

type Tab = 'editor' | 'upload' | 'workflows' | 'history' | 'batch';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('editor');

  return (
    <div style={styles.app}>
      {/* Header */}
      <header style={styles.header}>
        <h1 style={styles.headerTitle}>Localization Workflow Platform</h1>
        <p style={styles.headerSubtitle}>
          XLIFF Editor • File Management • Workflow Automation
        </p>
      </header>

      {/* Tab Navigation */}
      <div style={styles.tabBar}>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'editor' ? styles.tabActive : {}),
          }}
          onClick={() => setActiveTab('editor')}
        >
          XLIFF Editor
        </button>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'upload' ? styles.tabActive : {}),
          }}
          onClick={() => setActiveTab('upload')}
        >
          File Manager
        </button>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'workflows' ? styles.tabActive : {}),
          }}
          onClick={() => setActiveTab('workflows')}
        >
          Workflows
        </button>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'history' ? styles.tabActive : {}),
          }}
          onClick={() => setActiveTab('history')}
        >
          History
        </button>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'batch' ? styles.tabActive : {}),
          }}
          onClick={() => setActiveTab('batch')}
        >
          Batch
        </button>
      </div>

      {/* Tab Content - Only render active tab */}
      <div style={styles.content}>
        {activeTab === 'editor' && <XliffEditor />}
        {activeTab === 'upload' && <FileManager />}
        {activeTab === 'workflows' && <WorkflowsPage />}
        {activeTab === 'history' && <ExecutionHistory />}
        {activeTab === 'batch' && <BatchExecutor />}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  app: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#f7fafc',
  },
  header: {
    backgroundColor: '#2d3748',
    color: 'white',
    padding: '16px 24px',
    textAlign: 'center',
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: '24px',
    fontWeight: '700',
    margin: '0 0 4px 0',
  },
  headerSubtitle: {
    fontSize: '13px',
    opacity: 0.85,
    margin: 0,
  },
  tabBar: {
    display: 'flex',
    backgroundColor: 'white',
    borderBottom: '2px solid #e2e8f0',
    padding: '0 20px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    flexShrink: 0,
  },
  tab: {
    padding: '12px 24px',
    border: 'none',
    backgroundColor: 'transparent',
    fontSize: '14px',
    fontWeight: '500',
    color: '#718096',
    cursor: 'pointer',
    borderBottom: '3px solid transparent',
    transition: 'all 0.2s',
    marginBottom: '-2px',
  },
  tabActive: {
    color: '#2d3748',
    borderBottomColor: '#4299e1',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  },
};

export default App;