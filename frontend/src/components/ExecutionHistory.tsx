import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface ExecutionHistoryItem {
  id: string;
  workflow_id: string;
  workflow_name: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  input_file_id: string;
  input_filename: string;
  stages: Array<{
    name: string;
    status: string;
    result?: {
      metrics?: Record<string, any>;
      errors?: string[];
    };
  }>;
}

const ExecutionHistory: React.FC = () => {
  const [executions, setExecutions] = useState<ExecutionHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedExecution, setSelectedExecution] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const pageSize = 20;

  useEffect(() => {
    console.log('🔵 ExecutionHistory mounted, loading history...');
    loadHistory();
  }, [page]);

  const loadHistory = async () => {
    console.log('🔵 loadHistory called, page:', page);
    setIsLoading(true);
    setError(null);

    try {
      console.log('🔵 Making API call to /api/executions');
      const response = await axios.get('http://localhost:8000/api/executions', {
        params: {
          limit: pageSize,
          offset: page * pageSize
        }
      });

      console.log('✅ API response:', response.data);
      setExecutions(response.data.executions);
      setHasMore(response.data.executions.length === pageSize);
    } catch (err: any) {
      console.error('❌ API error:', err);
      setError(`Failed to load history: ${err.response?.data?.detail || err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const downloadExecution = async (executionId: string) => {
    try {
      const response = await axios.get(
        `http://localhost:8000/api/executions/${executionId}/download`,
        { responseType: 'blob' }
      );

      const contentDisposition = response.headers['content-disposition'];
      let filename = 'translated_file.xlz';
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
      alert(`Failed to download: ${err.response?.data?.detail || err.message}`);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#48bb78';
      case 'running': return '#4299e1';
      case 'failed': return '#f56565';
      default: return '#a0aec0';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return '✓';
      case 'running': return '⏳';
      case 'failed': return '✗';
      default: return '○';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const formatDuration = (startedAt: string, completedAt: string | null) => {
    if (!completedAt) return 'In progress...';
    const start = new Date(startedAt).getTime();
    const end = new Date(completedAt).getTime();
    const durationMs = end - start;
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  const toggleExpand = (executionId: string) => {
    setSelectedExecution(selectedExecution === executionId ? null : executionId);
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Execution History</h2>
          <p style={styles.subtitle}>
            View past workflow executions and download results
          </p>
        </div>
        <button style={styles.refreshButton} onClick={() => loadHistory()}>
          🔄 Refresh
        </button>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div style={styles.loading}>
          <div style={styles.spinner}>⏳</div>
          <p>Loading history...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div style={styles.error}>
          ❌ {error}
        </div>
      )}

      {/* History List */}
      {!isLoading && !error && (
        <div style={styles.content}>
          {executions.length === 0 ? (
            <div style={styles.empty}>
              <p style={styles.emptyIcon}>📋</p>
              <p style={styles.emptyText}>No execution history yet</p>
              <p style={styles.emptyHint}>
                Execute a workflow to see it appear here
              </p>
            </div>
          ) : (
            <div style={styles.historyList}>
              {executions.map((execution) => (
                <div
                  key={execution.id}
                  style={{
                    ...styles.historyCard,
                    ...(selectedExecution === execution.id ? styles.historyCardExpanded : {})
                  }}
                >
                  {/* Execution Header */}
                  <div
                    style={styles.historyHeader}
                    onClick={() => toggleExpand(execution.id)}
                  >
                    <div style={styles.historyInfo}>
                      <div style={styles.historyTitle}>
                        <span
                          style={{
                            ...styles.statusBadge,
                            backgroundColor: getStatusColor(execution.status)
                          }}
                        >
                          {getStatusIcon(execution.status)} {execution.status}
                        </span>
                        <span style={styles.workflowName}>
                          {execution.workflow_name}
                        </span>
                      </div>
                      <div style={styles.historyMeta}>
                        📁 {execution.input_filename} • 
                        🕒 {formatDate(execution.started_at)} • 
                        ⏱️ {formatDuration(execution.started_at, execution.completed_at)}
                      </div>
                      <div style={styles.historyId}>
                        ID: {execution.id.substring(0, 8)}...
                      </div>
                    </div>
                    <div style={styles.historyActions}>
                      {execution.status === 'completed' && (
                        <button
                          style={styles.downloadButton}
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadExecution(execution.id);
                          }}
                        >
                          📥
                        </button>
                      )}
                      <button style={styles.expandButton}>
                        {selectedExecution === execution.id ? '▼' : '▶'}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Stage Details */}
                  {selectedExecution === execution.id && (
                    <div style={styles.stagesSection}>
                      <div style={styles.stagesTitle}>Stage Results:</div>
                      {execution.stages.map((stage, index) => (
                        <div key={index} style={styles.stageItem}>
                          <div style={styles.stageHeader}>
                            <span
                              style={{
                                ...styles.stageStatus,
                                color: getStatusColor(stage.status)
                              }}
                            >
                              {getStatusIcon(stage.status)}
                            </span>
                            <span style={styles.stageName}>
                              {index + 1}. {stage.name}
                            </span>
                            <span style={styles.stageStatusText}>
                              {stage.status}
                            </span>
                          </div>
                          
                          {stage.result?.metrics && Object.keys(stage.result.metrics).length > 0 && (
                            <div style={styles.stageMetrics}>
                              {Object.entries(stage.result.metrics)
                                .filter(([key]) => !key.includes('_ms') && !key.includes('duration'))
                                .slice(0, 4)
                                .map(([key, value]) => (
                                  <span key={key} style={styles.metricItem}>
                                    {key}: {String(value)}
                                  </span>
                                ))}
                            </div>
                          )}

                          {stage.result?.errors && stage.result.errors.length > 0 && (
                            <div style={styles.stageErrors}>
                              {stage.result.errors.map((error, i) => (
                                <div key={i} style={styles.errorItem}>
                                  ❌ {error}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {executions.length > 0 && (
            <div style={styles.pagination}>
              <button
                style={{
                  ...styles.pageButton,
                  ...(page === 0 ? styles.pageButtonDisabled : {})
                }}
                onClick={() => setPage(page - 1)}
                disabled={page === 0}
              >
                ← Previous
              </button>
              <span style={styles.pageInfo}>
                Page {page + 1}
              </span>
              <button
                style={{
                  ...styles.pageButton,
                  ...(!hasMore ? styles.pageButtonDisabled : {})
                }}
                onClick={() => setPage(page + 1)}
                disabled={!hasMore}
              >
                Next →
              </button>
            </div>
          )}
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
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  refreshButton: {
    padding: '10px 20px',
    backgroundColor: '#4299e1',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
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
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '24px',
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: '#718096',
  },
  emptyIcon: {
    fontSize: '64px',
    margin: '0 0 16px 0',
  },
  emptyText: {
    fontSize: '18px',
    fontWeight: '500',
    marginBottom: '8px',
  },
  emptyHint: {
    fontSize: '14px',
    color: '#a0aec0',
  },
  historyList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  historyCard: {
    backgroundColor: 'white',
    border: '2px solid #e2e8f0',
    borderRadius: '8px',
    transition: 'all 0.2s',
  },
  historyCardExpanded: {
    borderColor: '#4299e1',
    boxShadow: '0 0 0 3px rgba(66, 153, 225, 0.1)',
  },
  historyHeader: {
    padding: '16px',
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
  },
  historyInfo: {
    flex: 1,
  },
  historyTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '8px',
  },
  statusBadge: {
    padding: '4px 10px',
    borderRadius: '12px',
    color: 'white',
    fontSize: '12px',
    fontWeight: '600',
  },
  workflowName: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#2d3748',
  },
  historyMeta: {
    fontSize: '13px',
    color: '#718096',
    marginBottom: '4px',
  },
  historyId: {
    fontSize: '11px',
    color: '#a0aec0',
    fontFamily: 'monospace',
  },
  historyActions: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  downloadButton: {
    padding: '8px 12px',
    backgroundColor: '#48bb78',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '16px',
    cursor: 'pointer',
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
  stagesSection: {
    padding: '16px',
    borderTop: '1px solid #e2e8f0',
    backgroundColor: '#f7fafc',
  },
  stagesTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: '12px',
  },
  stageItem: {
    padding: '12px',
    backgroundColor: 'white',
    borderRadius: '6px',
    marginBottom: '8px',
    border: '1px solid #e2e8f0',
  },
  stageHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
  },
  stageStatus: {
    fontSize: '16px',
    fontWeight: '600',
  },
  stageName: {
    flex: 1,
    fontSize: '14px',
    fontWeight: '500',
    color: '#2d3748',
  },
  stageStatusText: {
    fontSize: '12px',
    color: '#718096',
    textTransform: 'capitalize',
  },
  stageMetrics: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  metricItem: {
    fontSize: '12px',
    backgroundColor: '#ebf8ff',
    color: '#2c5282',
    padding: '4px 8px',
    borderRadius: '4px',
  },
  stageErrors: {
    marginTop: '8px',
    padding: '8px',
    backgroundColor: '#fed7d7',
    borderRadius: '4px',
  },
  errorItem: {
    fontSize: '12px',
    color: '#742a2a',
    marginBottom: '4px',
  },
  pagination: {
    marginTop: '24px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '16px',
  },
  pageButton: {
    padding: '8px 16px',
    backgroundColor: '#4299e1',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  pageButtonDisabled: {
    backgroundColor: '#cbd5e0',
    cursor: 'not-allowed',
  },
  pageInfo: {
    fontSize: '14px',
    color: '#718096',
    fontWeight: '500',
  },
};

export default ExecutionHistory;