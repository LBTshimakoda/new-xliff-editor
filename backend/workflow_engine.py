"""
Workflow Engine Core
Visual workflow orchestration with plugin support
"""
import asyncio
import json
import uuid
import io
from datetime import datetime
from enum import Enum
from typing import Dict, List, Any, Optional, Callable
from dataclasses import dataclass, field, asdict
import redis.asyncio as redis
from fastapi import FastAPI, WebSocket, HTTPException, UploadFile, File
from fastapi.responses import Response
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import yaml
from pathlib import Path
import requests

# Enums and Data Models
class StageStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"
    PAUSED = "paused"

class StageType(Enum):
    EXTRACT = "extract"
    TRANSLATE = "translate"
    REVIEW = "review"
    QUALITY_CHECK = "quality_check"
    DEPLOY = "deploy"
    CUSTOM = "custom"

@dataclass
class StageResult:
    status: StageStatus
    output: Dict[str, Any] = field(default_factory=dict)
    errors: List[str] = field(default_factory=list)
    metrics: Dict[str, float] = field(default_factory=dict)
    started_at: datetime = field(default_factory=datetime.now)
    completed_at: Optional[datetime] = None

@dataclass
class WorkflowStage:
    id: str
    name: str
    type: StageType
    config: Dict[str, Any]
    dependencies: List[str] = field(default_factory=list)
    status: StageStatus = StageStatus.PENDING
    result: Optional[StageResult] = None
    position: Dict[str, float] = field(default_factory=dict)  # For visualization

@dataclass
class WorkflowDefinition:
    id: str
    name: str
    description: str
    stages: List[WorkflowStage]
    variables: Dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.now)

@dataclass
class WorkflowExecution:
    id: str
    workflow_id: str
    status: StageStatus
    context: Dict[str, Any]
    stages: List[WorkflowStage]
    started_at: datetime
    completed_at: Optional[datetime] = None
    current_stage: Optional[str] = None
    input_file_id: Optional[str] = None  # File uploaded for processing
    output_file_id: Optional[str] = None  # File produced by workflow

@dataclass
class BatchExecution:
    """Batch execution of workflow on multiple files"""
    id: str
    workflow_id: str
    file_ids: List[str]
    status: str  # 'running', 'completed', 'failed', 'partial'
    executions: Dict[str, str]  # file_id -> execution_id mapping
    started_at: datetime
    completed_at: Optional[datetime] = None
    total_files: int = 0
    completed_files: int = 0
    failed_files: int = 0

# Plugin System
class WorkflowPlugin:
    """Base class for workflow plugins"""
    
    def __init__(self, name: str, version: str = "1.0.0"):
        self.name = name
        self.version = version
        self.handlers = {}
    
    def register_handler(self, stage_type: str, handler: Callable):
        """Register a handler for a specific stage type"""
        self.handlers[stage_type] = handler
    
    async def execute(self, stage_type: str, config: Dict, context: Dict) -> StageResult:
        """Execute the plugin handler for a stage"""
        if stage_type not in self.handlers:
            raise ValueError(f"No handler registered for stage type: {stage_type}")
        
        handler = self.handlers[stage_type]
        return await handler(config, context)

class PluginRegistry:
    """Registry for managing workflow plugins"""
    
    def __init__(self):
        self.plugins: Dict[str, WorkflowPlugin] = {}
        self._load_builtin_plugins()
    
    def register(self, plugin: WorkflowPlugin):
        """Register a new plugin"""
        self.plugins[plugin.name] = plugin
        print(f"✅ Registered plugin: {plugin.name} v{plugin.version}")
    
    def get_handler(self, plugin_name: str, stage_type: str):
        """Get a handler from a plugin"""
        if plugin_name not in self.plugins:
            raise ValueError(f"Plugin not found: {plugin_name}")
        return self.plugins[plugin_name].handlers.get(stage_type)
    
    def _load_builtin_plugins(self):
        """Load built-in plugins"""
        # Extract Plugin
        extract_plugin = WorkflowPlugin("builtin.extract")
        extract_plugin.register_handler("extract", self._extract_handler)
        self.register(extract_plugin)
        
        # Translation Plugin  
        translate_plugin = WorkflowPlugin("builtin.translate")
        translate_plugin.register_handler("translate", self._translate_handler)
        self.register(translate_plugin)
        
        # Quality Check Plugin
        quality_plugin = WorkflowPlugin("builtin.quality_check")
        quality_plugin.register_handler("quality_check", self._quality_handler)
        self.register(quality_plugin)
    
    async def _extract_handler(self, config: Dict, context: Dict) -> StageResult:
        """Built-in extraction handler"""
        await asyncio.sleep(1)  # Simulate work
        return StageResult(
            status=StageStatus.COMPLETED,
            output={
                "extracted_units": 150,
                "files_processed": 5,
                "languages": context.get("target_languages", ["es", "fr", "de"])
            },
            metrics={
                "duration_ms": 1000,
                "units_per_second": 150
            }
        )
    
    async def _translate_handler(self, config: Dict, context: Dict) -> StageResult:
        """Built-in translation handler"""
        await asyncio.sleep(2)  # Simulate work
        provider = config.get("provider", "demo_mt")
        return StageResult(
            status=StageStatus.COMPLETED,
            output={
                "translated_units": 150,
                "provider": provider,
                "confidence_avg": 0.92
            },
            metrics={
                "duration_ms": 2000,
                "cost_estimate": 1.50
            }
        )
    
    async def _quality_handler(self, config: Dict, context: Dict) -> StageResult:
        """Built-in quality check handler"""
        await asyncio.sleep(1)  # Simulate work
        return StageResult(
            status=StageStatus.COMPLETED,
            output={
                "quality_score": 0.95,
                "issues_found": 3,
                "critical_issues": 0
            },
            metrics={
                "checks_performed": 5,
                "duration_ms": 1000
            }
        )

# JSON serializer for datetime and enum objects
def json_serializer(obj):
    """Custom JSON serializer for datetime and enum objects"""
    if isinstance(obj, (StageStatus, StageType)):
        return obj.value
    if isinstance(obj, datetime):
        return obj.isoformat()
    return str(obj)

