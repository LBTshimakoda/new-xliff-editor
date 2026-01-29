import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useApp } from '../contexts/AppContext';
import WorkflowParameterEditor from './WorkflowParameterEditor';

const WorkflowExecutor: React.FC = () => {
  const {
    uploadedFiles,
    selectedFileId,
    setSelectedFileId,
    selectedWorkflowId,
    workflows,
    addExecution,
    updateExecution,
    currentExecutionId,
    setCurrentExecutionId,
    getExecutionById
  } = useApp();

  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const [showParameterEditor, setShowParameterEditor] = useState(false);
  const [modifiedStages, setModifiedStages] = useState<any[] | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [savedWorkflowInfo, setSavedWorkflowInfo] = useState<{id: string, name: string} | null>(null);

  const selectedWorkflow = workflows.find(w => w.workflow_id === selectedWorkflowId);
  const selectedFile = uploadedFiles.find(f => f.file_id === selectedFileId);
  const currentExecution = currentExecutionId ? getExecutionById(currentExecutionId) : null;

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  const executeWorkflow = async (customStages?: any[]) => {
    if (!selectedWorkflowId) {
      setError('Please select a workflow first');
      return;
    }

    if (!selectedFileId) {
      setError('Please select a file first');
      return;
    }

    setIsExecuting(true);
    setError(null);

    try {
      // Build config with modified stages if available
      const config: any = {};
      
      if (customStages && customStages.length > 0) {
        // Create a new workflow with modified stages
        const modifiedWorkflow = {
          name: selectedWorkflow?.name + ' (Modified)',
          description: selectedWorkflow?.description,
          stages: customStages
        };
        
        // Create new workflow in backend
        const workflowResponse = await axios.post(
          'http://localhost:8000/api/workflows',
          modifiedWorkflow
        );
        
        const newWorkflowId = workflowResponse.data.workflow_id;
        
        // Execute the new workflow
        const response = await axios.post(
          `http://localhost:8000/api/workflows/${newWorkflowId}/execute`,
          { file_id: selectedFileId }
        );
        
        const executionId = response.data.execution_id;

        addExecution({
          execution_id: executionId,
          workflow_id: newWorkflowId,
          status: response.data.status,
          stages: [],
          input_file_id: selectedFileId,
          input_filename: selectedFile?.filename
        });

        setCurrentExecutionId(executionId);
        startPolling(executionId);
      } else {
        // Execute workflow with original stages
        const response = await axios.post(
          `http://localhost:8000/api/workflows/${selectedWorkflowId}/execute`,
          { file_id: selectedFileId }
        );

        const executionId = response.data.execution_id;

        addExecution({
          execution_id: executionId,
          workflow_id: selectedWorkflowId,
          status: response.data.status,
          stages: [],
          input_file_id: selectedFileId,
          input_filename: selectedFile?.filename
        });

        setCurrentExecutionId(executionId);
        startPolling(executionId);
      }

    } catch (err: any) {
      setError(`Failed to execute workflow: ${err.response?.data?.detail || err.message}`);
      setIsExecuting(false);
    }
  };

  const openParameterEditor = () => {
    setShowParameterEditor(true);
  };

  const handleParametersSaved = (stages: any[]) => {
    setModifiedStages(stages);
    setShowParameterEditor(false);
    // Execute immediately with modified stages
    executeWorkflow(stages);
  };

  const handleParametersCancelled = () => {
    setShowParameterEditor(false);
  };

  const handleSaveAsNewWorkflow = async (name: string, description: string, stages: any[]) => {
    try {
      // Create new workflow with modified stages
      const newWorkflow = {
        name: name,
        description: description,
        stages: stages.map((stage, index) => ({
          name: stage.name,
          type: stage.type,
          config: stage.config,
          dependencies: stage.dependencies || [],
          position: stage.position || { x: 100, y: 100 + (index * 100) }
        }))
      };

      const response = await axios.post('http://localhost:8000/api/workflows', newWorkflow);
      
      // Close parameter editor
      setShowParameterEditor(false);
      
      // Show success modal
      setSavedWorkflowInfo({
        id: response.data.workflow_id,
        name: name
      });
      setShowSuccessModal(true);
      
    } catch (err: any) {
      alert(`❌ Failed to save workflow: ${err.response?.data?.detail || err.message}`);
    }
  };

  const copyWorkflowId = () => {
    if (savedWorkflowInfo) {
      navigator.clipboard.writeText(savedWorkflowInfo.id);
      // Visual feedback could be added here
    }
  };

  const closeSuccessModal = () => {
    setShowSuccessModal(false);
    setSavedWorkflowInfo(null);
  };

  const startPolling = (executionId: string) => {
    // Poll every 2 seconds
    const interval = setInterval(async () => {
      try {
        const response = await axios.get(`http://localhost:8000/api/executions/${executionId}`);
        const execution = response.data;

        // Update execution in context
        updateExecution(executionId, {
          status: execution.status,
          stages: execution.stages,
          current_stage: execution.current_stage
        });

        // Stop polling if completed or failed
        if (execution.status === 'completed' || execution.status === 'failed') {
          clearInterval(interval);
          setIsExecuting(false);
        }
      } catch (err) {
        console.error('Error polling execution status:', err);
      }
    }, 2000);

    setPollingInterval(interval);
  };

  const downloadResult = async () => {
    if (!currentExecutionId) return;

    try {
      const response = await axios.get(
        `http://localhost:8000/api/executions/${currentExecutionId}/download`,
        { responseType: 'blob' }
      );

      // Extract filename from Content-Disposition header
      const contentDisposition = response.headers['content-disposition'];
      let filename = 'translated_file.xlz';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?(.+)"?/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

    } catch (err: any) {
      setError(`Failed to download file: ${err.response?.data?.detail || err.message}`);
    }
  };

  const resetExecution = () => {
    setCurrentExecutionId(null);
    setIsExecuting(false);
    setError(null);
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
  };

  const getStageStatus = (status: string) => {
    switch (status) {
      case 'completed': return { icon: '✓', color: '#48bb78', text: 'Completed' };
      case 'running': return { icon: '⏳', color: '#4299e1', text: 'Running' };
      case 'failed': return { icon: '✗', color: '#f56565', text: 'Failed' };
      case 'pending': return { icon: '○', color: '#a0aec0', text: 'Pending' };
      default: return { icon: '○', color: '#a0aec0', text: status };
    }
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
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>Workflow Executor</h2>
        <p style={styles.subtitle}>
          Execute workflows and download translated files
        </p>
      </div>

      {/* Configuration Section */}
      {!currentExecution && (
        <div style={styles.configSection}>
          {/* File Selection */}
          <div style={styles.configCard}>
            <div style={styles.configLabel}>
              <span style={styles.configIcon}>📁</span>
              Select Input File
            </div>
            {uploadedFiles.length === 0 ? (
              <div style={styles.noItems}>
                No files uploaded. Go to File Manager to upload files.
              </div>
            ) : (
              <div style={styles.fileList}>
                {uploadedFiles.map((file) => (
                  <div
                    key={file.file_id}
                    style={{
                      ...styles.fileItem,
                      ...(selectedFileId === file.file_id ? styles.fileItemSelected : {})
                    }}
                    onClick={() => setSelectedFileId(file.file_id)}
                  >
                    <div style={styles.fileInfo}>
                      <div style={styles.fileName}>
                        {selectedFileId === file.file_id && (
                          <span style={styles.checkmark}>✓ </span>
                        )}
                        {file.filename}
                      </div>
                      <div style={styles.fileMeta}>
                        {file.size_formatted} • {file.content_type}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Workflow Selection */}
          <div style={styles.configCard}>
            <div style={styles.configLabel}>
              <span style={styles.configIcon}>⚙️</span>
              Selected Workflow
            </div>
            {!selectedWorkflow ? (
              <div style={styles.noItems}>
                No workflow selected. Select a workflow from the list above.
              </div>
            ) : (
              <div style={styles.workflowInfo}>
                <div style={styles.workflowName}>
                  {selectedWorkflow.name}
                </div>
                <div style={styles.workflowDescription}>
                  {selectedWorkflow.description}
                </div>
                <div style={styles.workflowStages}>
                  {selectedWorkflow.stages.length} stages: {
                    selectedWorkflow.stages.map(s => s.name).join(' → ')
                  }
                </div>
              </div>
            )}
          </div>

          {/* Execute Section */}
          <div style={styles.executeSection}>
            <div style={styles.executeButtons}>
              <button
                style={{
                  ...styles.configureButton,
                  ...((!selectedFileId || !selectedWorkflowId || isExecuting) ? styles.executeButtonDisabled : {})
                }}
                onClick={openParameterEditor}
                disabled={!selectedFileId || !selectedWorkflowId || isExecuting}
              >
                ⚙️ Configure Parameters
              </button>
              <button
                style={{
                  ...styles.executeButton,
                  ...((!selectedFileId || !selectedWorkflowId || isExecuting) ? styles.executeButtonDisabled : {})
                }}
                onClick={() => executeWorkflow()}
                disabled={!selectedFileId || !selectedWorkflowId || isExecuting}
              >
                {isExecuting ? '⏳ Executing...' : '▶ Execute with Defaults'}
              </button>
            </div>
            {error && (
              <div style={styles.errorMessage}>
                ❌ {error}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Execution Progress */}
      {currentExecution && (
        <div style={styles.executionSection}>
          {/* Execution Header */}
          <div style={styles.executionHeader}>
            <div style={styles.executionInfo}>
              <div style={styles.executionTitle}>
                Execution: {currentExecution.execution_id.substring(0, 8)}...
              </div>
              <div style={styles.executionMeta}>
                File: {currentExecution.input_filename} | 
                Workflow: {selectedWorkflow?.name}
              </div>
            </div>
            <div style={{
              ...styles.statusBadge,
              backgroundColor: getStageStatus(currentExecution.status).color
            }}>
              {getStageStatus(currentExecution.status).icon} {
                getStageStatus(currentExecution.status).text
              }
            </div>
          </div>

          {/* Stage Progress */}
          <div style={styles.stagesProgress}>
            <div style={styles.stagesTitle}>Stage Progress:</div>
            {currentExecution.stages && currentExecution.stages.length > 0 ? (
              currentExecution.stages.map((stage: any, index: number) => {
                const status = getStageStatus(stage.status);
                return (
                  <div key={index} style={styles.stageProgress}>
                    <div style={styles.stageProgressHeader}>
                      <span style={styles.stageProgressIcon}>
                        {getStageIcon(stage.name)}
                      </span>
                      <div style={styles.stageProgressInfo}>
                        <div style={styles.stageProgressName}>
                          {index + 1}. {stage.name}
                        </div>
                        {stage.result?.metrics && (
                          <div style={styles.stageProgressMetrics}>
                            {Object.entries(stage.result.metrics)
                              .filter(([key]) => !key.includes('_ms') && !key.includes('duration'))
                              .slice(0, 3)
                              .map(([key, value]) => (
                                <span key={key} style={styles.metric}>
                                  {key}: {String(value)}
                                </span>
                              ))
                            }
                          </div>
                        )}
                      </div>
                      <div style={{
                        ...styles.stageProgressStatus,
                        color: status.color
                      }}>
                        {status.icon} {status.text}
                      </div>
                    </div>
                    {stage.result?.errors && stage.result.errors.length > 0 && (
                      <div style={styles.stageErrors}>
                        {stage.result.errors.map((err: string, i: number) => (
                          <div key={i} style={styles.errorItem}>❌ {err}</div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div style={styles.stagesLoading}>
                ⏳ Initializing workflow...
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={styles.executionActions}>
            {currentExecution.status === 'completed' && (
              <button style={styles.downloadButton} onClick={downloadResult}>
                📥 Download Translated File
              </button>
            )}
            <button style={styles.resetButton} onClick={resetExecution}>
              🔄 New Execution
            </button>
          </div>
        </div>
      )}

      {/* Parameter Editor Modal */}
      {showParameterEditor && selectedWorkflow && (
        <WorkflowParameterEditor
          workflowName={selectedWorkflow.name}
          workflowDescription={selectedWorkflow.description}
          stages={selectedWorkflow.stages}
          onSave={handleParametersSaved}
          onSaveAsNew={handleSaveAsNewWorkflow}
          onCancel={handleParametersCancelled}
        />
      )}

      {/* Success Modal */}
      {showSuccessModal && savedWorkflowInfo && (
        <div style={styles.modalOverlay} onClick={closeSuccessModal}>
          <div style={styles.successModal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.successIcon}>✅</div>
            <h3 style={styles.successTitle}>Workflow Saved Successfully!</h3>
            <p style={styles.successMessage}>
              "{savedWorkflowInfo.name}" has been saved and can now be used in batch operations.
            </p>
            
            <div style={styles.workflowIdSection}>
              <label style={styles.workflowIdLabel}>Workflow ID:</label>
              <div style={styles.workflowIdBox}>
                <input
                  type="text"
                  value={savedWorkflowInfo.id}
                  readOnly
                  style={styles.workflowIdInput}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button style={styles.copyButton} onClick={copyWorkflowId}>
                  📋 Copy
                </button>
              </div>
            </div>

            <div style={styles.successInstructions}>
              <p style={styles.instructionTitle}>You can now:</p>
              <ul style={styles.instructionList}>
                <li>Use this workflow ID in the <strong>Batch tab</strong></li>
                <li>Click refresh button below to see it in the workflow list</li>
                <li>Find it in execution history</li>
              </ul>
            </div>

            <button style={styles.closeButton} onClick={closeSuccessModal}>
              Got it!
            </button>
          </div>
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
    overflow: 'auto',
  },
  header: {
    padding: '24px',
    backgroundColor: 'white',
    borderBottom: '1px solid #e2e8f0',
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
  configSection: {
    padding: '24px',
  },
  configCard: {
    backgroundColor: 'white',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '16px',
  },
  configLabel: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  configIcon: {
    fontSize: '20px',
  },
  noItems: {
    padding: '16px',
    backgroundColor: '#f7fafc',
    borderRadius: '6px',
    color: '#718096',
    fontSize: '14px',
    textAlign: 'center',
  },
  fileList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  fileItem: {
    padding: '12px',
    border: '2px solid #e2e8f0',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  fileItemSelected: {
    borderColor: '#4299e1',
    backgroundColor: '#ebf8ff',
  },
  fileInfo: {
    display: 'flex',
    flexDirection: 'column',
  },
  fileName: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#2d3748',
    marginBottom: '4px',
  },
  checkmark: {
    color: '#4299e1',
    fontWeight: '600',
  },
  fileMeta: {
    fontSize: '12px',
    color: '#718096',
  },
  workflowInfo: {
    padding: '16px',
    backgroundColor: '#ebf8ff',
    borderRadius: '6px',
  },
  workflowName: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#2c5282',
    marginBottom: '8px',
  },
  workflowDescription: {
    fontSize: '14px',
    color: '#2c5282',
    marginBottom: '8px',
  },
  workflowStages: {
    fontSize: '12px',
    color: '#4299e1',
    fontWeight: '500',
  },
  executeSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  executeButtons: {
    display: 'flex',
    gap: '12px',
  },
  configureButton: {
    flex: 1,
    padding: '16px 32px',
    backgroundColor: '#4299e1',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  executeButton: {
    flex: 1,
    padding: '16px 32px',
    backgroundColor: '#48bb78',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  executeButtonDisabled: {
    backgroundColor: '#cbd5e0',
    cursor: 'not-allowed',
  },
  errorMessage: {
    padding: '12px',
    backgroundColor: '#fed7d7',
    border: '1px solid #fc8181',
    borderRadius: '6px',
    color: '#742a2a',
    fontSize: '14px',
  },
  executionSection: {
    padding: '24px',
  },
  executionHeader: {
    backgroundColor: 'white',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  executionInfo: {
    flex: 1,
  },
  executionTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: '8px',
  },
  executionMeta: {
    fontSize: '14px',
    color: '#718096',
  },
  statusBadge: {
    padding: '8px 16px',
    borderRadius: '16px',
    color: 'white',
    fontSize: '14px',
    fontWeight: '600',
  },
  stagesProgress: {
    backgroundColor: 'white',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '16px',
  },
  stagesTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: '16px',
  },
  stagesLoading: {
    padding: '32px',
    textAlign: 'center',
    color: '#718096',
    fontSize: '14px',
  },
  stageProgress: {
    padding: '16px',
    backgroundColor: '#f7fafc',
    borderRadius: '6px',
    marginBottom: '12px',
  },
  stageProgressHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  stageProgressIcon: {
    fontSize: '24px',
  },
  stageProgressInfo: {
    flex: 1,
  },
  stageProgressName: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: '4px',
  },
  stageProgressMetrics: {
    fontSize: '12px',
    color: '#718096',
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
  },
  metric: {
    backgroundColor: '#e2e8f0',
    padding: '2px 8px',
    borderRadius: '4px',
  },
  stageProgressStatus: {
    fontSize: '14px',
    fontWeight: '600',
  },
  stageErrors: {
    marginTop: '12px',
    padding: '12px',
    backgroundColor: '#fed7d7',
    borderRadius: '4px',
  },
  errorItem: {
    fontSize: '12px',
    color: '#742a2a',
    marginBottom: '4px',
  },
  executionActions: {
    display: 'flex',
    gap: '12px',
  },
  downloadButton: {
    flex: 1,
    padding: '16px 32px',
    backgroundColor: '#48bb78',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  resetButton: {
    padding: '16px 32px',
    backgroundColor: '#e2e8f0',
    color: '#2d3748',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
  },
  successModal: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '32px',
    width: '90%',
    maxWidth: '550px',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
  },
  successIcon: {
    fontSize: '48px',
    textAlign: 'center',
    marginBottom: '16px',
  },
  successTitle: {
    fontSize: '24px',
    fontWeight: '600',
    color: '#2d3748',
    textAlign: 'center',
    marginBottom: '12px',
    marginTop: 0,
  },
  successMessage: {
    fontSize: '14px',
    color: '#718096',
    textAlign: 'center',
    marginBottom: '24px',
  },
  workflowIdSection: {
    marginBottom: '24px',
  },
  workflowIdLabel: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '500',
    color: '#2d3748',
    marginBottom: '8px',
  },
  workflowIdBox: {
    display: 'flex',
    gap: '8px',
  },
  workflowIdInput: {
    flex: 1,
    padding: '10px 12px',
    border: '1px solid #cbd5e0',
    borderRadius: '6px',
    fontSize: '13px',
    fontFamily: 'monospace',
    backgroundColor: '#f7fafc',
    color: '#2d3748',
  },
  copyButton: {
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
  successInstructions: {
    padding: '16px',
    backgroundColor: '#ebf8ff',
    borderRadius: '8px',
    marginBottom: '24px',
  },
  instructionTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#2c5282',
    marginTop: 0,
    marginBottom: '8px',
  },
  instructionList: {
    margin: 0,
    paddingLeft: '20px',
    fontSize: '14px',
    color: '#2c5282',
  },
  closeButton: {
    width: '100%',
    padding: '12px 24px',
    backgroundColor: '#48bb78',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
  },
};

export default WorkflowExecutor;