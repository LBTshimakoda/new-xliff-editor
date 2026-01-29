import React from 'react';
import WorkflowSelector from './WorkflowSelector';
import WorkflowExecutor from './WorkflowExecutor';

const WorkflowsPage: React.FC = () => {
  return (
    <div style={styles.container}>
      {/* Left Panel: Workflow Selector */}
      <div style={styles.leftPanel}>
        <WorkflowSelector />
      </div>

      {/* Right Panel: Workflow Executor */}
      <div style={styles.rightPanel}>
        <WorkflowExecutor />
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    height: '100%',
    display: 'flex',
    gap: '0',
    backgroundColor: '#e2e8f0',
  },
  leftPanel: {
    width: '40%',
    height: '100%',
    overflow: 'hidden',
    borderRight: '2px solid #cbd5e0',
  },
  rightPanel: {
    width: '60%',
    height: '100%',
    overflow: 'hidden',
  },
};

export default WorkflowsPage;