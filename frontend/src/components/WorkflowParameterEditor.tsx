import React, { useState, useEffect } from 'react';

interface WorkflowStage {
  name: string;
  type: string;
  config: any;
  dependencies: string[];
  position?: any;
}

interface WorkflowParameterEditorProps {
  workflowName: string;
  workflowDescription?: string;
  stages: WorkflowStage[];
  onSave: (modifiedStages: WorkflowStage[]) => void;
  onSaveAsNew?: (name: string, description: string, modifiedStages: WorkflowStage[]) => void;
  onCancel: () => void;
}

const WorkflowParameterEditor: React.FC<WorkflowParameterEditorProps> = ({
  workflowName,
  workflowDescription = '',
  stages,
  onSave,
  onSaveAsNew,
  onCancel
}) => {
  const [modifiedStages, setModifiedStages] = useState<WorkflowStage[]>([]);
  const [expandedStage, setExpandedStage] = useState<string | null>(null);
  const [showSaveAsDialog, setShowSaveAsDialog] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [newWorkflowDescription, setNewWorkflowDescription] = useState('');

  useEffect(() => {
    // Deep clone stages to avoid mutating original
    setModifiedStages(JSON.parse(JSON.stringify(stages)));
    // Set default name for new workflow
    setNewWorkflowName(`${workflowName} (Custom)`);
    setNewWorkflowDescription(workflowDescription);
  }, [stages, workflowName, workflowDescription]);

  const updateStageConfig = (stageName: string, configKey: string, value: any) => {
    setModifiedStages(prev => 
      prev.map(stage => 
        stage.name === stageName
          ? { ...stage, config: { ...stage.config, [configKey]: value } }
          : stage
      )
    );
  };

  const toggleExpand = (stageName: string) => {
    setExpandedStage(expandedStage === stageName ? null : stageName);
  };

  const handleSave = () => {
    onSave(modifiedStages);
  };

  const handleSaveAsNew = () => {
    setShowSaveAsDialog(true);
  };

  const handleSaveAsNewConfirm = () => {
    if (onSaveAsNew && newWorkflowName.trim()) {
      onSaveAsNew(newWorkflowName.trim(), newWorkflowDescription.trim(), modifiedStages);
      setShowSaveAsDialog(false);
    }
  };

  const handleSaveAsNewCancel = () => {
    setShowSaveAsDialog(false);
    setNewWorkflowName(`${workflowName} (Custom)`);
    setNewWorkflowDescription(workflowDescription);
  };

  const getStageIcon = (stageName: string) => {
    if (stageName.includes('extract')) return '📥';
    if (stageName.includes('translate')) return '🌐';
    if (stageName.includes('validate')) return '✓';
    if (stageName.includes('export')) return '📤';
    return '⚙️';
  };

  const renderConfigField = (stage: WorkflowStage, key: string, value: any) => {
    const stageName = stage.name;

    // Special handling for different parameter types
    if (key === 'model' && stageName.includes('translate')) {
      return (
        <div style={styles.configField}>
          <label style={styles.configLabel}>Model:</label>
          <select
            style={styles.configSelect}
            value={value}
            onChange={(e) => updateStageConfig(stageName, key, e.target.value)}
          >
            <option value="llama3">llama3</option>
            <option value="llama3.1">llama3.1</option>
            <option value="llama3.2">llama3.2</option>
            <option value="mistral">mistral</option>
            <option value="mixtral">mixtral</option>
            <option value="codellama">codellama</option>
            <option value="gemma">gemma</option>
            <option value="qwen">qwen</option>
          </select>
        </div>
      );
    }

    if (key === 'source_language' || key === 'target_language') {
      const languages = [
        { code: 'English', name: 'English' },
        { code: 'Spanish', name: 'Spanish (Español)' },
        { code: 'French', name: 'French (Français)' },
        { code: 'German', name: 'German (Deutsch)' },
        { code: 'Italian', name: 'Italian (Italiano)' },
        { code: 'Portuguese', name: 'Portuguese (Português)' },
        { code: 'Russian', name: 'Russian (Русский)' },
        { code: 'Chinese', name: 'Chinese (中文)' },
        { code: 'Japanese', name: 'Japanese (日本語)' },
        { code: 'Korean', name: 'Korean (한국어)' },
        { code: 'Arabic', name: 'Arabic (العربية)' },
        { code: 'Dutch', name: 'Dutch (Nederlands)' },
        { code: 'Polish', name: 'Polish (Polski)' },
        { code: 'Turkish', name: 'Turkish (Türkçe)' },
        { code: 'Swedish', name: 'Swedish (Svenska)' },
        { code: 'Danish', name: 'Danish (Dansk)' },
        { code: 'Norwegian', name: 'Norwegian (Norsk)' },
        { code: 'Finnish', name: 'Finnish (Suomi)' },
        { code: 'Czech', name: 'Czech (Čeština)' },
        { code: 'Hungarian', name: 'Hungarian (Magyar)' },
      ];

      return (
        <div style={styles.configField}>
          <label style={styles.configLabel}>
            {key === 'source_language' ? 'Source Language:' : 'Target Language:'}
          </label>
          <select
            style={styles.configSelect}
            value={value}
            onChange={(e) => updateStageConfig(stageName, key, e.target.value)}
          >
            {languages.map(lang => (
              <option key={lang.code} value={lang.code}>{lang.name}</option>
            ))}
          </select>
        </div>
      );
    }

    if (key === 'temperature') {
      return (
        <div style={styles.configField}>
          <label style={styles.configLabel}>Temperature: {value}</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={value}
            style={styles.configSlider}
            onChange={(e) => updateStageConfig(stageName, key, parseFloat(e.target.value))}
          />
          <div style={styles.configHint}>
            Lower = more consistent, Higher = more creative
          </div>
        </div>
      );
    }

    if (key === 'max_concurrent') {
      return (
        <div style={styles.configField}>
          <label style={styles.configLabel}>Max Concurrent Translations:</label>
          <input
            type="number"
            min="1"
            max="20"
            value={value}
            style={styles.configInput}
            onChange={(e) => updateStageConfig(stageName, key, parseInt(e.target.value))}
          />
          <div style={styles.configHint}>
            Number of segments to translate simultaneously
          </div>
        </div>
      );
    }

    if (key === 'skip_pretranslated' || key === 'check_tags' || key === 'check_placeholders') {
      return (
        <div style={styles.configField}>
          <label style={styles.configCheckboxLabel}>
            <input
              type="checkbox"
              checked={value}
              style={styles.configCheckbox}
              onChange={(e) => updateStageConfig(stageName, key, e.target.checked)}
            />
            {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
          </label>
        </div>
      );
    }

    // Default: text input for strings, number input for numbers
    if (typeof value === 'string') {
      return (
        <div style={styles.configField}>
          <label style={styles.configLabel}>
            {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:
          </label>
          <input
            type="text"
            value={value}
            style={styles.configInput}
            onChange={(e) => updateStageConfig(stageName, key, e.target.value)}
          />
        </div>
      );
    }

    if (typeof value === 'number') {
      return (
        <div style={styles.configField}>
          <label style={styles.configLabel}>
            {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:
          </label>
          <input
            type="number"
            value={value}
            style={styles.configInput}
            onChange={(e) => updateStageConfig(stageName, key, parseFloat(e.target.value))}
          />
        </div>
      );
    }

    // Skip complex objects/arrays
    if (typeof value === 'object') {
      return null;
    }

    return null;
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>Configure Workflow Parameters</h2>
          <p style={styles.subtitle}>
            Modify stage configurations before execution
          </p>
        </div>

        {/* Stages List */}
        <div style={styles.content}>
          {modifiedStages.map((stage, index) => (
            <div key={index} style={styles.stageCard}>
              {/* Stage Header */}
              <div
                style={styles.stageHeader}
                onClick={() => toggleExpand(stage.name)}
              >
                <div style={styles.stageInfo}>
                  <span style={styles.stageIcon}>{getStageIcon(stage.name)}</span>
                  <div style={styles.stageName}>
                    {index + 1}. {stage.name}
                  </div>
                  <div style={styles.stageType}>
                    {stage.config.plugin || stage.type}
                  </div>
                </div>
                <button style={styles.expandButton}>
                  {expandedStage === stage.name ? '▼' : '▶'}
                </button>
              </div>

              {/* Expanded Config Fields */}
              {expandedStage === stage.name && (
                <div style={styles.configSection}>
                  <div style={styles.configTitle}>Editable Parameters:</div>
                  {Object.entries(stage.config)
                    .filter(([key]) => 
                      !['plugin', 'handler', 'position', 'dependencies'].includes(key)
                    )
                    .map(([key, value]) => (
                      <div key={key}>
                        {renderConfigField(stage, key, value)}
                      </div>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={styles.actions}>
          <button style={styles.cancelButton} onClick={onCancel}>
            Cancel
          </button>
          {onSaveAsNew && (
            <button style={styles.saveAsNewButton} onClick={handleSaveAsNew}>
              💾 Save As New Workflow
            </button>
          )}
          <button style={styles.saveButton} onClick={handleSave}>
            ✓ Apply & Execute
          </button>
        </div>
      </div>

      {/* Save As New Dialog */}
      {showSaveAsDialog && (
        <div style={styles.dialogOverlay} onClick={handleSaveAsNewCancel}>
          <div style={styles.dialogContent} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.dialogTitle}>Save As New Workflow</h3>
            
            <div style={styles.dialogField}>
              <label style={styles.dialogLabel}>Workflow Name *</label>
              <input
                type="text"
                value={newWorkflowName}
                onChange={(e) => setNewWorkflowName(e.target.value)}
                style={styles.dialogInput}
                placeholder="Enter workflow name"
                autoFocus
              />
            </div>

            <div style={styles.dialogField}>
              <label style={styles.dialogLabel}>Description (optional)</label>
              <textarea
                value={newWorkflowDescription}
                onChange={(e) => setNewWorkflowDescription(e.target.value)}
                style={styles.dialogTextarea}
                placeholder="Enter workflow description"
                rows={3}
              />
            </div>

            <div style={styles.dialogActions}>
              <button style={styles.dialogCancelButton} onClick={handleSaveAsNewCancel}>
                Cancel
              </button>
              <button 
                style={{
                  ...styles.dialogSaveButton,
                  ...(newWorkflowName.trim() === '' ? styles.dialogSaveButtonDisabled : {})
                }}
                onClick={handleSaveAsNewConfirm}
                disabled={newWorkflowName.trim() === ''}
              >
                💾 Save Workflow
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: '12px',
    width: '90%',
    maxWidth: '800px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
  },
  header: {
    padding: '24px',
    borderBottom: '2px solid #e2e8f0',
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
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '24px',
  },
  stageCard: {
    border: '2px solid #e2e8f0',
    borderRadius: '8px',
    marginBottom: '16px',
    backgroundColor: 'white',
  },
  stageHeader: {
    padding: '16px',
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  stageInfo: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  stageIcon: {
    fontSize: '24px',
  },
  stageName: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#2d3748',
  },
  stageType: {
    fontSize: '12px',
    color: '#718096',
    backgroundColor: '#f7fafc',
    padding: '4px 8px',
    borderRadius: '4px',
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
  configSection: {
    padding: '16px',
    borderTop: '1px solid #e2e8f0',
    backgroundColor: '#f7fafc',
  },
  configTitle: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: '16px',
  },
  configField: {
    marginBottom: '16px',
  },
  configLabel: {
    display: 'block',
    fontSize: '13px',
    fontWeight: '500',
    color: '#4a5568',
    marginBottom: '6px',
  },
  configInput: {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #cbd5e0',
    borderRadius: '6px',
    fontSize: '14px',
    color: '#2d3748',
  },
  configSelect: {
    width: '100%',
    padding: '8px 12px',
    border: '1px solid #cbd5e0',
    borderRadius: '6px',
    fontSize: '14px',
    color: '#2d3748',
    backgroundColor: 'white',
    cursor: 'pointer',
  },
  configSlider: {
    width: '100%',
    cursor: 'pointer',
  },
  configHint: {
    fontSize: '12px',
    color: '#a0aec0',
    marginTop: '4px',
  },
  configCheckboxLabel: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '14px',
    color: '#2d3748',
    cursor: 'pointer',
  },
  configCheckbox: {
    marginRight: '8px',
    cursor: 'pointer',
    width: '18px',
    height: '18px',
  },
  actions: {
    padding: '20px 24px',
    borderTop: '2px solid #e2e8f0',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
  },
  cancelButton: {
    padding: '12px 24px',
    backgroundColor: '#e2e8f0',
    color: '#2d3748',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  saveButton: {
    padding: '12px 24px',
    backgroundColor: '#48bb78',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  saveAsNewButton: {
    padding: '12px 24px',
    backgroundColor: '#4299e1',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  dialogOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1100,
  },
  dialogContent: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '24px',
    width: '90%',
    maxWidth: '500px',
    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4)',
  },
  dialogTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: '24px',
    marginTop: 0,
  },
  dialogField: {
    marginBottom: '20px',
  },
  dialogLabel: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '500',
    color: '#2d3748',
    marginBottom: '8px',
  },
  dialogInput: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #cbd5e0',
    borderRadius: '6px',
    fontSize: '14px',
    boxSizing: 'border-box',
  },
  dialogTextarea: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #cbd5e0',
    borderRadius: '6px',
    fontSize: '14px',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    resize: 'vertical',
  },
  dialogActions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    marginTop: '24px',
  },
  dialogCancelButton: {
    padding: '10px 20px',
    backgroundColor: '#e2e8f0',
    color: '#2d3748',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  dialogSaveButton: {
    padding: '10px 20px',
    backgroundColor: '#4299e1',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  dialogSaveButtonDisabled: {
    backgroundColor: '#cbd5e0',
    cursor: 'not-allowed',
  },
};

export default WorkflowParameterEditor;