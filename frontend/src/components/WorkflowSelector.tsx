import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useApp } from '../contexts/AppContext';

interface WorkflowSelectorProps {
  onWorkflowSelected?: (workflowId: string) => void;
}

const WorkflowSelector: React.FC<WorkflowSelectorProps> = ({ onWorkflowSelected }) => {
  const { 
    workflows, 
    addWorkflow, 
    loadWorkflows,
    selectedWorkflowId, 
    setSelectedWorkflowId 
  } = useApp();
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedWorkflowId, setExpandedWorkflowId] = useState<string | null>(null);

  // Load workflows on mount
  useEffect(() => {
    loadAllWorkflows();
  }, []);

  const loadAllWorkflows = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // First load predefined workflow
      await loadPredefinedWorkflows();
      
      // Then load workflows from backend
      await loadWorkflows();
      
    } catch (err) {
      setError('Failed to load workflows');
      console.error('Error loading workflows:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadPredefinedWorkflows = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Load the complete translation workflow
      const completeWorkflow = {
        name: "Complete XLZ Translation Pipeline",
        description: "Extract → Translate with Ollama → Validate → Export",
        stages: [
          {
            name: "extract",
            type: "custom",
            config: {
              plugin: "xliff_extract",
              handler: "extract",
              source_language: "en",
              target_languages: ["es"]
            },
            dependencies: [],
            position: { x: 100, y: 200 }
          },
          {
            name: "ollama_translate",
            type: "custom",
            config: {
              plugin: "xliff_ollama_mt",
              handler: "translate",
              model: "llama3",
              source_language: "English",
              target_language: "Spanish",
              temperature: 0.3,
              max_concurrent: 5,
              skip_pretranslated: false
            },
            dependencies: ["extract"],
            position: { x: 400, y: 200 }
          },
          {
            name: "validate",
            type: "custom",
            config: {
              plugin: "xliff_validate",
              handler: "validate",
              check_tags: true,
              check_placeholders: true
            },
            dependencies: ["ollama_translate"],
            position: { x: 700, y: 200 }
          },
          {
            name: "export",
            type: "custom",
            config: {
              plugin: "xliff_export",
              handler: "export",
              format: "xliff_1.2",
              include_metadata: true
            },
            dependencies: ["validate"],
            position: { x: 1000, y: 200 }
          }
        ]
      };

      // Create workflow in backend
      const response = await axios.post('http://localhost:8000/api/workflows', completeWorkflow);
      
      // Add to context
      addWorkflow({
        workflow_id: response.data.workflow_id,
        name: completeWorkflow.name,
        description: completeWorkflow.description,
        stages: completeWorkflow.stages
      });

    } catch (err: any) {
      console.error('Failed to load predefined workflow:', err);
      // Don't throw - continue loading other workflows
    }
  };

  const handleSelectWorkflow = (workflowId: string) => {
    setSelectedWorkflowId(workflowId);
    if (onWorkflowSelected) {
      onWorkflowSelected(workflowId);
    }
  };

  const toggleExpand = (workflowId: string) => {
    setExpandedWorkflowId(expandedWorkflowId === workflowId ? null : workflowId);
  };

  const getStageIcon = (stageName: string) => {
    if (stageName.includes('extract')) return '📥';
    if (stageName.includes('translate')) return '🌐';
    if (stageName.includes('validate')) return '✓';
    if (stageName.includes('export')) return '📤';
    return '⚙️';
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerContent}>
          <div>
            <h2 style={styles.title}>Available Workflows</h2>
            <p style={styles.subtitle}>
              Select a workflow to process your XLIFF/XLZ files
            </p>
          </div>
          <button 
            style={styles.refreshButton} 
            onClick={loadAllWorkflows}
            disabled={isLoading}
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {isLoading && (
        <div style={styles.loading}>
          <div style={styles.spinner}>⏳</div>
          <p>Loading workflows...</p>
        </div>
      )}

      {error && (
        <div style={styles.error}>
          ❌ {error}
        </div>
      )}

      {!isLoading && workflows.length === 0 && !error && (
        <div style={styles.empty}>
          <p style={styles.emptyIcon}>📋</p>
          <p style={styles.emptyText}>No workflows available</p>
          <button style={styles.retryButton} onClick={loadPredefinedWorkflows}>
            Load Workflows
          </button>
        </div>
      )}

      <div style={styles.workflowList}>
        {workflows.map((workflow) => (
          <div
            key={workflow.workflow_id}
            style={{
              ...styles.workflowCard,
              ...(selectedWorkflowId === workflow.workflow_id ? styles.workflowCardSelected : {})
            }}
          >
            {/* Workflow Header */}
            <div 
              style={styles.workflowHeader}
              onClick={() => handleSelectWorkflow(workflow.workflow_id)}
            >
              <div style={styles.workflowInfo}>
                <div style={styles.workflowName}>
                  {selectedWorkflowId === workflow.workflow_id && (
                    <span style={styles.selectedBadge}>✓</span>
                  )}
                  {workflow.name}
                </div>
                <div style={styles.workflowDescription}>
                  {workflow.description}
                </div>
                <div style={styles.workflowMeta}>
                  {workflow.stages.length} stages
                </div>
              </div>
              <button
                style={styles.expandButton}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpand(workflow.workflow_id);
                }}
              >
                {expandedWorkflowId === workflow.workflow_id ? '▼' : '▶'}
              </button>
            </div>

            {/* Expanded Stage Details */}
            {expandedWorkflowId === workflow.workflow_id && (
              <div style={styles.stagesContainer}>
                <div style={styles.stagesTitle}>Workflow Stages:</div>
                {workflow.stages.map((stage, index) => (
                  <div key={index} style={styles.stageItem}>
                    <span style={styles.stageIcon}>{getStageIcon(stage.name)}</span>
                    <div style={styles.stageInfo}>
                      <div style={styles.stageName}>
                        {index + 1}. {stage.name}
                      </div>
                      <div style={styles.stageConfig}>
                        Plugin: {stage.config.plugin || 'N/A'} • 
                        Handler: {stage.config.handler || 'N/A'}
                      </div>
                      {stage.config.model && (
                        <div style={styles.stageDetail}>
                          Model: {stage.config.model}
                        </div>
                      )}
                      {stage.config.source_language && stage.config.target_language && (
                        <div style={styles.stageDetail}>
                          {stage.config.source_language} → {stage.config.target_language}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {selectedWorkflowId && (
        <div style={styles.selectionInfo}>
          <span style={styles.selectionIcon}>✓</span>
          Selected: {workflows.find(w => w.workflow_id === selectedWorkflowId)?.name}
        </div>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#f7fafc',
  },
  header: {
    padding: '24px',
    backgroundColor: 'white',
    borderBottom: '1px solid #e2e8f0',
  },
  headerContent: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  refreshButton: {
    padding: '10px 20px',
    backgroundColor: '#4299e1',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  title: {
    fontSize: '24px',
    fontWeight: '600',
    color: '#2d3748',
    margin: '0 0 8px 0',
  },
  subtitle: {
    fontSize: '14px',
    color: '#718096',
    margin: 0,
  },
  loading: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#718096',
  },
  spinner: {
    fontSize: '48px',
    marginBottom: '16px',
  },
  error: {
    margin: '24px',
    padding: '16px',
    backgroundColor: '#fed7d7',
    border: '1px solid #fc8181',
    borderRadius: '8px',
    color: '#742a2a',
    fontSize: '14px',
  },
  empty: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#718096',
  },
  emptyIcon: {
    fontSize: '64px',
    margin: '0 0 16px 0',
  },
  emptyText: {
    fontSize: '16px',
    marginBottom: '16px',
  },
  retryButton: {
    padding: '10px 24px',
    backgroundColor: '#4299e1',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  workflowList: {
    flex: 1,
    overflow: 'auto',
    padding: '24px',
  },
  workflowCard: {
    backgroundColor: 'white',
    border: '2px solid #e2e8f0',
    borderRadius: '8px',
    marginBottom: '16px',
    transition: 'all 0.2s',
    cursor: 'pointer',
  },
  workflowCardSelected: {
    borderColor: '#4299e1',
    boxShadow: '0 0 0 3px rgba(66, 153, 225, 0.1)',
  },
  workflowHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: '20px',
  },
  workflowInfo: {
    flex: 1,
  },
  workflowName: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  selectedBadge: {
    fontSize: '14px',
    backgroundColor: '#4299e1',
    color: 'white',
    padding: '2px 8px',
    borderRadius: '12px',
    fontWeight: '600',
  },
  workflowDescription: {
    fontSize: '14px',
    color: '#718096',
    marginBottom: '8px',
  },
  workflowMeta: {
    fontSize: '12px',
    color: '#a0aec0',
    fontWeight: '500',
  },
  expandButton: {
    padding: '8px 12px',
    backgroundColor: 'transparent',
    border: '1px solid #e2e8f0',
    borderRadius: '4px',
    color: '#718096',
    cursor: 'pointer',
    fontSize: '12px',
  },
  stagesContainer: {
    padding: '0 20px 20px 20px',
    borderTop: '1px solid #e2e8f0',
  },
  stagesTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#2d3748',
    marginTop: '16px',
    marginBottom: '12px',
  },
  stageItem: {
    display: 'flex',
    alignItems: 'flex-start',
    padding: '12px',
    backgroundColor: '#f7fafc',
    borderRadius: '6px',
    marginBottom: '8px',
  },
  stageIcon: {
    fontSize: '20px',
    marginRight: '12px',
  },
  stageInfo: {
    flex: 1,
  },
  stageName: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#2d3748',
    marginBottom: '4px',
  },
  stageConfig: {
    fontSize: '12px',
    color: '#718096',
    marginBottom: '4px',
  },
  stageDetail: {
    fontSize: '12px',
    color: '#4299e1',
    fontWeight: '500',
  },
  selectionInfo: {
    padding: '16px 24px',
    backgroundColor: '#ebf8ff',
    borderTop: '2px solid #4299e1',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#2c5282',
  },
  selectionIcon: {
    fontSize: '18px',
  },
};

export default WorkflowSelector;