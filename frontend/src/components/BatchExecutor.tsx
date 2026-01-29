import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useApp } from '../contexts/AppContext';

const BatchExecutor: React.FC = () => {
  const {
    uploadedFiles,
    selectedWorkflowId,
    workflows
  } = useApp();

  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batchStatus, setBatchStatus] = useState<any>(null);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const [customWorkflowId, setCustomWorkflowId] = useState<string>('');
  const [useCustomWorkflow, setUseCustomWorkflow] = useState(false);

  const selectedWorkflow = workflows.find(w => w.workflow_id === selectedWorkflowId);
  const workflowToUse = useCustomWorkflow && customWorkflowId.trim() 
    ? customWorkflowId.trim() 
    : selectedWorkflowId;

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  const toggleFileSelection = (fileId: string) => {
    if (selectedFileIds.includes(fileId)) {
      setSelectedFileIds(selectedFileIds.filter(id => id !== fileId));
    } else {
      setSelectedFileIds([...selectedFileIds, fileId]);
    }
  };

  const selectAll = () => {
    if (selectedFileIds.length === uploadedFiles.length) {
      setSelectedFileIds([]);
    } else {
      setSelectedFileIds(uploadedFiles.map(f => f.file_id));
    }
  };

  const executeBatch = async () => {
    if (!workflowToUse) {
      setError('Please select a workflow or enter a workflow ID');
      return;
    }

    if (selectedFileIds.length === 0) {
      setError('Please select at least one file');
      return;
    }

    setIsExecuting(true);
    setError(null);

    try {
      const response = await axios.post(
        `http://localhost:8000/api/workflows/${workflowToUse}/execute-batch`,
        { file_ids: selectedFileIds }
      );

      setBatchId(response.data.batch_id);
      startPolling(response.data.batch_id);
    } catch (err: any) {
      setError(`Failed to execute batch: ${err.response?.data?.detail || err.message}`);
      setIsExecuting(false);
    }
  };

  const startPolling = (batchId: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await axios.get(`http://localhost:8000/api/batches/${batchId}`);
        setBatchStatus(response.data);

        if (response.data.status !== 'running') {
          clearInterval(interval);
          setIsExecuting(false);
        }
      } catch (err) {
        console.error('Error polling batch status:', err);
      }
    }, 2000);

    setPollingInterval(interval);
  };

  const downloadBatchResults = async () => {
    if (!batchId) return;

    try {
      const response = await axios.get(
        `http://localhost:8000/api/batches/${batchId}/download`,
        { responseType: 'blob' }
      );

      const contentDisposition = response.headers['content-disposition'];
      let filename = 'batch_results.zip';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="([^"]+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(`Failed to download batch: ${err.response?.data?.detail || err.message}`);
    }
  };

  const resetBatch = () => {
    setBatchId(null);
    setBatchStatus(null);
    setSelectedFileIds([]);
    setIsExecuting(false);
    setError(null);
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#48bb78';
      case 'running': return '#4299e1';
      case 'failed': return '#f56565';
      case 'partial': return '#ed8936';
      default: return '#a0aec0';
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.title}>Batch Processing</h2>
        <p style={styles.subtitle}>
          Execute workflow on multiple files at once
        </p>
      </div>

      {!batchId && (
        <div style={styles.configSection}>
          {/* Workflow Selection */}
          <div style={styles.configCard}>
            <div style={styles.configLabel}>
              <span style={styles.configIcon}>⚙️</span>
              Workflow Selection
            </div>
            
            {/* Tab switcher */}
            <div style={styles.tabBar}>
              <button
                style={{
                  ...styles.tab,
                  ...(! useCustomWorkflow ? styles.tabActive : {})
                }}
                onClick={() => setUseCustomWorkflow(false)}
              >
                From Workflows Tab
              </button>
              <button
                style={{
                  ...styles.tab,
                  ...(useCustomWorkflow ? styles.tabActive : {})
                }}
                onClick={() => setUseCustomWorkflow(true)}
              >
                Custom Workflow ID
              </button>
            </div>

            {!useCustomWorkflow ? (
              // Standard workflow selection
              <>
                {!selectedWorkflow ? (
                  <div style={styles.noItems}>
                    No workflow selected. Go to Workflows tab to select one.
                  </div>
                ) : (
                  <div style={styles.workflowInfo}>
                    <div style={styles.workflowName}>
                      {selectedWorkflow.name}
                    </div>
                    <div style={styles.workflowDescription}>
                      {selectedWorkflow.description}
                    </div>
                  </div>
                )}
              </>
            ) : (
              // Custom workflow ID input
              <div style={styles.customWorkflowSection}>
                <label style={styles.inputLabel}>
                  Enter saved workflow ID:
                </label>
                <input
                  type="text"
                  value={customWorkflowId}
                  onChange={(e) => setCustomWorkflowId(e.target.value)}
                  placeholder="e.g., a1b2c3d4-5e6f-..."
                  style={styles.workflowIdInput}
                />
                <div style={styles.hint}>
                  💡 Use workflow ID from "Save As New Workflow" feature
                </div>
              </div>
            )}
          </div>

          {/* File Selection */}
          <div style={styles.configCard}>
            <div style={styles.configLabelRow}>
              <div style={styles.configLabel}>
                <span style={styles.configIcon}>📁</span>
                Select Files ({selectedFileIds.length} of {uploadedFiles.length} selected)
              </div>
              <button style={styles.selectAllButton} onClick={selectAll}>
                {selectedFileIds.length === uploadedFiles.length ? 'Deselect All' : 'Select All'}
              </button>
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
                      ...(selectedFileIds.includes(file.file_id) ? styles.fileItemSelected : {})
                    }}
                    onClick={() => toggleFileSelection(file.file_id)}
                  >
                    <input
                      type="checkbox"
                      checked={selectedFileIds.includes(file.file_id)}
                      onChange={() => toggleFileSelection(file.file_id)}
                      style={styles.checkbox}
                    />
                    <div style={styles.fileInfo}>
                      <div style={styles.fileName}>{file.filename}</div>
                      <div style={styles.fileMeta}>
                        {file.size_formatted} • {file.content_type}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Execute Button */}
          <div style={styles.executeSection}>
            <button
              style={{
                ...styles.executeButton,
                ...((!workflowToUse || selectedFileIds.length === 0 || isExecuting) ? styles.executeButtonDisabled : {})
              }}
              onClick={executeBatch}
              disabled={!workflowToUse || selectedFileIds.length === 0 || isExecuting}
            >
              {isExecuting ? '⏳ Executing Batch...' : `▶ Execute Batch (${selectedFileIds.length} files)`}
            </button>
            {error && (
              <div style={styles.errorMessage}>
                ❌ {error}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Batch Progress */}
      {batchId && batchStatus && (
        <div style={styles.batchSection}>
          <div style={styles.batchHeader}>
            <div style={styles.batchInfo}>
              <div style={styles.batchTitle}>
                Batch: {batchId.substring(0, 8)}...
              </div>
              <div style={styles.batchMeta}>
                Workflow: {selectedWorkflow?.name}
              </div>
            </div>
            <div
              style={{
                ...styles.statusBadge,
                backgroundColor: getStatusColor(batchStatus.status)
              }}
            >
              {batchStatus.status}
            </div>
          </div>

          <div style={styles.progressSection}>
            <div style={styles.progressStats}>
              <div style={styles.statItem}>
                <span style={styles.statValue}>{batchStatus.total_files}</span>
                <span style={styles.statLabel}>Total Files</span>
              </div>
              <div style={styles.statItem}>
                <span style={{...styles.statValue, color: '#48bb78'}}>
                  {batchStatus.completed_files}
                </span>
                <span style={styles.statLabel}>Completed</span>
              </div>
              <div style={styles.statItem}>
                <span style={{...styles.statValue, color: '#f56565'}}>
                  {batchStatus.failed_files}
                </span>
                <span style={styles.statLabel}>Failed</span>
              </div>
              <div style={styles.statItem}>
                <span style={styles.statValue}>
                  {batchStatus.total_files - batchStatus.completed_files - batchStatus.failed_files}
                </span>
                <span style={styles.statLabel}>Pending</span>
              </div>
            </div>

            <div style={styles.progressBar}>
              <div
                style={{
                  ...styles.progressFill,
                  width: `${(batchStatus.completed_files / batchStatus.total_files) * 100}%`
                }}
              />
            </div>
          </div>

          {batchStatus.executions && Object.keys(batchStatus.executions).length > 0 && (
            <div style={styles.executionsList}>
              <div style={styles.executionsTitle}>File Status:</div>
              {Object.entries(batchStatus.executions).map(([fileId, execData]: [string, any]) => {
                const file = uploadedFiles.find(f => f.file_id === fileId);
                return (
                  <div key={fileId} style={styles.executionItem}>
                    <span
                      style={{
                        ...styles.executionStatus,
                        backgroundColor: getStatusColor(execData.status)
                      }}
                    >
                      {execData.status === 'completed' ? '✓' : execData.status === 'failed' ? '✗' : '⏳'}
                    </span>
                    <span style={styles.executionFileName}>
                      {file?.filename || fileId}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <div style={styles.batchActions}>
            {batchStatus.status !== 'running' && batchStatus.completed_files > 0 && (
              <button style={styles.downloadButton} onClick={downloadBatchResults}>
                📥 Download All Results (ZIP)
              </button>
            )}
            <button style={styles.resetButton} onClick={resetBatch}>
              🔄 New Batch
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
  configLabelRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  configIcon: {
    fontSize: '20px',
  },
  selectAllButton: {
    padding: '8px 16px',
    backgroundColor: '#4299e1',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  noItems: {
    padding: '16px',
    backgroundColor: '#f7fafc',
    borderRadius: '6px',
    color: '#718096',
    fontSize: '14px',
    textAlign: 'center',
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
  },
  fileList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: '400px',
    overflow: 'auto',
  },
  fileItem: {
    padding: '12px',
    border: '2px solid #e2e8f0',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  fileItemSelected: {
    borderColor: '#4299e1',
    backgroundColor: '#ebf8ff',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#2d3748',
    marginBottom: '4px',
  },
  fileMeta: {
    fontSize: '12px',
    color: '#718096',
  },
  executeSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  executeButton: {
    padding: '16px 32px',
    backgroundColor: '#48bb78',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
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
  batchSection: {
    padding: '24px',
  },
  batchHeader: {
    backgroundColor: 'white',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  batchInfo: {
    flex: 1,
  },
  batchTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: '8px',
  },
  batchMeta: {
    fontSize: '14px',
    color: '#718096',
  },
  statusBadge: {
    padding: '8px 16px',
    borderRadius: '16px',
    color: 'white',
    fontSize: '14px',
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  progressSection: {
    backgroundColor: 'white',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '16px',
  },
  progressStats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '16px',
    marginBottom: '20px',
  },
  statItem: {
    textAlign: 'center',
  },
  statValue: {
    display: 'block',
    fontSize: '28px',
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: '4px',
  },
  statLabel: {
    display: 'block',
    fontSize: '12px',
    color: '#718096',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  progressBar: {
    height: '20px',
    backgroundColor: '#e2e8f0',
    borderRadius: '10px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#48bb78',
    transition: 'width 0.3s ease',
  },
  executionsList: {
    backgroundColor: 'white',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '20px',
    marginBottom: '16px',
    maxHeight: '400px',
    overflow: 'auto',
  },
  executionsTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: '12px',
  },
  executionItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '8px',
    marginBottom: '4px',
  },
  executionStatus: {
    width: '24px',
    height: '24px',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'white',
    fontSize: '12px',
    fontWeight: '600',
    flexShrink: 0,
  },
  executionFileName: {
    fontSize: '14px',
    color: '#2d3748',
  },
  batchActions: {
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
  tabBar: {
    display: 'flex',
    gap: '8px',
    marginBottom: '16px',
    borderBottom: '2px solid #e2e8f0',
  },
  tab: {
    padding: '10px 16px',
    backgroundColor: 'transparent',
    color: '#718096',
    border: 'none',
    borderBottom: '3px solid transparent',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  tabActive: {
    color: '#4299e1',
    borderBottom: '3px solid #4299e1',
  },
  customWorkflowSection: {
    padding: '16px',
    backgroundColor: '#f7fafc',
    borderRadius: '6px',
  },
  inputLabel: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '500',
    color: '#2d3748',
    marginBottom: '8px',
  },
  workflowIdInput: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #cbd5e0',
    borderRadius: '6px',
    fontSize: '14px',
    fontFamily: 'monospace',
    boxSizing: 'border-box',
  },
  hint: {
    marginTop: '8px',
    fontSize: '12px',
    color: '#718096',
  },
};

export default BatchExecutor;