# Workflow Engine
class WorkflowEngine:
    """Main workflow execution engine"""
    
    def __init__(self, plugin_registry: PluginRegistry):
        self.plugin_registry = plugin_registry
        self.executions: Dict[str, WorkflowExecution] = {}
        self.batch_executions: Dict[str, BatchExecution] = {}
        self.redis_client = None
        self.websocket_connections: List[WebSocket] = []
    
    async def initialize(self):
        """Initialize connections"""
        self.redis_client = await redis.from_url("redis://localhost:6379")
    
    async def create_workflow(self, definition: Dict) -> WorkflowDefinition:
        """Create a new workflow from definition"""
        workflow_id = str(uuid.uuid4())
        
        # Parse stages
        stages = []
        for stage_config in definition.get("stages", []):
            stage = WorkflowStage(
                id=str(uuid.uuid4()),
                name=stage_config["name"],
                type=StageType(stage_config["type"]),
                config=stage_config.get("config", {}),
                dependencies=stage_config.get("dependencies", []),
                position=stage_config.get("position", {"x": 0, "y": 0})
            )
            stages.append(stage)
        
        workflow = WorkflowDefinition(
            id=workflow_id,
            name=definition["name"],
            description=definition.get("description", ""),
            stages=stages,
            variables=definition.get("variables", {})
        )
        
        # Store in Redis
        await self.redis_client.set(
            f"workflow:{workflow_id}",
            json.dumps(asdict(workflow), default=json_serializer)
        )
        
        return workflow
    
    async def execute_workflow(self, workflow_id: str, context: Dict = None) -> WorkflowExecution:
        """Execute a workflow"""
        # Load workflow definition
        workflow_data = await self.redis_client.get(f"workflow:{workflow_id}")
        if not workflow_data:
            raise ValueError(f"Workflow not found: {workflow_id}")
        
        workflow_dict = json.loads(workflow_data)
        
        # Create execution
        execution_id = str(uuid.uuid4())
        execution = WorkflowExecution(
            id=execution_id,
            workflow_id=workflow_id,
            status=StageStatus.RUNNING,
            context=context or {},
            stages=[],
            started_at=datetime.now()
        )
        
        # Copy stages for execution
        for stage_data in workflow_dict["stages"]:
            stage = WorkflowStage(
                id=stage_data["id"],
                name=stage_data["name"],
                type=StageType(stage_data["type"]),  # Now correctly stored as "extract", "translate", etc.
                config=stage_data["config"],
                dependencies=stage_data["dependencies"],
                position=stage_data["position"]
            )
            execution.stages.append(stage)
        
        # Extract input_file_id from context if present
        if context and "input_file_id" in context:
            execution.input_file_id = context["input_file_id"]
        
        self.executions[execution_id] = execution
        
        # Save execution to Redis for history
        await self._save_execution_to_history(execution)
        
        # Start execution
        asyncio.create_task(self._run_workflow(execution))
        
        return execution
    
    async def execute_batch_workflow(self, workflow_id: str, file_ids: List[str]) -> BatchExecution:
        """Execute a workflow on multiple files as a batch"""
        batch_id = str(uuid.uuid4())
        
        batch = BatchExecution(
            id=batch_id,
            workflow_id=workflow_id,
            file_ids=file_ids,
            status='running',
            executions={},
            started_at=datetime.now(),
            total_files=len(file_ids)
        )
        
        self.batch_executions[batch_id] = batch
        
        # Start batch execution in background
        asyncio.create_task(self._run_batch_workflow(batch))
        
        return batch
    
    async def _run_batch_workflow(self, batch: BatchExecution):
        """Run batch workflow execution"""
        try:
            # Execute workflow for each file
            for file_id in batch.file_ids:
                try:
                    # Create context with file information
                    context = {"input_file_id": file_id}
                    
                    # Execute workflow for this file
                    execution = await self.execute_workflow(batch.workflow_id, context)
                    batch.executions[file_id] = execution.id
                    
                    # Wait for execution to complete (with timeout)
                    timeout = 600  # 10 minutes per file
                    start_time = datetime.now()
                    
                    while execution.status == StageStatus.RUNNING:
                        await asyncio.sleep(2)
                        if (datetime.now() - start_time).seconds > timeout:
                            print(f"⚠️ Execution timeout for file {file_id}")
                            batch.failed_files += 1
                            break
                    
                    if execution.status == StageStatus.COMPLETED:
                        batch.completed_files += 1
                    else:
                        batch.failed_files += 1
                        
                except Exception as e:
                    print(f"❌ Failed to execute workflow for file {file_id}: {e}")
                    batch.failed_files += 1
            
            # Update batch status
            if batch.failed_files == 0:
                batch.status = 'completed'
            elif batch.completed_files == 0:
                batch.status = 'failed'
            else:
                batch.status = 'partial'
            
            batch.completed_at = datetime.now()
            
        except Exception as e:
            batch.status = 'failed'
            batch.completed_at = datetime.now()
            print(f"❌ Batch execution failed: {e}")
    
    async def _run_workflow(self, execution: WorkflowExecution):
        """Run workflow execution"""
        try:
            # Execute stages in dependency order
            completed_stages = set()
            
            while len(completed_stages) < len(execution.stages):
                # Find stages ready to run
                ready_stages = [
                    stage for stage in execution.stages
                    if stage.status == StageStatus.PENDING
                    and all(dep in completed_stages for dep in stage.dependencies)
                ]
                
                if not ready_stages:
                    break
                
                # Execute ready stages in parallel
                tasks = []
                for stage in ready_stages:
                    execution.current_stage = stage.name
                    tasks.append(self._execute_stage(execution, stage))
                
                results = await asyncio.gather(*tasks, return_exceptions=True)
                
                # Update completed stages
                for stage, result in zip(ready_stages, results):
                    if not isinstance(result, Exception):
                        completed_stages.add(stage.name)
                    await self._broadcast_update(execution)
            
            execution.status = StageStatus.COMPLETED
            execution.completed_at = datetime.now()
            
            # Save completed execution to history
            await self._save_execution_to_history(execution)
            
        except Exception as e:
            execution.status = StageStatus.FAILED
            execution.completed_at = datetime.now()
            print(f"Workflow execution failed: {e}")
            
            # Save failed execution to history
            await self._save_execution_to_history(execution)
        
        await self._broadcast_update(execution)
    
    async def _execute_stage(self, execution: WorkflowExecution, stage: WorkflowStage):
        """Execute a single stage"""
        stage.status = StageStatus.RUNNING
        await self._broadcast_update(execution)
        
        try:
            # Get plugin handler
            plugin_name = stage.config.get("plugin", "builtin." + stage.type.value)
            
            # For custom plugins, get handler name from config
            # For built-in plugins, use stage type as handler name
            if stage.type == StageType.CUSTOM:
                handler_name = stage.config.get("handler")
                if not handler_name:
                    raise ValueError(f"Custom plugin requires 'handler' in config for stage '{stage.name}'")
            else:
                handler_name = stage.type.value
            
            handler = self.plugin_registry.get_handler(plugin_name, handler_name)
            
            if not handler:
                raise ValueError(f"No handler found: plugin='{plugin_name}', handler='{handler_name}'")
            
            # Execute handler
            result = await handler(stage.config, execution.context)
            
            stage.status = result.status
            stage.result = result
            
            # Update execution context with stage output
            execution.context[stage.name] = result.output
            
        except Exception as e:
            stage.status = StageStatus.FAILED
            stage.result = StageResult(
                status=StageStatus.FAILED,
                errors=[str(e)]
            )
            print(f"❌ Stage '{stage.name}' failed: {str(e)}")
        
        await self._broadcast_update(execution)
    
    async def _broadcast_update(self, execution: WorkflowExecution):
        """Broadcast execution update to WebSocket clients"""
        update = {
            "type": "execution_update",
            "execution": {
                "id": execution.id,
                "workflow_id": execution.workflow_id,
                "status": execution.status.value,
                "current_stage": execution.current_stage,
                "stages": [
                    {
                        "id": stage.id,
                        "name": stage.name,
                        "type": stage.type.value,
                        "status": stage.status.value,
                        "position": stage.position,
                        "dependencies": stage.dependencies,
                        "result": {
                            "output": stage.result.output if stage.result else None,
                            "metrics": stage.result.metrics if stage.result else None,
                            "errors": stage.result.errors if stage.result else None
                        } if stage.result else None
                    }
                    for stage in execution.stages
                ]
            }
        }
        
        # Broadcast to all connected clients
        for ws in self.websocket_connections:
            try:
                await ws.send_json(update)
            except:
                pass  # Client disconnected
    
    async def _save_execution_to_history(self, execution: WorkflowExecution):
        """Save execution to Redis for history"""
        print(f"🔵 Saving execution to history: {execution.id}")
        try:
            execution_data = {
                "id": execution.id,
                "workflow_id": execution.workflow_id,
                "status": execution.status.value,
                "started_at": execution.started_at.isoformat() if execution.started_at else None,
                "completed_at": execution.completed_at.isoformat() if execution.completed_at else None,
                "input_file_id": execution.input_file_id,
                "stages": [
                    {
                        "name": stage.name,
                        "status": stage.status.value,
                        "result": {
                            "metrics": stage.result.metrics if stage.result else {},
                            "errors": stage.result.errors if stage.result else []
                        } if stage.result else None
                    }
                    for stage in execution.stages
                ]
            }
            
            # Store execution
            await self.redis_client.set(
                f"execution:{execution.id}",
                json.dumps(execution_data, default=json_serializer),
                ex=2592000  # 30 days expiration
            )
            print(f"✅ Saved execution data to Redis: execution:{execution.id}")
            
            # Add to sorted set for listing (score = timestamp)
            timestamp = execution.started_at.timestamp() if execution.started_at else datetime.now().timestamp()
            await self.redis_client.zadd(
                "execution_history",
                {execution.id: timestamp}
            )
            print(f"✅ Added to execution_history sorted set: {execution.id}")
        except Exception as e:
            print(f"❌ Failed to save execution history: {e}")
            import traceback
            traceback.print_exc()
    
    async def get_execution_history(self, limit: int = 50, offset: int = 0):
        """Get execution history from Redis"""
        print(f"🔵 get_execution_history called: limit={limit}, offset={offset}")
        try:
            # Get execution IDs from sorted set (newest first)
            execution_ids = await self.redis_client.zrevrange(
                "execution_history",
                offset,
                offset + limit - 1
            )
            
            print(f"🔵 Found {len(execution_ids)} execution IDs in sorted set")
            print(f"🔵 IDs: {execution_ids}")
            
            executions = []
            for exec_id in execution_ids:
                # Decode bytes to string if needed
                exec_id_str = exec_id.decode('utf-8') if isinstance(exec_id, bytes) else exec_id
                print(f"🔵 Looking for: execution:{exec_id_str}")
                
                exec_data = await self.redis_client.get(f"execution:{exec_id_str}")
                if exec_data:
                    parsed = json.loads(exec_data)
                    print(f"✅ Loaded execution: {exec_id_str}")
                    executions.append(parsed)
                else:
                    print(f"❌ No data found for execution: {exec_id_str}")
            
            print(f"✅ Returning {len(executions)} executions")
            return executions
        except Exception as e:
            print(f"❌ Failed to retrieve execution history: {e}")
            import traceback
            traceback.print_exc()
            return []

