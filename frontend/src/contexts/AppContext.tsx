import React, { createContext, useContext, useState, ReactNode } from 'react';
import axios from 'axios';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface UploadedFile {
  file_id: string;
  filename: string;
  size: number;
  size_formatted: string;
  content_type: string;
  uploaded_at: string;
}

export interface WorkflowDefinition {
  workflow_id: string;
  name: string;
  description: string;
  stages: any[];
}

export interface Execution {
  execution_id: string;
  workflow_id: string;
  status: string;
  stages: any[];
  current_stage?: string;
  input_file_id?: string;
  input_filename?: string;
}

// ============================================================================
// CONTEXT INTERFACE
// ============================================================================

interface AppContextType {
  // Files
  uploadedFiles: UploadedFile[];
  addUploadedFile: (file: UploadedFile) => void;
  removeUploadedFile: (fileId: string) => void;
  getFileById: (fileId: string) => UploadedFile | undefined;
  
  // Selected file for workflow
  selectedFileId: string | null;
  setSelectedFileId: (fileId: string | null) => void;
  
  // Workflows
  workflows: WorkflowDefinition[];
  loadWorkflows: () => Promise<void>;
  addWorkflow: (workflow: WorkflowDefinition) => void;
  selectedWorkflowId: string | null;
  setSelectedWorkflowId: (workflowId: string | null) => void;
  
  // Executions
  executions: Execution[];
  addExecution: (execution: Execution) => void;
  updateExecution: (executionId: string, updates: Partial<Execution>) => void;
  getExecutionById: (executionId: string) => Execution | undefined;
  currentExecutionId: string | null;
  setCurrentExecutionId: (executionId: string | null) => void;
}

// ============================================================================
// CREATE CONTEXT
// ============================================================================

const AppContext = createContext<AppContextType | undefined>(undefined);

// ============================================================================
// PROVIDER COMPONENT
// ============================================================================

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Files state
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  
  // Workflows state
  const [workflows, setWorkflows] = useState<WorkflowDefinition[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  
  // Executions state
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [currentExecutionId, setCurrentExecutionId] = useState<string | null>(null);
  
  // ============================================================================
  // FILE OPERATIONS
  // ============================================================================
  
  const addUploadedFile = (file: UploadedFile) => {
    setUploadedFiles(prev => {
      // Check if file already exists
      const exists = prev.find(f => f.file_id === file.file_id);
      if (exists) {
        console.log('File already in list:', file.filename);
        return prev;
      }
      console.log('Added file to context:', file.filename);
      return [file, ...prev];
    });
  };
  
  const removeUploadedFile = (fileId: string) => {
    setUploadedFiles(prev => prev.filter(f => f.file_id !== fileId));
    
    // Clear selection if removed file was selected
    if (selectedFileId === fileId) {
      setSelectedFileId(null);
    }
    
    console.log('Removed file:', fileId);
  };
  
  const getFileById = (fileId: string): UploadedFile | undefined => {
    return uploadedFiles.find(f => f.file_id === fileId);
  };
  
  // ============================================================================
  // WORKFLOW OPERATIONS
  // ============================================================================
  
  const addWorkflow = (workflow: WorkflowDefinition) => {
    setWorkflows(prev => {
      const exists = prev.find(w => w.workflow_id === workflow.workflow_id);
      if (exists) {
        return prev;
      }
      console.log('Added workflow to context:', workflow.name);
      return [workflow, ...prev];
    });
  };

  const loadWorkflows = async () => {
    try {
      const response = await axios.get('http://localhost:8000/api/workflows');
      const loadedWorkflows = response.data.workflows || [];
      setWorkflows(loadedWorkflows);
      console.log('Loaded workflows from API:', loadedWorkflows.length);
    } catch (error) {
      console.error('Failed to load workflows:', error);
    }
  };
  
  // ============================================================================
  // EXECUTION OPERATIONS
  // ============================================================================
  
  const addExecution = (execution: Execution) => {
    setExecutions(prev => {
      const exists = prev.find(e => e.execution_id === execution.execution_id);
      if (exists) {
        return prev;
      }
      console.log('Added execution to context:', execution.execution_id);
      return [execution, ...prev];
    });
  };
  
  const updateExecution = (executionId: string, updates: Partial<Execution>) => {
    setExecutions(prev =>
      prev.map(exec =>
        exec.execution_id === executionId
          ? { ...exec, ...updates }
          : exec
      )
    );
  };
  
  const getExecutionById = (executionId: string): Execution | undefined => {
    return executions.find(e => e.execution_id === executionId);
  };
  
  // ============================================================================
  // CONTEXT VALUE
  // ============================================================================
  
  const value: AppContextType = {
    // Files
    uploadedFiles,
    addUploadedFile,
    removeUploadedFile,
    getFileById,
    selectedFileId,
    setSelectedFileId,
    
    // Workflows
    workflows,
    addWorkflow,
    loadWorkflows,
    selectedWorkflowId,
    setSelectedWorkflowId,
    
    // Executions
    executions,
    addExecution,
    updateExecution,
    getExecutionById,
    currentExecutionId,
    setCurrentExecutionId,
  };
  
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

// ============================================================================
// CUSTOM HOOK
// ============================================================================

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
};

// ============================================================================
// EXPORT
// ============================================================================

export default AppContext;