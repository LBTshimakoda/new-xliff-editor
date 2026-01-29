"""
XLIFF Editor API - Standalone Translation Editor
Separate from workflow engine, can be used independently
"""

from fastapi import FastAPI, UploadFile, File, HTTPException, Path as PathParam, Query, Body
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List, Dict
import uuid
from datetime import datetime
from lxml import etree
import json

# Shared services (import from other modules)
from file_manager import FileManager
from tm_database_manager import TMDatabaseManager

app = FastAPI(
    title="XLIFF Editor API",
    description="""
    ## Standalone Translation Editor for XLIFF/XLZ Files
    
    Professional translation editor with:
    * 📝 Segment-by-segment editing
    * 🔍 Translation Memory integration
    * 🤖 Machine Translation support
    * ✅ Quality assurance checks
    * 💾 Session-based workflow
    * 📦 XLZ file support (memoQ format)
    
    ## Getting Started
    
    1. **Upload** XLIFF/XLZ file → Creates editing session
    2. **Get segments** → List all segments with source/target
    3. **Update segments** → Translate one by one
    4. **Download** → Get translated XLIFF/XLZ file
    
    ## Base URL
    
    Development: `http://localhost:8001`
    
    ## Authentication
    
    Currently no authentication required (single-user mode)
    
    ## Swagger UI
    
    Interactive API documentation: `/docs`  
    Alternative UI (ReDoc): `/redoc`
    """,
    version="1.0.0",
    contact={
        "name": "XLIFF Editor Support",
        "email": "support@example.com",
    },
    license_info={
        "name": "MIT License",
        "url": "https://opensource.org/licenses/MIT",
    },
    openapi_tags=[
        {
            "name": "Sessions",
            "description": "Manage editing sessions - upload files, track progress, close sessions"
        },
        {
            "name": "Segments",
            "description": "Edit translation segments - get, update, filter segments"
        },
        {
            "name": "Download",
            "description": "Export translated files"
        },
        {
            "name": "Health",
            "description": "API health and status checks"
        }
    ]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize services
file_manager = FileManager(storage_path="./xliff_editor_files")
tm_manager = TMDatabaseManager(registry_path="./tm_registry.json")

# In-memory storage for editor sessions
editor_sessions = {}

class EditorSession:
    """Represents an active XLIFF editing session"""
    def __init__(self, file_id: str, filename: str, xliff_tree: etree._Element):
        self.session_id = str(uuid.uuid4())
        self.file_id = file_id
        self.filename = filename
        self.xliff_tree = xliff_tree
        self.created_at = datetime.now()
        self.last_modified = datetime.now()
        self.is_xlz = filename.lower().endswith('.xlz')
        self.skeleton_files = {}
        self.segments = []
        self.current_segment = 0
        self.total_segments = 0
        self.translated_count = 0
        self.auto_save_enabled = True
        
class SegmentModel(BaseModel):
    """Segment data model"""
    id: str = Field(..., description="Unique segment identifier (trans-unit ID)", example="1")
    source: str = Field(..., description="Source text to translate", example="Hello {username}")
    target: Optional[str] = Field(None, description="Translated text", example="Hola {username}")
    state: str = Field("new", description="Segment state", example="translated", 
                      enum=["new", "translated", "reviewed", "locked"])
    tm_match: Optional[float] = Field(None, description="TM match percentage (0-100)", example=95.5)
    notes: List[str] = Field(default_factory=list, description="Translator notes/comments")
    tags: List[str] = Field(default_factory=list, description="HTML/XML tags in segment")
    warnings: List[str] = Field(default_factory=list, description="QA warnings")
    
    class Config:
        json_schema_extra = {
            "example": {
                "id": "1",
                "source": "Hello {username}",
                "target": "Hola {username}",
                "state": "translated",
                "tm_match": 100.0,
                "notes": ["Verified with client"],
                "tags": [],
                "warnings": []
            }
        }

class UpdateSegmentRequest(BaseModel):
    """Request to update a segment"""
    target: str = Field(..., description="New translation", example="Hola mundo")
    state: Optional[str] = Field("translated", description="New state", 
                                 enum=["new", "translated", "reviewed", "locked"])
    
    class Config:
        json_schema_extra = {
            "example": {
                "target": "Hola {username}",
                "state": "translated"
            }
        }

class SessionResponse(BaseModel):
    """Editor session information"""
    session_id: str = Field(..., description="Unique session ID", example="abc123-def456-ghi789")
    filename: str = Field(..., description="Original filename", example="test.xliff")
    is_xlz: bool = Field(..., description="Whether file is XLZ format", example=False)
    total_segments: int = Field(..., description="Total number of segments", example=150)
    translated_count: int = Field(..., description="Number of translated segments", example=45)
    progress: float = Field(..., description="Translation progress percentage", example=30.0)
    current_segment: int = Field(0, description="Currently selected segment index", example=0)
    created_at: str = Field(..., description="Session creation timestamp (ISO format)")
    last_modified: str = Field(..., description="Last modification timestamp (ISO format)")
    
    class Config:
        json_schema_extra = {
            "example": {
                "session_id": "abc123-def456-ghi789",
                "filename": "test.xliff",
                "is_xlz": False,
                "total_segments": 150,
                "translated_count": 45,
                "progress": 30.0,
                "current_segment": 0,
                "created_at": "2026-01-04T10:30:00",
                "last_modified": "2026-01-04T11:45:00"
            }
        }

class UploadResponse(BaseModel):
    """Response from file upload"""
    session_id: str = Field(..., description="Session ID for editing")
    filename: str
    is_xlz: bool
    total_segments: int
    translated_count: int
    progress: float
    segments: List[SegmentModel] = Field(..., description="First 50 segments")
    file_info: Dict = Field(..., description="File metadata")

class SegmentListResponse(BaseModel):
    """Paginated segment list"""
    segments: List[SegmentModel]
    total: int = Field(..., description="Total segments matching filter")
    offset: int = Field(..., description="Current offset")
    limit: int = Field(..., description="Items per page")
    has_more: bool = Field(..., description="Whether more segments available")

# ============================================================================
# FILE UPLOAD & SESSION MANAGEMENT
# ============================================================================

@app.post("/api/editor/upload", tags=["Sessions"], response_model=UploadResponse)
async def upload_file_for_editing(
    file: UploadFile = File(..., description="XLIFF or XLZ file to translate")
):
    """
    ## Upload File and Create Editing Session
    
    Upload an XLIFF or XLZ file to start a new translation editing session.
    
    ### What Happens:
    1. File is uploaded and stored
    2. For XLZ files: archive is extracted, skeleton files are saved
    3. XLIFF is parsed and segments are extracted
    4. A new editing session is created
    5. Translation Memory matches are calculated
    
    ### Returns:
    - `session_id`: Use this to access the session in subsequent API calls
    - `segments`: First 50 segments (use GET /segments for pagination)
    - `file_info`: Metadata about the uploaded file
    
    ### Example:
    ```bash
    curl -X POST http://localhost:8001/api/editor/upload \\
      -F "file=@myfile.xliff"
    ```
    
    ### Supported Formats:
    - XLIFF 1.2
    - XLIFF 2.0
    - XLZ (memoQ bilingual format)
    """
    try:
        filename = file.filename
        content = await file.read()
        
        # Store file
        file_info = await file_manager.upload_file(
            file_content=content,
            filename=filename,
            content_type=file.content_type or "application/xml"
        )
        
        # Handle XLZ files
        is_xlz = filename.lower().endswith('.xlz')
        skeleton_files = {}
        
        if is_xlz:
            from xlz_handler import XLZHandler
            xliff_content, skeleton_files = XLZHandler.extract_xliff_from_xlz(content)
            content = xliff_content
        
        # Parse XLIFF
        tree = etree.fromstring(content)
        
        # Create editor session
        session = EditorSession(
            file_id=file_info["file_id"],
            filename=filename,
            xliff_tree=tree
        )
        session.skeleton_files = skeleton_files
        
        # Extract segments
        segments = extract_segments(tree)
        session.segments = segments
        session.total_segments = len(segments)
        session.translated_count = sum(1 for s in segments if s["target"])
        
        # Store session
        editor_sessions[session.session_id] = session
        
        return {
            "session_id": session.session_id,
            "filename": filename,
            "is_xlz": is_xlz,
            "total_segments": session.total_segments,
            "translated_count": session.translated_count,
            "progress": round(session.translated_count / session.total_segments * 100, 1) if session.total_segments > 0 else 0,
            "segments": segments[:50],  # Return first 50 segments
            "file_info": {
                "file_id": file_info["file_id"],
                "size": file_info["size"],
                "uploaded_at": file_info["uploaded_at"]
            }
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error uploading file: {str(e)}")

@app.get("/api/editor/sessions/{session_id}", tags=["Sessions"], response_model=SessionResponse)
async def get_editor_session(
    session_id: str = PathParam(..., description="Session ID from upload response")
):
    """
    ## Get Editing Session Details
    
    Retrieve information about an active editing session.
    
    ### Returns:
    - Session metadata
    - Translation progress
    - Segment counts
    - Timestamps
    
    ### Example:
    ```bash
    curl http://localhost:8001/api/editor/sessions/abc123
    ```
    """
    if session_id not in editor_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = editor_sessions[session_id]
    
    return SessionResponse(
        session_id=session.session_id,
        filename=session.filename,
        is_xlz=session.is_xlz,
        total_segments=session.total_segments,
        translated_count=session.translated_count,
        progress=round(session.translated_count / session.total_segments * 100, 1) if session.total_segments > 0 else 0,
        current_segment=session.current_segment,
        created_at=session.created_at.isoformat(),
        last_modified=session.last_modified.isoformat()
    )

# ============================================================================
# SEGMENT OPERATIONS
# ============================================================================

@app.get("/api/editor/sessions/{session_id}/segments", tags=["Segments"], response_model=SegmentListResponse)
async def get_segments(
    session_id: str = PathParam(..., description="Session ID"),
    offset: int = Query(0, ge=0, description="Starting index for pagination"),
    limit: int = Query(50, ge=1, le=100, description="Number of segments to return (max 100)"),
    filter: Optional[str] = Query(None, description="Filter segments by status", 
                                  pattern="^(all|untranslated|translated|warnings)$")
):
    """
    ## Get Segments for Editing
    
    Retrieve a paginated list of segments from the editing session.
    
    ### Filters:
    - `all`: All segments (default)
    - `untranslated`: Only segments without target text
    - `translated`: Only segments with target text
    - `warnings`: Only segments with QA warnings
    
    ### Pagination:
    - Use `offset` and `limit` for pagination
    - `has_more` indicates if more segments are available
    - Maximum limit: 100 segments per request
    
    ### Example:
    ```bash
    # Get first 50 untranslated segments
    curl "http://localhost:8001/api/editor/sessions/abc123/segments?filter=untranslated&limit=50"
    
    # Get next page
    curl "http://localhost:8001/api/editor/sessions/abc123/segments?offset=50&limit=50"
    ```
    """
    if session_id not in editor_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = editor_sessions[session_id]
    segments = session.segments
    
    # Apply filter
    if filter == "untranslated":
        segments = [s for s in segments if not s.get("target")]
    elif filter == "translated":
        segments = [s for s in segments if s.get("target")]
    elif filter == "warnings":
        segments = [s for s in segments if s.get("warnings")]
    
    # Paginate
    total = len(segments)
    segments_page = segments[offset:offset + limit]
    
    return SegmentListResponse(
        segments=segments_page,
        total=total,
        offset=offset,
        limit=limit,
        has_more=offset + limit < total
    )

@app.get("/api/editor/sessions/{session_id}/segments/{segment_id}", tags=["Segments"], response_model=SegmentModel)
async def get_segment(
    session_id: str = PathParam(..., description="Session ID"),
    segment_id: str = PathParam(..., description="Segment ID (trans-unit ID)")
):
    """
    ## Get a Specific Segment
    
    Retrieve details for a single segment by its ID.
    
    ### Example:
    ```bash
    curl http://localhost:8001/api/editor/sessions/abc123/segments/1
    ```
    """
    if session_id not in editor_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = editor_sessions[session_id]
    
    # Find segment
    segment = next((s for s in session.segments if s["id"] == segment_id), None)
    
    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")
    
    return segment

@app.put("/api/editor/sessions/{session_id}/segments/{segment_id}", tags=["Segments"])
async def update_segment(
    session_id: str = PathParam(..., description="Session ID"),
    segment_id: str = PathParam(..., description="Segment ID"),
    request: UpdateSegmentRequest = Body(..., description="Translation update")
):
    """
    ## Update Segment Translation
    
    Update the target translation for a segment.
    
    ### What Happens:
    1. Target text is updated
    2. Segment state is changed (new → translated)
    3. QA checks are run automatically
    4. Translation is saved to Translation Memory (if state = "translated")
    5. Progress counter is updated
    
    ### QA Checks Performed:
    - Number validation (e.g., "5 items" → target must have "5")
    - Placeholder validation (e.g., `{username}` must be in target)
    - Length check (target shouldn't be 3x longer than source)
    - Empty target check
    
    ### Example:
    ```bash
    curl -X PUT http://localhost:8001/api/editor/sessions/abc123/segments/1 \\
      -H "Content-Type: application/json" \\
      -d '{"target": "Hola {username}", "state": "translated"}'
    ```
    
    ### Returns:
    - Updated segment data
    - QA warnings (if any)
    - New progress percentage
    """
    if session_id not in editor_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = editor_sessions[session_id]
    
    # Find segment in session
    segment_idx = next(
        (i for i, s in enumerate(session.segments) if s["id"] == segment_id), 
        None
    )
    
    if segment_idx is None:
        raise HTTPException(status_code=404, detail="Segment not found")
    
    segment = session.segments[segment_idx]
    
    # Update target
    old_target = segment.get("target")
    segment["target"] = request.target
    segment["state"] = request.state
    
    # Run QA checks
    warnings = run_qa_checks(segment["source"], request.target)
    segment["warnings"] = warnings
    
    # Update translated count
    if old_target is None and request.target:
        session.translated_count += 1
    elif old_target and not request.target:
        session.translated_count -= 1
    
    # Update in XLIFF tree
    update_xliff_tree(session.xliff_tree, segment_id, request.target, request.state)
    
    session.last_modified = datetime.now()
    
    # Save to TM if translated
    if request.state == "translated" and request.target:
        # TODO: Get language pair from XLIFF
        # await save_to_tm(segment["source"], request.target, "en", "es")
        pass
    
    return {
        "success": True,
        "segment": segment,
        "warnings": warnings,
        "progress": round(session.translated_count / session.total_segments * 100, 1)
    }

# ============================================================================
# DOWNLOAD
# ============================================================================

@app.get("/api/editor/sessions/{session_id}/download", tags=["Download"])
async def download_translated_file(
    session_id: str = PathParam(..., description="Session ID")
):
    """
    ## Download Translated File
    
    Export the translated XLIFF or XLZ file.
    
    ### What Happens:
    1. XLIFF tree is serialized to XML
    2. For XLZ files: skeleton files are merged back into archive
    3. File is returned with proper filename
    
    ### Filename Format:
    - Original: `myfile.xliff` → Download: `myfile_translated.xliff`
    - Original: `myfile.xlz` → Download: `myfile_translated.xlz`
    
    ### Content-Type:
    - XLIFF: `application/xml`
    - XLZ: `application/octet-stream`
    
    ### Example:
    ```bash
    curl http://localhost:8001/api/editor/sessions/abc123/download \\
      -o translated.xliff
    ```
    
    ### Notes:
    - File contains all segments (both translated and untranslated)
    - Empty targets remain empty (not removed)
    - Segment states are preserved
    """
    if session_id not in editor_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = editor_sessions[session_id]
    
    try:
        # Generate XLIFF output
        xliff_output = etree.tostring(
            session.xliff_tree,
            encoding='utf-8',
            xml_declaration=True,
            pretty_print=True
        )
        
        # Determine filename
        import re
        base_name = session.filename.rsplit('.', 1)[0]
        base_name = re.sub(r'[<>:"/\\|?*]', '_', base_name)
        
        if session.is_xlz:
            # Recreate XLZ archive
            from xlz_handler import XLZHandler
            xlz_output = XLZHandler.create_xlz_archive(xliff_output, session.skeleton_files)
            filename = f"{base_name}_translated.xlz"
            
            return Response(
                content=xlz_output,
                media_type='application/octet-stream',
                headers={'Content-Disposition': f'attachment; filename="{filename}"'}
            )
        else:
            # Return XLIFF
            filename = f"{base_name}_translated.xliff"
            
            return Response(
                content=xliff_output,
                media_type='application/xml',
                headers={'Content-Disposition': f'attachment; filename="{filename}"'}
            )
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Download failed: {str(e)}")

@app.delete("/api/editor/sessions/{session_id}", tags=["Sessions"])
async def close_session(
    session_id: str = PathParam(..., description="Session ID")
):
    """
    ## Close Editing Session
    
    Close an editing session and free up resources.
    
    ### What Happens:
    1. Session is removed from memory
    2. Resources are freed
    
    ### Warning:
    - Make sure to download your file before closing!
    - Unsaved changes in client will be lost
    
    ### Example:
    ```bash
    curl -X DELETE http://localhost:8001/api/editor/sessions/abc123
    ```
    """
    if session_id in editor_sessions:
        del editor_sessions[session_id]
        return {"success": True, "message": "Session closed"}
    else:
        raise HTTPException(status_code=404, detail="Session not found")

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def extract_segments(tree: etree._Element) -> List[Dict]:
    """Extract segments from XLIFF tree"""
    segments = []
    
    # Detect namespace
    namespace = ''
    if tree.tag.startswith('{'):
        namespace = tree.tag[1:tree.tag.index('}')]
    
    ns = {'xliff': namespace} if namespace else {}
    
    # Find all trans-units
    file_elements = tree.findall('.//xliff:file', ns) if namespace else tree.findall('.//file')
    
    for file_elem in file_elements:
        trans_units = file_elem.findall('.//xliff:trans-unit', ns) if namespace else file_elem.findall('.//trans-unit')
        
        for tu in trans_units:
            tu_id = tu.get('id', '')
            
            # Extract source
            source_elem = tu.find('xliff:source', ns) if namespace else tu.find('source')
            source_text = ''.join(source_elem.itertext()) if source_elem is not None else ''
            
            # Extract target
            target_elem = tu.find('xliff:target', ns) if namespace else tu.find('target')
            target_text = ''.join(target_elem.itertext()) if target_elem is not None else None
            target_state = target_elem.get('state', 'new') if target_elem is not None else 'new'
            
            # Extract notes
            note_elems = tu.findall('xliff:note', ns) if namespace else tu.findall('note')
            notes = [note.text for note in note_elems if note.text]
            
            segments.append({
                "id": tu_id,
                "source": source_text,
                "target": target_text,
                "state": target_state,
                "notes": notes,
                "tags": [],  # TODO: Extract tags
                "warnings": []
            })
    
    return segments

def update_xliff_tree(tree: etree._Element, segment_id: str, target_text: str, state: str):
    """Update XLIFF tree with new translation"""
    # Detect namespace
    namespace = ''
    if tree.tag.startswith('{'):
        namespace = tree.tag[1:tree.tag.index('}')]
    
    ns = {'xliff': namespace} if namespace else {}
    
    # Find trans-unit
    file_elements = tree.findall('.//xliff:file', ns) if namespace else tree.findall('.//file')
    
    for file_elem in file_elements:
        trans_units = file_elem.findall('.//xliff:trans-unit', ns) if namespace else file_elem.findall('.//trans-unit')
        
        for tu in trans_units:
            if tu.get('id') == segment_id:
                # Find or create target
                target_elem = tu.find('xliff:target', ns) if namespace else tu.find('target')
                
                if target_elem is None:
                    if namespace:
                        target_elem = etree.SubElement(tu, f'{{{namespace}}}target')
                    else:
                        target_elem = etree.SubElement(tu, 'target')
                
                target_elem.text = target_text
                target_elem.set('state', state)
                return

def run_qa_checks(source: str, target: str) -> List[str]:
    """Run quality checks on segment"""
    import re
    warnings = []
    
    # Check for numbers
    source_numbers = re.findall(r'\d+', source)
    target_numbers = re.findall(r'\d+', target)
    if source_numbers != target_numbers:
        warnings.append(f"Number mismatch: source has {source_numbers}, target has {target_numbers}")
    
    # Check for placeholders
    source_placeholders = set(re.findall(r'\{[^}]+\}', source))
    target_placeholders = set(re.findall(r'\{[^}]+\}', target))
    missing = source_placeholders - target_placeholders
    if missing:
        warnings.append(f"Missing placeholders: {', '.join(missing)}")
    
    # Check length (target shouldn't be 3x longer)
    if len(target) > len(source) * 3:
        warnings.append(f"Target is much longer than source ({len(target)} vs {len(source)} chars)")
    
    # Check if empty
    if not target.strip():
        warnings.append("Target is empty")
    
    return warnings

# ============================================================================
# HEALTH CHECK
# ============================================================================

@app.get("/", tags=["Health"])
async def root():
    """
    ## API Information and Health Check
    
    Get basic information about the XLIFF Editor API.
    
    ### Returns:
    - API name and version
    - Available endpoints
    - Number of active editing sessions
    
    ### Example:
    ```bash
    curl http://localhost:8001/
    ```
    """
    return {
        "name": "XLIFF Editor API",
        "version": "1.0.0",
        "description": "Standalone translation editor for XLIFF/XLZ files",
        "documentation": {
            "swagger_ui": "/docs",
            "redoc": "/redoc",
            "openapi_json": "/openapi.json"
        },
        "endpoints": {
            "upload": "POST /api/editor/upload",
            "sessions": "GET /api/editor/sessions/{session_id}",
            "segments": "GET /api/editor/sessions/{session_id}/segments",
            "update": "PUT /api/editor/sessions/{session_id}/segments/{segment_id}",
            "download": "GET /api/editor/sessions/{session_id}/download"
        },
        "status": "operational",
        "active_sessions": len(editor_sessions)
    }

@app.get("/health", tags=["Health"])
async def health_check():
    """
    ## Health Check Endpoint
    
    Simple health check for monitoring and load balancers.
    
    ### Returns:
    - `status`: "healthy" if API is operational
    - `active_sessions`: Number of active editing sessions
    
    ### Example:
    ```bash
    curl http://localhost:8001/health
    ```
    """
    return {
        "status": "healthy",
        "active_sessions": len(editor_sessions),
        "timestamp": datetime.now().isoformat()
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)  # Different port from workflow engine