# FastAPI Application
app = FastAPI(title="Workflow Engine API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],  # Allow frontend to read this header
)

# Initialize components (BEFORE startup event)
plugin_registry = PluginRegistry()
workflow_engine = WorkflowEngine(plugin_registry)

# Initialize file manager (BEFORE startup event)
from file_manager import FileManager
file_manager = FileManager(storage_path="./uploads")

@app.on_event("startup")
async def startup():
    await workflow_engine.initialize()
    from plugins.sample_plugins import register_custom_plugins
    register_custom_plugins(plugin_registry)
    
    # Pass file_manager to xliff_plugins
    from plugins.xliff_plugins import register_xliff_plugins
    register_xliff_plugins(plugin_registry, file_manager)
    
    from plugins.tm_plugin import register_real_tm_plugin
    register_real_tm_plugin(plugin_registry)
    from plugins.xliff_extract import register_real_xliff_extract_plugin
    register_real_xliff_extract_plugin(plugin_registry)
    
    # Load Ollama MT plugin
    try:
        from plugins.ollama_mt_plugin import register_ollama_mt_plugin
        register_ollama_mt_plugin(plugin_registry)
    except Exception as e:
        print(f"⚠️  Ollama MT plugin not available: {e}")

# API Endpoints
class WorkflowCreateRequest(BaseModel):
    name: str
    description: str = ""
    stages: List[Dict[str, Any]]
    variables: Dict[str, Any] = {}

@app.get("/api/workflows")
async def list_workflows():
    """List all workflows"""
    try:
        # Get all workflow keys from Redis
        workflow_keys = await workflow_engine.redis_client.keys("workflow:*")
        workflows = []
        
        for key in workflow_keys:
            # Decode bytes to string if needed
            key_str = key.decode('utf-8') if isinstance(key, bytes) else key
            
            workflow_data = await workflow_engine.redis_client.get(key_str)
            if workflow_data:
                workflow_dict = json.loads(workflow_data)
                workflows.append({
                    "workflow_id": workflow_dict.get("id"),
                    "name": workflow_dict.get("name"),
                    "description": workflow_dict.get("description", ""),
                    "stages": workflow_dict.get("stages", [])
                })
        
        return {"workflows": workflows, "count": len(workflows)}
    except Exception as e:
        print(f"Failed to list workflows: {e}")
        return {"workflows": [], "count": 0}

@app.post("/api/workflows")
async def create_workflow(request: WorkflowCreateRequest):
    """Create a new workflow"""
    workflow = await workflow_engine.create_workflow(request.dict())
    return {"workflow_id": workflow.id, "name": workflow.name}

class WorkflowExecuteRequest(BaseModel):
    file_id: Optional[str] = None
    config: Dict[str, Any] = {}

