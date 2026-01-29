import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  MiniMap,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Handle,
  Position,
  NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';

// WebSocket connection
let ws: WebSocket | null = null;

// Custom Node Component for Workflow Stages
const WorkflowNode: React.FC<NodeProps> = ({ data }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return '#10b981';
      case 'running': return '#3b82f6';
      case 'failed': return '#ef4444';
      case 'pending': return '#9ca3af';
      default: return '#6b7280';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return '✓';
      case 'running': return '⟳';
      case 'failed': return '✗';
      case 'pending': return '○';
      default: return '•';
    }
  };

  return (
    <div 
      className="workflow-node"
      style={{
        background: 'white',
        border: `2px solid ${getStatusColor(data.status)}`,
        borderRadius: '8px',
        padding: '10px',
        minWidth: '150px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
      }}
    >
      <Handle type="target" position={Position.Top} />
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <span style={{ 
          color: getStatusColor(data.status),
          fontSize: '20px',
          fontWeight: 'bold' 
        }}>
          {getStatusIcon(data.status)}
        </span>
        <div>
          <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{data.label}</div>
          <div style={{ fontSize: '11px', color: '#6b7280' }}>{data.type}</div>
        </div>
      </div>

      {data.status === 'running' && (
        <div style={{ marginTop: '8px' }}>
          <div className="progress-bar" style={{
            height: '4px',
            background: '#e5e7eb',
            borderRadius: '2px',
            overflow: 'hidden'
          }}>
            <div className="progress-bar-fill" style={{
              width: '60%',
              height: '100%',
              background: '#3b82f6',
              animation: 'pulse 2s infinite'
            }} />
          </div>
        </div>
      )}

      {data.metrics && (
        <div style={{ marginTop: '8px', fontSize: '11px', color: '#6b7280' }}>
          {Object.entries(data.metrics).slice(0, 2).map(([key, value]) => (
            <div key={key}>
              {key}: {value}
            </div>
          ))}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

// Main Workflow Visualizer Component
const WorkflowVisualizer: React.FC = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [executions, setExecutions] = useState<any[]>([]);
  const [selectedExecution, setSelectedExecution] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [workflowDefinition, setWorkflowDefinition] = useState('');
  const [showDesigner, setShowDesigner] = useState(false);

  // Connect to WebSocket for real-time updates
  useEffect(() => {
    connectWebSocket();
    return () => {
      if (ws) ws.close();
    };
  }, []);

  const connectWebSocket = () => {
    ws = new WebSocket('ws://localhost:8000/ws');
    
    ws.onopen = () => {
      console.log('Connected to workflow engine');
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'execution_update') {
        handleExecutionUpdate(data.execution);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setIsConnected(false);
    };

    ws.onclose = () => {
      setIsConnected(false);
      // Reconnect after 3 seconds
      setTimeout(connectWebSocket, 3000);
    };
  };

  const handleExecutionUpdate = (execution: any) => {
    // Update execution list
    setExecutions(prev => {
      const index = prev.findIndex(e => e.id === execution.id);
      if (index >= 0) {
        const newExecutions = [...prev];
        newExecutions[index] = execution;
        return newExecutions;
      } else {
        return [...prev, execution];
      }
    });

    // Update visualization if this is the selected execution
    if (execution.id === selectedExecution) {
      updateVisualization(execution);
    }
  };

  const updateVisualization = (execution: any) => {
    // Create nodes from stages
    const newNodes: Node[] = execution.stages.map((stage: any, index: number) => ({
      id: stage.id,
      type: 'workflowNode',
      position: stage.position || { 
        x: 250 * (index % 3), 
        y: 150 * Math.floor(index / 3) 
      },
      data: {
        label: stage.name,
        type: stage.type,
        status: stage.status,
        metrics: stage.result?.metrics,
        output: stage.result?.output,
      },
    }));

    // Create edges from dependencies
    const newEdges: Edge[] = [];
    execution.stages.forEach((stage: any) => {
      stage.dependencies.forEach((dep: string) => {
        const sourceStage = execution.stages.find((s: any) => s.name === dep);
        if (sourceStage) {
          newEdges.push({
            id: `${sourceStage.id}-${stage.id}`,
            source: sourceStage.id,
            target: stage.id,
            animated: stage.status === 'running',
          });
        }
      });
    });

    setNodes(newNodes);
    setEdges(newEdges);
  };

  const createSampleWorkflow = async () => {
    const sampleWorkflow = {
      name: "Localization Pipeline",
      description: "Sample localization workflow",
      stages: [
        {
          name: "extract",
          type: "extract",
          config: {
            source_pattern: "**/*.json",
            output_format: "xliff"
          },
          dependencies: [],
          position: { x: 100, y: 100 }
        },
        {
          name: "translate",
          type: "translate",
          config: {
            provider: "demo_mt",
            target_languages: ["es", "fr", "de"]
          },
          dependencies: ["extract"],
          position: { x: 300, y: 100 }
        },
        {
          name: "quality_check",
          type: "quality_check",
          config: {
            checks: ["spelling", "grammar", "terminology"]
          },
          dependencies: ["translate"],
          position: { x: 500, y: 100 }
        }
      ],
      variables: {
        source_language: "en",
        target_languages: ["es", "fr", "de"]
      }
    };

    try {
      const response = await fetch('http://localhost:8000/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sampleWorkflow),
      });
      
      const result = await response.json();
      alert(`Workflow created: ${result.workflow_id}`);
      return result.workflow_id;
    } catch (error) {
      console.error('Failed to create workflow:', error);
    }
  };

  const executeWorkflow = async (workflowId?: string) => {
    const id = workflowId || prompt('Enter workflow ID:');
    if (!id) return;

    try {
      const response = await fetch(`http://localhost:8000/api/workflows/${id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_language: 'en',
          target_languages: ['es', 'fr', 'de']
        }),
      });
      
      const result = await response.json();
      setSelectedExecution(result.execution_id);
      alert(`Execution started: ${result.execution_id}`);
    } catch (error) {
      console.error('Failed to execute workflow:', error);
    }
  };

  const nodeTypes = {
    workflowNode: WorkflowNode,
  };

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#f3f4f6' }}>
      {/* Sidebar */}
      <div style={{ 
        width: '300px', 
        background: 'white', 
        borderRight: '1px solid #e5e7eb',
        padding: '20px',
        overflowY: 'auto'
      }}>
        <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '20px' }}>
          Workflow Engine
        </h2>
        
        {/* Connection Status */}
        <div style={{ 
          padding: '10px', 
          marginBottom: '20px',
          background: isConnected ? '#d1fae5' : '#fee2e2',
          borderRadius: '6px',
          fontSize: '14px'
        }}>
          {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
        </div>

        {/* Actions */}
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>
            Actions
          </h3>
          <button
            onClick={async () => {
              const id = await createSampleWorkflow();
              if (id) executeWorkflow(id);
            }}
            style={{
              width: '100%',
              padding: '10px',
              marginBottom: '10px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Create & Run Sample Workflow
          </button>
          
          <button
            onClick={() => executeWorkflow()}
            style={{
              width: '100%',
              padding: '10px',
              marginBottom: '10px',
              background: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Execute Existing Workflow
          </button>

          <button
            onClick={() => setShowDesigner(!showDesigner)}
            style={{
              width: '100%',
              padding: '10px',
              background: '#8b5cf6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            {showDesigner ? 'Hide' : 'Show'} Workflow Designer
          </button>
        </div>

        {/* Executions List */}
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>
            Recent Executions
          </h3>
          {executions.map(exec => (
            <div
              key={exec.id}
              onClick={() => {
                setSelectedExecution(exec.id);
                updateVisualization(exec);
              }}
              style={{
                padding: '10px',
                marginBottom: '5px',
                background: selectedExecution === exec.id ? '#e0e7ff' : '#f9fafb',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              <div style={{ fontWeight: 'bold' }}>{exec.id.substring(0, 8)}</div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                Status: {exec.status}
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                Current: {exec.current_stage || 'N/A'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ 
          padding: '20px',
          background: 'white',
          borderBottom: '1px solid #e5e7eb'
        }}>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>
            Workflow Visualization
          </h1>
          {selectedExecution && (
            <p style={{ fontSize: '14px', color: '#6b7280', marginTop: '5px' }}>
              Execution: {selectedExecution}
            </p>
          )}
        </div>

        {/* Workflow Designer (Optional) */}
        {showDesigner && (
          <div style={{
            padding: '20px',
            background: 'white',
            borderBottom: '1px solid #e5e7eb'
          }}>
            <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }}>
              Workflow Definition (YAML)
            </h3>
            <textarea
              value={workflowDefinition}
              onChange={(e) => setWorkflowDefinition(e.target.value)}
              style={{
                width: '100%',
                height: '200px',
                padding: '10px',
                fontFamily: 'monospace',
                fontSize: '12px',
                border: '1px solid #e5e7eb',
                borderRadius: '6px'
              }}
              placeholder={`name: My Workflow
stages:
  - name: extract
    type: extract
    config:
      source: "**/*.json"
  - name: translate
    type: translate
    dependencies: [extract]
    config:
      provider: demo_mt`}
            />
          </div>
        )}

        {/* Flow Diagram */}
        <div style={{ flex: 1, position: 'relative' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
          >
            <Controls />
            <MiniMap />
            <Background variant="dots" gap={12} size={1} />
          </ReactFlow>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        
        .react-flow__node-workflowNode {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        
        .react-flow__handle {
          width: 8px;
          height: 8px;
        }
      `}</style>
    </div>
  );
};

export default WorkflowVisualizer;