@app.post("/api/workflows/{workflow_id}/execute")
async def execute_workflow(workflow_id: str, request: WorkflowExecuteRequest = WorkflowExecuteRequest()):
    """Execute a workflow with optional file input"""
    try:
        context = request.config.copy()
        
        # If file_id provided, add file information to context
        if request.file_id:
            file_info = await file_manager.get_file_info(request.file_id)
            if not file_info:
                raise HTTPException(status_code=404, detail=f"File not found: {request.file_id}")
            
            file_path = await file_manager.get_file_path(request.file_id)
            if not file_path:
                raise HTTPException(status_code=404, detail=f"File not found on disk: {request.file_id}")
            
            # Add file information to context
            context.update({
                "input_file_id": request.file_id,
                "input_filename": file_info["filename"],
                "input_file_path": str(file_path),
                "input_file_size": file_info["size"],
                "input_content_type": file_info["content_type"]
            })
        
        execution = await workflow_engine.execute_workflow(workflow_id, context)
        
        return {
            "execution_id": execution.id,
            "status": execution.status.value,
            "input_file_id": request.file_id
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

# Batch execution endpoints
class BatchExecuteRequest(BaseModel):
    file_ids: List[str]
    config: Dict = {}

@app.post("/api/workflows/{workflow_id}/execute-batch")
async def execute_workflow_batch(workflow_id: str, request: BatchExecuteRequest):
    """Execute a workflow on multiple files as a batch"""
    try:
        if not request.file_ids:
            raise HTTPException(status_code=400, detail="No files provided")
        
        # Verify all files exist
        for file_id in request.file_ids:
            file_info = await file_manager.get_file_info(file_id)
            if not file_info:
                raise HTTPException(status_code=404, detail=f"File not found: {file_id}")
        
        # Execute batch
        batch = await workflow_engine.execute_batch_workflow(workflow_id, request.file_ids)
        
        return {
            "batch_id": batch.id,
            "workflow_id": batch.workflow_id,
            "status": batch.status,
            "total_files": batch.total_files,
            "file_ids": batch.file_ids
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@app.get("/api/batches/{batch_id}")
async def get_batch_status(batch_id: str):
    """Get batch execution status"""
    if batch_id not in workflow_engine.batch_executions:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    batch = workflow_engine.batch_executions[batch_id]
    
    # Get execution details for each file
    executions_status = {}
    for file_id, execution_id in batch.executions.items():
        if execution_id in workflow_engine.executions:
            exec = workflow_engine.executions[execution_id]
            executions_status[file_id] = {
                "execution_id": execution_id,
                "status": exec.status.value,
                "file_id": file_id
            }
    
    return {
        "batch_id": batch.id,
        "workflow_id": batch.workflow_id,
        "status": batch.status,
        "total_files": batch.total_files,
        "completed_files": batch.completed_files,
        "failed_files": batch.failed_files,
        "started_at": batch.started_at.isoformat(),
        "completed_at": batch.completed_at.isoformat() if batch.completed_at else None,
        "executions": executions_status
    }

@app.get("/api/batches/{batch_id}/download")
async def download_batch_results(batch_id: str):
    """Download all results from batch execution as a ZIP file"""
    import zipfile
    from io import BytesIO
    
    if batch_id not in workflow_engine.batch_executions:
        raise HTTPException(status_code=404, detail="Batch not found")
    
    batch = workflow_engine.batch_executions[batch_id]
    
    if batch.status == 'running':
        raise HTTPException(status_code=400, detail="Batch is still running")
    
    # Create ZIP file in memory
    zip_buffer = BytesIO()
    
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for file_id, execution_id in batch.executions.items():
            if execution_id not in workflow_engine.executions:
                print(f"⚠️ Execution not found: {execution_id}")
                continue
            
            execution = workflow_engine.executions[execution_id]
            
            if execution.status != StageStatus.COMPLETED:
                print(f"⚠️ Execution not completed: {execution_id}")
                continue
            
            try:
                # Use same logic as single download
                input_file_id = execution.input_file_id
                if not input_file_id:
                    print(f"⚠️ No input file: {execution_id}")
                    continue
                
                file_info = await file_manager.get_file_info(input_file_id)
                if not file_info:
                    print(f"⚠️ File info not found: {input_file_id}")
                    continue
                
                original_filename = file_info["filename"]
                is_xlz = original_filename.lower().endswith('.xlz')
                
                # Get translated segments from the last stage
                segments = None
                for stage in reversed(execution.stages):
                    if stage.result and stage.result.output.get("segments"):
                        segments = stage.result.output["segments"]
                        break
                
                if not segments:
                    print(f"⚠️ No segments found: {execution_id}")
                    continue
                
                # Read original file
                file_path = await file_manager.get_file_path(input_file_id)
                with open(file_path, 'rb') as f:
                    file_content = f.read()
                
                # Handle XLZ extraction
                skeleton_files = {}
                if is_xlz:
                    from xlz_handler import XLZHandler
                    xliff_content, skeleton_files = XLZHandler.extract_xliff_from_xlz(file_content)
                    file_content = xliff_content
                
                # Parse XLIFF
                from lxml import etree
                tree = etree.fromstring(file_content)
                
                # Detect namespace
                namespace = ''
                if tree.tag.startswith('{'):
                    namespace = tree.tag[1:tree.tag.index('}')]
                
                ns = {'xliff': namespace} if namespace else {}
                
                # Update trans-units with translated targets
                segment_map = {seg["id"]: seg for seg in segments}
                
                file_elements = tree.findall('.//xliff:file', ns) if namespace else tree.findall('.//file')
                
                for file_elem in file_elements:
                    trans_unit_elements = file_elem.findall('.//xliff:trans-unit', ns) if namespace else file_elem.findall('.//trans-unit')
                    
                    for tu_elem in trans_unit_elements:
                        tu_id = tu_elem.get('id', '')
                        
                        if tu_id in segment_map:
                            segment = segment_map[tu_id]
                            
                            # Find or create target element
                            target_elem = tu_elem.find('xliff:target', ns) if namespace else tu_elem.find('target')
                            
                            if target_elem is None:
                                # Create new target element
                                if namespace:
                                    target_elem = etree.SubElement(tu_elem, f'{{{namespace}}}target')
                                else:
                                    target_elem = etree.SubElement(tu_elem, 'target')
                            
                            # Update target text and state
                            target_elem.text = segment.get("target", "")
                            target_elem.set('state', segment.get("state", "translated"))
                
                # Generate output XLIFF
                xliff_output = etree.tostring(
                    tree,
                    encoding='utf-8',
                    xml_declaration=True,
                    pretty_print=True
                )
                
                # Create output filename
                base_name = original_filename.rsplit('.', 1)[0]
                output_filename = f"{base_name}_translated.{'xlz' if is_xlz else 'xliff'}"
                
                # If XLZ, recreate archive
                if is_xlz:
                    from xlz_handler import XLZHandler
                    xlz_output = XLZHandler.create_xlz_archive(xliff_output, skeleton_files)
                    zip_file.writestr(output_filename, xlz_output)
                    print(f"✅ Added to ZIP: {output_filename} (XLZ)")
                else:
                    zip_file.writestr(output_filename, xliff_output)
                    print(f"✅ Added to ZIP: {output_filename} (XLIFF)")
                    
            except Exception as e:
                print(f"❌ Failed to process file {file_id}: {e}")
                import traceback
                traceback.print_exc()
                continue
    
    zip_buffer.seek(0)
    
    batch_filename = f'batch_{batch_id[:8]}_results.zip'
    
    return Response(
        content=zip_buffer.getvalue(),
        media_type='application/zip',
        headers={
            'Content-Disposition': f'attachment; filename="{batch_filename}"'
        }
    )

@app.get("/api/executions")
async def list_executions(limit: int = 50, offset: int = 0):
    """List execution history"""
    print(f"🔵 GET /api/executions called with limit={limit}, offset={offset}")
    history = await workflow_engine.get_execution_history(limit=limit, offset=offset)
    print(f"🔵 Retrieved {len(history)} executions from history")
    
    # Enrich with file and workflow information
    enriched_history = []
    for exec_data in history:
        print(f"🔵 Processing execution: {exec_data.get('id', 'NO_ID')}")
        # Get workflow name
        workflow_name = "Unknown"
        try:
            workflow_data = await workflow_engine.redis_client.get(f"workflow:{exec_data['workflow_id']}")
            if workflow_data:
                workflow_dict = json.loads(workflow_data)
                workflow_name = workflow_dict.get("name", "Unknown")
        except Exception as e:
            print(f"❌ Failed to get workflow name: {e}")
        
        # Get input file name
        input_filename = "Unknown"
        if exec_data.get("input_file_id"):
            try:
                file_info = await file_manager.get_file_info(exec_data["input_file_id"])
                if file_info:
                    input_filename = file_info["filename"]
            except Exception as e:
                print(f"❌ Failed to get file info: {e}")
        
        enriched_history.append({
            **exec_data,
            "workflow_name": workflow_name,
            "input_filename": input_filename
        })
    
    print(f"✅ Returning {len(enriched_history)} enriched executions")
    return {
        "executions": enriched_history,
        "count": len(enriched_history),
        "limit": limit,
        "offset": offset
    }

@app.get("/api/executions/{execution_id}")
async def get_execution(execution_id: str):
    """Get execution status with file information"""
    if execution_id not in workflow_engine.executions:
        raise HTTPException(status_code=404, detail="Execution not found")
    
    execution = workflow_engine.executions[execution_id]
    
    # Get input file info if present
    input_file_info = None
    if execution.input_file_id:
        file_data = await file_manager.get_file_info(execution.input_file_id)
        if file_data:
            input_file_info = {
                "file_id": file_data["file_id"],
                "filename": file_data["filename"],
                "size": file_data["size"],
                "content_type": file_data["content_type"]
            }
    
    # Get output file info if present
    output_file_info = None
    if execution.output_file_id:
        file_data = await file_manager.get_file_info(execution.output_file_id)
        if file_data:
            output_file_info = {
                "file_id": file_data["file_id"],
                "filename": file_data["filename"],
                "size": file_data["size"],
                "content_type": file_data["content_type"]
            }
    
    return {
        "id": execution.id,
        "workflow_id": execution.workflow_id,
        "status": execution.status.value,
        "current_stage": execution.current_stage,
        "input_file": input_file_info,
        "output_file": output_file_info,
        "stages": [
            {
                "name": stage.name,
                "status": stage.status.value,
                "result": {
                    "output": stage.result.output if stage.result else {},
                    "metrics": stage.result.metrics if stage.result else {},
                    "errors": stage.result.errors if stage.result else []
                }
            } for stage in execution.stages
        ]
    }

@app.get("/api/executions/{execution_id}/download")
async def download_execution_output(execution_id: str):
    """
    Download translated XLIFF/XLZ file from completed workflow execution
    
    Reconstructs XLIFF with translated segments and returns as downloadable file
    """
    execution = workflow_engine.executions.get(execution_id)
    
    if not execution:
        raise HTTPException(status_code=404, detail="Execution not found")
    
    if execution.status != StageStatus.COMPLETED:
        raise HTTPException(
            status_code=400, 
            detail=f"Execution not completed. Current status: {execution.status.value}"
        )
    
    try:
        # Get original file info
        input_file_id = execution.input_file_id
        if not input_file_id:
            raise HTTPException(status_code=400, detail="No input file associated with execution")
        
        file_info = await file_manager.get_file_info(input_file_id)
        if not file_info:
            raise HTTPException(status_code=404, detail="Original file not found")
        
        original_filename = file_info["filename"]
        is_xlz = original_filename.lower().endswith('.xlz')
        
        # Get translated segments from the last stage (export, validate, or translate)
        segments = None
        for stage in reversed(execution.stages):
            if stage.result and stage.result.output.get("segments"):
                segments = stage.result.output["segments"]
                break
        
        if not segments:
            raise HTTPException(status_code=400, detail="No translated segments found in execution")
        
        # Read original file to preserve structure
        file_path = await file_manager.get_file_path(input_file_id)
        with open(file_path, 'rb') as f:
            file_content = f.read()
        
        # Handle XLZ extraction
        skeleton_files = {}
        if is_xlz:
            from xlz_handler import XLZHandler
            xliff_content, skeleton_files = XLZHandler.extract_xliff_from_xlz(file_content)
            file_content = xliff_content
        
        # Parse XLIFF
        from lxml import etree
        tree = etree.fromstring(file_content)
        
        # Detect namespace
        namespace = ''
        if tree.tag.startswith('{'):
            namespace = tree.tag[1:tree.tag.index('}')]
        
        ns = {'xliff': namespace} if namespace else {}
        
        # Update trans-units with translated targets
        segment_map = {seg["id"]: seg for seg in segments}
        
        file_elements = tree.findall('.//xliff:file', ns) if namespace else tree.findall('.//file')
        
        for file_elem in file_elements:
            trans_unit_elements = file_elem.findall('.//xliff:trans-unit', ns) if namespace else file_elem.findall('.//trans-unit')
            
            for tu_elem in trans_unit_elements:
                tu_id = tu_elem.get('id', '')
                
                if tu_id in segment_map:
                    segment = segment_map[tu_id]
                    
                    # Find or create target element
                    target_elem = tu_elem.find('xliff:target', ns) if namespace else tu_elem.find('target')
                    
                    if target_elem is None:
                        # Create new target element
                        if namespace:
                            target_elem = etree.SubElement(tu_elem, f'{{{namespace}}}target')
                        else:
                            target_elem = etree.SubElement(tu_elem, 'target')
                    
                    # Update target text and state
                    target_elem.text = segment.get("target", "")
                    target_elem.set('state', segment.get("state", "translated"))
        
        # Generate output XLIFF
        xliff_output = etree.tostring(
            tree,
            encoding='utf-8',
            xml_declaration=True,
            pretty_print=True
        )
        
        # Create output filename - sanitize for Windows
        import re
        base_name = original_filename.rsplit('.', 1)[0]
        # Remove illegal Windows filename characters
        base_name = re.sub(r'[<>:"/\\|?*]', '_', base_name)
        output_filename = f"{base_name}_translated.{'xlz' if is_xlz else 'xliff'}"
        
        print(f"📥 Generating download: {output_filename}")
        
        # If XLZ, recreate archive
        if is_xlz:
            from xlz_handler import XLZHandler
            xlz_output = XLZHandler.create_xlz_archive(xliff_output, skeleton_files)
            
            return Response(
                content=xlz_output,
                media_type='application/x-memoq-xlz',
                headers={
                    'Content-Disposition': f'attachment; filename="{output_filename}"'
                }
            )
        else:
            # Return XLIFF
            return Response(
                content=xliff_output,
                media_type='application/x-xliff+xml',
                headers={
                    'Content-Disposition': f'attachment; filename="{output_filename}"'
                }
            )
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error generating translated file: {str(e)}")

# File Management API
from fastapi import UploadFile, File
from fastapi.responses import FileResponse, StreamingResponse

# file_manager already initialized above (before startup event)

@app.post("/api/files/upload")
async def upload_file(
    file: UploadFile = File(...),
    description: Optional[str] = None
):
    """
    Upload a file for workflow processing
    
    Returns file metadata including file_id to use in workflow execution
    """
    try:
        # Read file content
        content = await file.read()
        
        # Upload using file manager
        file_info = await file_manager.upload_file(
            file_content=content,
            filename=file.filename,
            content_type=file.content_type,
            metadata={"description": description} if description else None
        )
        
        return {
            "file_id": file_info["file_id"],
            "filename": file_info["filename"],
            "size": file_info["size"],
            "size_formatted": format_file_size(file_info["size"]),
            "content_type": file_info["content_type"],
            "uploaded_at": file_info["uploaded_at"]
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@app.get("/api/files")
async def list_files(limit: int = 100, offset: int = 0):
    """List all uploaded files"""
    files = await file_manager.list_files(limit=limit, offset=offset)
    
    return {
        "files": [
            {
                "file_id": f["file_id"],
                "filename": f["filename"],
                "size": f["size"],
                "size_formatted": format_file_size(f["size"]),
                "content_type": f["content_type"],
                "uploaded_at": f["uploaded_at"]
            }
            for f in files
        ],
        "count": len(files)
    }

@app.get("/api/files/{file_id}")
async def get_file_info(file_id: str):
    """Get file metadata"""
    file_info = await file_manager.get_file_info(file_id)
    
    if not file_info:
        raise HTTPException(status_code=404, detail="File not found")
    
    return {
        "file_id": file_info["file_id"],
        "filename": file_info["filename"],
        "size": file_info["size"],
        "size_formatted": format_file_size(file_info["size"]),
        "content_type": file_info["content_type"],
        "file_hash": file_info["file_hash"],
        "uploaded_at": file_info["uploaded_at"],
        "metadata": file_info.get("metadata", {})
    }

@app.get("/api/files/{file_id}/download")
async def download_file(file_id: str):
    """Download a file"""
    file_info = await file_manager.get_file_info(file_id)
    
    if not file_info:
        raise HTTPException(status_code=404, detail="File not found")
    
    file_path = await file_manager.get_file_path(file_id)
    
    if not file_path or not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")
    
    return FileResponse(
        path=str(file_path),
        filename=file_info["filename"],
        media_type=file_info["content_type"]
    )

@app.delete("/api/files/{file_id}")
async def delete_file(file_id: str):
    """Delete a file"""
    success = await file_manager.delete_file(file_id)
    
    if not success:
        raise HTTPException(status_code=404, detail="File not found")
    
    return {"status": "deleted", "file_id": file_id}

@app.get("/api/storage/stats")
async def get_storage_stats():
    """Get storage statistics"""
    stats = file_manager.get_storage_stats()
    return stats

# Helper function for file size formatting (imported from file_manager)
def format_file_size(size_bytes: int) -> str:
    """Format file size in human-readable format"""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.1f} TB"

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket for real-time updates"""
    await websocket.accept()
    workflow_engine.websocket_connections.append(websocket)
    
    try:
        while True:
            # Keep connection alive
            await websocket.receive_text()
    except:
        workflow_engine.websocket_connections.remove(websocket)

@app.post("/api/plugins/register")
async def register_plugin(plugin_code: str):
    """Register a custom plugin"""
    # This would evaluate and register custom plugin code
    # For now, just return success
    return {"status": "Plugin registered successfully"}

# ============================================================================
# XLIFF EDITOR ENDPOINTS
# ============================================================================

# Import required XLIFF dependencies
try:
    from lxml import etree
    LXML_AVAILABLE = True
except ImportError:
    LXML_AVAILABLE = False
    print("⚠️  Warning: lxml not installed. XLIFF Editor features disabled.")
    print("   Install with: pip install lxml")

# Store the current XML tree and skeleton files in memory for XLIFF Editor
xliff_editor_store = {}

@app.get("/")
async def root():
    """Root endpoint - API info"""
    return {
        "message": "Localization Workflow Platform API",
        "version": "1.0",
        "features": {
            "workflow_engine": True,
            "xliff_editor": LXML_AVAILABLE,
            "file_upload": True,
            "tm_lookup": True
        }
    }

@app.post("/upload")
async def upload_xliff_editor(file: UploadFile = File(...)):
    """
    XLIFF Editor: Upload and parse an XLIFF or XLZ file for editing
    (Different from /api/files/upload which is for workflow processing)
    """
    if not LXML_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="XLIFF Editor not available. Install lxml: pip install lxml"
        )
    
    filename = file.filename.lower() if file.filename else ""
    
    # Check file extension - now includes XLZ
    if not (filename.endswith(('.xliff', '.xlf', '.sdlxliff', '.xlz'))):
        raise HTTPException(
            status_code=400,
            detail="File must be XLIFF (.xliff, .xlf, .sdlxliff, .xlz)"
        )
    
    try:
        content = await file.read()
        
        # Handle XLZ files (zipped XLIFF)
        from xlz_handler import XLZHandler
        
        if XLZHandler.is_xlz_file(file.filename):
            # Extract XLIFF from XLZ archive
            xliff_content, skeleton_files = XLZHandler.extract_xliff_from_xlz(content)
            content = xliff_content
            
            # Store XLZ metadata for reconstruction on download
            xliff_editor_store['is_xlz'] = True
            xliff_editor_store['skeleton_files'] = skeleton_files
            xliff_editor_store['original_xlz_filename'] = file.filename
        else:
            xliff_editor_store['is_xlz'] = False
        
        # Parse XML with lxml
        tree = etree.fromstring(content)
        
        # Store for later editing
        xliff_editor_store['tree'] = tree
        xliff_editor_store['filename'] = file.filename
        
        # Extract trans-units from XML
        files = []
        
        # Detect namespace
        namespace = ''
        if tree.tag.startswith('{'):
            namespace = tree.tag[1:tree.tag.index('}')]
        
        ns = {'xliff': namespace} if namespace else {}
        
        # Find all file elements
        file_elements = tree.findall('.//xliff:file', ns) if namespace else tree.findall('.//file')
        
        for file_idx, file_elem in enumerate(file_elements):
            source_lang = file_elem.get('source-language', 'en')
            target_lang = file_elem.get('target-language', 'es')
            original = file_elem.get('original', f'file_{file_idx}')
            
            # Find all trans-units
            trans_unit_elements = file_elem.findall('.//xliff:trans-unit', ns) if namespace else file_elem.findall('.//trans-unit')
            
            trans_units = []
            for tu_elem in trans_unit_elements:
                tu_id = tu_elem.get('id', '')
                
                # Get source
                source_elem = tu_elem.find('xliff:source', ns) if namespace else tu_elem.find('source')
                source_text = ''
                if source_elem is not None:
                    # Get all text including from child elements
                    source_text = ''.join(source_elem.itertext())
                
                # Get target
                target_elem = tu_elem.find('xliff:target', ns) if namespace else tu_elem.find('target')
                target_text = ''
                target_state = 'new'
                if target_elem is not None:
                    target_text = ''.join(target_elem.itertext())
                    target_state = target_elem.get('state', 'new')
                
                # Get notes
                note_elements = tu_elem.findall('xliff:note', ns) if namespace else tu_elem.findall('note')
                notes = [note.text for note in note_elements if note.text]
                
                trans_units.append({
                    "id": tu_id,
                    "source": {
                        "text": source_text,
                        "tags": []
                    },
                    "target": {
                        "text": target_text,
                        "tags": []
                    } if target_text else None,
                    "state": target_state,
                    "notes": notes,
                    "attributes": {}
                })
            
            files.append({
                "original": original,
                "source_language": source_lang,
                "target_language": target_lang,
                "datatype": "plaintext",
                "trans_units": trans_units
            })
        
        # Detect XLIFF version
        version = tree.get('version', '1.2')
        
        return {
            "version": version,
            "files": files
        }
        
    except etree.XMLSyntaxError as e:
        raise HTTPException(status_code=400, detail=f"Invalid XLIFF XML: {str(e)}")
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error parsing file: {str(e)}")

@app.get("/xlz/info")
async def get_xlz_info():
    """Get information about the currently loaded XLZ file"""
    if 'tree' not in xliff_editor_store:
        raise HTTPException(status_code=400, detail="No file uploaded")
    
    return {
        "is_xlz": xliff_editor_store.get('is_xlz', False),
        "filename": xliff_editor_store.get('filename'),
        "skeleton_files": list(xliff_editor_store.get('skeleton_files', {}).keys())
    }

@app.put("/trans-unit")
async def update_trans_unit(update: dict):
    """Update a trans-unit's target translation"""
    if not LXML_AVAILABLE:
        raise HTTPException(status_code=503, detail="XLIFF Editor not available")
    
    if 'tree' not in xliff_editor_store:
        raise HTTPException(status_code=400, detail="No file uploaded")
    
    try:
        tree = xliff_editor_store['tree']
        file_index = update.get('file_index', 0)
        trans_unit_id = update.get('trans_unit_id', '')
        target_text = update.get('target_text', '')
        
        # Find the trans-unit and update it
        # This is simplified - you may need to adjust based on XLIFF structure
        namespaces = {'xliff': 'urn:oasis:names:tc:xliff:document:1.2'}
        
        # Find all file elements
        files = tree.findall('.//xliff:file', namespaces)
        if not files:
            files = tree.findall('.//file')  # Try without namespace
        
        if file_index < len(files):
            file_elem = files[file_index]
            
            # Find trans-unit by ID
            trans_units = file_elem.findall('.//xliff:trans-unit', namespaces)
            if not trans_units:
                trans_units = file_elem.findall('.//trans-unit')
            
            for tu in trans_units:
                if tu.get('id') == trans_unit_id:
                    # Find or create target element
                    target = tu.find('xliff:target', namespaces)
                    if target is None:
                        target = tu.find('target')
                    
                    if target is None:
                        # Create target element
                        target = etree.SubElement(tu, 'target')
                    
                    target.text = target_text
                    break
        
        # Store updated tree
        xliff_editor_store['tree'] = tree
        
        return {"message": "Trans-unit updated successfully"}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating trans-unit: {str(e)}")

@app.get("/download")
async def download_xliff():
    """Download the modified XLIFF file (or XLZ if original was XLZ)"""
    if not LXML_AVAILABLE:
        raise HTTPException(status_code=503, detail="XLIFF Editor not available")
    
    if 'tree' not in xliff_editor_store:
        raise HTTPException(status_code=400, detail="No file to download")
    
    try:
        # Generate XLIFF content from tree
        xml_content = etree.tostring(
            xliff_editor_store['tree'],
            encoding='utf-8',
            xml_declaration=True,
            pretty_print=True
        )
        
        # Get original filename
        filename = xliff_editor_store.get('filename', 'modified.xliff')
        
        # Check if original file was XLZ - recreate XLZ archive
        if xliff_editor_store.get('is_xlz', False):
            from xlz_handler import XLZHandler
            
            # Get skeleton files from upload
            skeleton_files = xliff_editor_store.get('skeleton_files', {})
            
            # Create XLZ archive with modified XLIFF + original skeleton files
            xlz_content = XLZHandler.create_xlz_archive(xml_content, skeleton_files)
            
            # Use original XLZ filename if available
            original_filename = xliff_editor_store.get('original_xlz_filename', filename)
            if not original_filename.lower().endswith('.xlz'):
                original_filename = original_filename.rsplit('.', 1)[0] + '.xlz'
            
            return Response(
                content=xlz_content,
                media_type='application/x-memoq-xlz',
                headers={
                    'Content-Disposition': f'attachment; filename="{original_filename}"'
                }
            )
        
        # Otherwise return standard XLIFF
        # Determine media type based on extension
        filename_lower = filename.lower()
        if filename_lower.endswith('.sdlxliff'):
            media_type = 'application/x-sdlxliff+xml'
        else:
            media_type = 'application/x-xliff+xml'
        
        return Response(
            content=xml_content,
            media_type=media_type,
            headers={
                'Content-Disposition': f'attachment; filename="{filename}"'
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating download: {str(e)}")

@app.delete("/clear")
async def clear_xliff_editor():
    """Clear the currently loaded XLIFF file from editor"""
    xliff_editor_store.clear()
    return {"message": "XLIFF editor file cleared"}

# ============================================================================
# TM (Translation Memory) API Endpoints
# ============================================================================

from tm_database_manager import TMDatabaseManager

# Initialize TM Database Manager
tm_manager = TMDatabaseManager(registry_path="./tm_registry.json")

# Create default database if none exist
if not tm_manager.list_databases():
    tm_manager.create_database(
        name="default",
        description="Default Translation Memory",
        owner="admin",
        access_type="public"
    )

# Current session state
current_tm_db = None
current_tm_name = None

@app.get("/api/tm/databases")
async def list_tm_databases(user: str = "admin"):
    """List all TM databases accessible by user"""
    try:
        databases = tm_manager.list_databases(user=user)
        return {"databases": databases}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/tm/databases/create")
async def create_tm_database(request: dict):
    """Create a new TM database"""
    try:
        name = request.get("name")
        description = request.get("description", "")
        owner = request.get("owner", "admin")
        access_type = request.get("access_type", "private")
        
        if not name:
            raise HTTPException(status_code=400, detail="Database name is required")
        
        db_info = tm_manager.create_database(
            name=name,
            description=description,
            owner=owner,
            access_type=access_type
        )
        
        return {"success": True, "database": db_info}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/tm/databases/{db_name}/connect")
async def connect_to_tm_database(db_name: str, user: str = "admin"):
    """Connect to a TM database"""
    global current_tm_db, current_tm_name
    
    try:
        tm_db = tm_manager.connect_to_database(db_name, user=user)
        current_tm_db = tm_db
        current_tm_name = db_name
        
        return {
            "success": True,
            "database": tm_manager.get_database_info(db_name, user=user)
        }
    except (ValueError, PermissionError, FileNotFoundError) as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/tm/databases/{db_name}/disconnect")
async def disconnect_from_tm_database(db_name: str):
    """Disconnect from current TM database"""
    global current_tm_db, current_tm_name
    
    if current_tm_name == db_name:
        current_tm_db = None
        current_tm_name = None
    
    return {"success": True, "message": "Disconnected"}

@app.get("/api/tm/databases/{db_name}")
async def get_tm_database_info(db_name: str, user: str = "admin"):
    """Get TM database information"""
    try:
        db_info = tm_manager.get_database_info(db_name, user=user)
        return {"database": db_info}
    except (ValueError, PermissionError) as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/tm/databases/{db_name}/access/grant")
async def grant_database_access(db_name: str, request: dict):
    """Grant user access to database"""
    try:
        user = request.get("user")
        granter = request.get("granter", "admin")
        
        if not user:
            raise HTTPException(status_code=400, detail="User is required")
        
        success = tm_manager.grant_access(db_name, user, granter)
        return {"success": success, "message": f"Access granted to {user}"}
    except (ValueError, PermissionError) as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/tm/databases/{db_name}/access/revoke")
async def revoke_database_access(db_name: str, request: dict):
    """Revoke user access from database"""
    try:
        user = request.get("user")
        revoker = request.get("revoker", "admin")
        
        if not user:
            raise HTTPException(status_code=400, detail="User is required")
        
        success = tm_manager.revoke_access(db_name, user, revoker)
        return {"success": success, "message": f"Access revoked from {user}"}
    except (ValueError, PermissionError) as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/tm/databases/{db_name}/access/change")
async def change_database_access_type(db_name: str, request: dict):
    """Change database access type (private/shared/public)"""
    try:
        access_type = request.get("access_type")
        changer = request.get("changer", "admin")
        
        if not access_type:
            raise HTTPException(status_code=400, detail="Access type is required")
        
        success = tm_manager.change_access_type(db_name, access_type, changer)
        return {"success": success, "message": f"Access type changed to {access_type}"}
    except (ValueError, PermissionError) as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/tm/databases/{db_name}")
async def delete_tm_database(db_name: str, deleter: str = "admin"):
    """Delete TM database (owner only)"""
    global current_tm_db, current_tm_name
    
    try:
        # Disconnect if currently connected
        if current_tm_name == db_name:
            current_tm_db = None
            current_tm_name = None
        
        success = tm_manager.delete_database(db_name, deleter)
        return {"success": success, "message": f"Database '{db_name}' deleted"}
    except (ValueError, PermissionError) as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/tm/search")
async def search_tm(
    source: str,
    source_lang: str,
    target_lang: str,
    threshold: float = 0.7,
    limit: int = 5
):
    """Search TM for fuzzy matches"""
    global current_tm_db, current_tm_name
    
    if not current_tm_db:
        return {"matches": [], "error": "No TM database connected"}
    
    try:
        matches = await current_tm_db.find_fuzzy_matches(
            source=source,
            source_lang=source_lang,
            target_lang=target_lang,
            threshold=threshold,
            limit=limit
        )
        
        return {
            "matches": [
                {
                    "source": m.source,
                    "target": m.target,
                    "score": m.score,
                    "context": m.context,
                    "created_by": m.created_by,
                    "created_at": m.created_at,
                    "source_lang": m.source_lang,
                    "target_lang": m.target_lang
                }
                for m in matches
            ],
            "database": current_tm_name
        }
    except Exception as e:
        print(f"TM search error: {e}")
        return {"matches": [], "error": str(e)}

@app.post("/api/tm/save")
async def save_to_tm(request: dict):
    """Save translation to TM"""
    global current_tm_db, current_tm_name
    
    if not current_tm_db:
        raise HTTPException(status_code=400, detail="No TM database connected")
    
    try:
        source = request.get("source")
        target = request.get("target")
        source_lang = request.get("source_lang")
        target_lang = request.get("target_lang")
        context = request.get("context", "")
        
        if not all([source, target, source_lang, target_lang]):
            raise HTTPException(status_code=400, detail="Missing required fields")
        
        success = await current_tm_db.add_translation(
            source=source,
            target=target,
            source_lang=source_lang,
            target_lang=target_lang,
            context=context,
            created_by="xliff_editor"
        )
        
        return {
            "success": success, 
            "message": "Saved to TM" if success else "Already exists in TM",
            "database": current_tm_name
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save to TM: {str(e)}")

@app.get("/api/ollama/models")
async def get_ollama_models():
    """Get list of available Ollama models"""
    try:
        response = requests.get("http://localhost:11434/api/tags", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Found {len(data.get('models', []))} Ollama models")
            return data
        else:
            print(f"⚠️ Ollama returned status {response.status_code}")
            return {"models": []}
    except requests.exceptions.ConnectionError:
        print("❌ Cannot connect to Ollama - is it running?")
        return {"models": [], "error": "Ollama not running"}
    except Exception as e:
        print(f"❌ Error fetching Ollama models: {e}")
        return {"models": [], "error": str(e)}

@app.post("/api/translate")
async def translate_text(request: Request):
    """Translate text using Ollama model"""
    try:
        data = await request.json()
        text = data.get("text", "")
        source_lang = data.get("source_lang", "en")
        target_lang = data.get("target_lang", "es")
        model = data.get("model", "llama4:scout")
        
        print(f"\n🔄 Translation request:")
        print(f"  Text: {text[:50]}..." if len(text) > 50 else f"  Text: {text}")
        print(f"  From: {source_lang} → To: {target_lang}")
        print(f"  Model: {model}")
        
        if not text:
            return {"error": "No text provided", "translation": ""}
        
        # Create translation prompt
        prompt = f"""Translate the following text from {source_lang} to {target_lang}.
Provide ONLY the translation, no explanations or additional text.

Source text:
{text}

Translation:"""
        
        print(f"  Calling Ollama...")
        
        # Call Ollama API
        ollama_response = requests.post(
            "http://localhost:11434/api/generate",
            json={
                "model": model,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.3,  # Lower temperature for more consistent translations
                    "top_p": 0.9
                }
            },
            timeout=120  # 2 minutes timeout
        )
        
        if ollama_response.status_code == 200:
            result = ollama_response.json()
            translation = result.get("response", "").strip()
            
            # Remove common prefixes that models sometimes add
            prefixes_to_remove = [
                "Translation:",
                "Translated text:",
                "Here is the translation:",
                "Here's the translation:",
            ]
            
            for prefix in prefixes_to_remove:
                if translation.lower().startswith(prefix.lower()):
                    translation = translation[len(prefix):].strip()
            
            print(f"  ✅ Translation: {translation[:50]}..." if len(translation) > 50 else f"  ✅ Translation: {translation}")
            
            return {
                "translation": translation,
                "model": model,
                "source_lang": source_lang,
                "target_lang": target_lang,
                "success": True
            }
        else:
            error_msg = f"Ollama returned status {ollama_response.status_code}"
            print(f"  ❌ {error_msg}")
            return {
                "error": error_msg,
                "translation": "",
                "success": False
            }
            
    except requests.exceptions.Timeout:
        error_msg = "Translation timeout - model took too long"
        print(f"  ⏱️ {error_msg}")
        return {
            "error": error_msg,
            "translation": "",
            "success": False
        }
    except requests.exceptions.ConnectionError:
        error_msg = "Cannot connect to Ollama - is it running?"
        print(f"  ❌ {error_msg}")
        return {
            "error": error_msg,
            "translation": "",
            "success": False
        }
    except Exception as e:
        error_msg = f"Translation error: {str(e)}"
        print(f"  ❌ {error_msg}")
        return {
            "error": error_msg,
            "translation": "",
            "success": False
        }

# Test the endpoints with:
# curl http://localhost:8000/api/ollama/models
# curl -X POST http://localhost:8000/api/translate -H "Content-Type: application/json" -d '{"text":"Hello","source_lang":"en","target_lang":"es","model":"llama4:scout"}'

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)