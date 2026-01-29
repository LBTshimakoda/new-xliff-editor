"""
XLIFF Editor API - Standalone Translation Editor
Self-contained version with no external dependencies
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
import io
import zipfile
import re

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

# In-memory storage for editor sessions
editor_sessions = {}

class EditorSession:
    """Represents an active XLIFF editing session"""
    def __init__(self, file_id: str, filename: str, xliff_tree: etree._Element, file_content: bytes):
        self.session_id = str(uuid.uuid4())
        self.file_id = file_id
        self.filename = filename
        self.xliff_tree = xliff_tree
        self.file_content = file_content  # Store original file
        self.created_at = datetime.now()
        self.last_modified = datetime.now()
        self.is_xlz = filename.lower().endswith('.xlz')
        self.skeleton_files = {}
        self.segments = []
        self.current_segment = 0
        self.total_segments = 0
        self.translated_count = 0
        self.auto_save_enabled = True
        self.source_language = "UNKNOWN"
        self.target_language = "UNKNOWN"

# Pydantic Models
class SegmentModel(BaseModel):
    """Segment data model"""
    id: str = Field(..., description="Unique segment identifier (trans-unit ID)", example="1")
    source: str = Field(..., description="Source text to translate", example="Hello {username}")
    target: Optional[str] = Field(None, description="Translated text", example="Hola {username}")
    state: str = Field("new", description="Segment state", example="translated")
    tm_match: Optional[float] = Field(None, description="TM match percentage (0-100)", example=95.5)
    notes: List[str] = Field(default_factory=list, description="Translator notes/comments")
    tags: List[str] = Field(default_factory=list, description="HTML/XML tags in segment")
    warnings: List[str] = Field(default_factory=list, description="QA warnings")

class UpdateSegmentRequest(BaseModel):
    """Request to update a segment"""
    target: str = Field(..., description="New translation", example="Hola mundo")
    state: Optional[str] = Field("translated", description="New state")

class SessionResponse(BaseModel):
    """Editor session information"""
    session_id: str = Field(..., description="Unique session ID")
    filename: str = Field(..., description="Original filename")
    is_xlz: bool = Field(..., description="Whether file is XLZ format")
    total_segments: int = Field(..., description="Total number of segments")
    translated_count: int = Field(..., description="Number of translated segments")
    progress: float = Field(..., description="Translation progress percentage")
    current_segment: int = Field(0, description="Currently selected segment index")
    created_at: str = Field(..., description="Session creation timestamp (ISO format)")
    last_modified: str = Field(..., description="Last modification timestamp (ISO format)")
    source_language: str = Field(..., description="Source language code")
    target_language: str = Field(..., description="Target language code")

class UploadResponse(BaseModel):
    """Response from file upload"""
    session_id: str
    filename: str
    is_xlz: bool
    total_segments: int
    translated_count: int
    progress: float
    segments: List[SegmentModel]
    file_info: Dict
    source_language: str
    target_language: str

class SegmentListResponse(BaseModel):
    """Paginated segment list"""
    segments: List[SegmentModel]
    total: int
    offset: int
    limit: int
    has_more: bool

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
    """
    try:
        filename = file.filename
        content = await file.read()
        
        file_id = str(uuid.uuid4())
        
        # Handle XLZ files
        is_xlz = filename.lower().endswith('.xlz')
        skeleton_files = {}
        
        if is_xlz:
            # Extract XLIFF from XLZ
            xliff_content, skeleton_files = extract_xliff_from_xlz(content)
            content_to_parse = xliff_content
        else:
            content_to_parse = content
        
        # Parse XLIFF
        tree = etree.fromstring(content_to_parse)
        
        # Extract languages from XLIFF
        source_lang, target_lang = extract_languages(tree)
        
        # Create editor session
        session = EditorSession(
            file_id=file_id,
            filename=filename,
            xliff_tree=tree,
            file_content=content
        )
        session.skeleton_files = skeleton_files
        session.source_language = source_lang
        session.target_language = target_lang
        
        # Extract segments
        segments = extract_segments(tree)
        session.segments = segments
        session.total_segments = len(segments)
        session.translated_count = sum(1 for s in segments if s.get("target"))
        
        # Store session
        editor_sessions[session.session_id] = session
        
        print(f"✅ Created session {session.session_id} with {session.total_segments} segments")
        print(f"📦 Total sessions in memory: {len(editor_sessions)}")
        print(f"🔑 Session keys: {list(editor_sessions.keys())}")
        print(f"🌍 Languages: {session.source_language} → {session.target_language}")
        
        return UploadResponse(
            session_id=session.session_id,
            filename=filename,
            is_xlz=is_xlz,
            total_segments=session.total_segments,
            translated_count=session.translated_count,
            progress=round(session.translated_count / session.total_segments * 100, 1) if session.total_segments > 0 else 0,
            segments=segments[:50],  # Return first 50 segments
            file_info={
                "file_id": file_id,
                "size": len(content),
                "uploaded_at": datetime.now().isoformat()
            },
            source_language=session.source_language,
            target_language=session.target_language
        )
        
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
    """
    print(f"🔍 Looking for session: {session_id}")
    print(f"📦 Current sessions in memory: {len(editor_sessions)}")
    print(f"🔑 Available session IDs: {list(editor_sessions.keys())}")
    
    if session_id not in editor_sessions:
        print(f"❌ Session not found: {session_id}")
        raise HTTPException(status_code=404, detail=f"Session not found: {session_id}")
    
    print(f"✅ Session found!")
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
        last_modified=session.last_modified.isoformat(),
        source_language=session.source_language,
        target_language=session.target_language
    )

# ============================================================================
# SEGMENT OPERATIONS
# ============================================================================

@app.get("/api/editor/sessions/{session_id}/segments", tags=["Segments"], response_model=SegmentListResponse)
async def get_segments(
    session_id: str = PathParam(..., description="Session ID"),
    offset: int = Query(0, ge=0, description="Starting index for pagination"),
    limit: int = Query(50, ge=1, le=100, description="Number of segments to return (max 100)"),
    filter: Optional[str] = Query(None, description="Filter segments by status: untranslated, translated, warnings")
):
    """
    ## Get Segments for Editing
    
    Retrieve a paginated list of segments from the editing session.
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
    """
    if session_id not in editor_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = editor_sessions[session_id]
    
    # Find segment
    segment = next((s for s in session.segments if s["id"] == segment_id), None)
    
    if not segment:
        raise HTTPException(status_code=404, detail="Segment not found")
    
    return SegmentModel(**segment)

@app.put("/api/editor/sessions/{session_id}/segments/{segment_id}", tags=["Segments"])
async def update_segment(
    session_id: str = PathParam(..., description="Session ID"),
    segment_id: str = PathParam(..., description="Segment ID"),
    request: UpdateSegmentRequest = Body(..., description="Translation update")
):
    """
    ## Update Segment Translation
    
    Update the target translation for a segment.
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
    
    print(f"✅ Updated segment {segment_id}: {request.target[:50]}...")
    
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
        base_name = session.filename.rsplit('.', 1)[0]
        base_name = re.sub(r'[<>:"/\\|?*]', '_', base_name)
        
        if session.is_xlz:
            # Recreate XLZ archive
            xlz_output = create_xlz_archive(xliff_output, session.skeleton_files)
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
    """
    if session_id in editor_sessions:
        del editor_sessions[session_id]
        return {"success": True, "message": "Session closed"}
    else:
        raise HTTPException(status_code=404, detail="Session not found")

# ============================================================================
# MACHINE TRANSLATION
# ============================================================================

@app.post("/api/editor/translate", tags=["Translation"])
async def translate_with_mt(
    source_text: str = Body(..., description="Text to translate"),
    source_lang: str = Body(..., description="Source language code (e.g., EN)"),
    target_lang: str = Body(..., description="Target language code (e.g., ES)"),
    model: str = Body("qwen2.5:14b", description="Ollama model to use"),
    ollama_url: str = Body("http://localhost:11434", description="Ollama API URL")
):
    """
    ## Translate Text with Machine Translation
    
    Translate source text using Ollama LLM (local machine translation).
    
    **Supported Models:**
    - qwen2.5:14b (Recommended)
    - llama3.1:8b
    - mistral:7b
    - gemma2:9b
    
    **Example Request:**
    ```json
    {
      "source_text": "Hello world",
      "source_lang": "EN",
      "target_lang": "ES",
      "model": "qwen2.5:14b"
    }
    ```
    """
    try:
        import requests as req
        
        # Construct translation prompt
        prompt = f"""Translate the following text from {source_lang} to {target_lang}.
Return ONLY the translation without any explanations, notes, or additional text.

Text to translate:
{source_text}

Translation:"""

        # Call Ollama API
        print(f"🤖 Translating with {model}: {source_text[:50]}...")
        
        response = req.post(
            f"{ollama_url}/api/generate",
            json={
                "model": model,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.3,  # Lower temperature for more consistent translations
                    "top_p": 0.9,
                }
            },
            timeout=60
        )
        
        if response.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail=f"Ollama API error: {response.text}"
            )
        
        result = response.json()
        translation = result.get("response", "").strip()
        
        print(f"✅ Translation: {translation[:50]}...")
        
        return {
            "success": True,
            "translation": translation,
            "model": model,
            "source_lang": source_lang,
            "target_lang": target_lang
        }
        
    except req.exceptions.ConnectionError:
        raise HTTPException(
            status_code=503,
            detail="Cannot connect to Ollama. Make sure Ollama is running on " + ollama_url
        )
    except req.exceptions.Timeout:
        raise HTTPException(
            status_code=504,
            detail="Ollama request timed out. The model might be too large or not downloaded."
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Translation failed: {str(e)}"
        )

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def extract_languages(tree: etree._Element) -> tuple[str, str]:
    """Extract source and target languages from XLIFF file"""
    # Detect namespace
    namespace = ''
    if tree.tag.startswith('{'):
        namespace = tree.tag[1:tree.tag.index('}')]
    
    ns = {'xliff': namespace} if namespace else {}
    
    # Find file element
    file_elements = tree.findall('.//xliff:file', ns) if namespace else tree.findall('.//file')
    
    if file_elements:
        file_elem = file_elements[0]
        
        # Try XLIFF 1.2 attributes
        source_lang = file_elem.get('source-language')
        target_lang = file_elem.get('target-language')
        
        # Try XLIFF 2.0 attributes if 1.2 not found
        if not source_lang:
            source_lang = file_elem.get('srcLang')
        if not target_lang:
            target_lang = file_elem.get('trgLang')
        
        # Extract just the language code (e.g., "en-US" → "EN")
        if source_lang:
            source_lang = source_lang.split('-')[0].upper()
        if target_lang:
            target_lang = target_lang.split('-')[0].upper()
            
        return source_lang or 'UNKNOWN', target_lang or 'UNKNOWN'
    
    return 'UNKNOWN', 'UNKNOWN'

def extract_xliff_from_xlz(xlz_content: bytes) -> tuple[bytes, dict]:
    """Extract XLIFF and skeleton files from XLZ archive"""
    skeleton_files = {}
    xliff_content = None
    
    with zipfile.ZipFile(io.BytesIO(xlz_content), 'r') as zf:
        for filename in zf.namelist():
            content = zf.read(filename)
            
            if filename.lower().endswith(('.xlf', '.xliff')):
                xliff_content = content
            else:
                skeleton_files[filename] = content
    
    if xliff_content is None:
        raise ValueError("No XLIFF file found in XLZ archive")
    
    return xliff_content, skeleton_files

def create_xlz_archive(xliff_content: bytes, skeleton_files: dict) -> bytes:
    """Create XLZ archive from XLIFF and skeleton files"""
    buffer = io.BytesIO()
    
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        # Add XLIFF file
        zf.writestr('document.xlf', xliff_content)
        
        # Add skeleton files
        for filename, content in skeleton_files.items():
            zf.writestr(filename, content)
    
    return buffer.getvalue()

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
                "tags": [],
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
    """
    return {
        "status": "healthy",
        "active_sessions": len(editor_sessions),
        "timestamp": datetime.now().isoformat()
    }

if __name__ == "__main__":
    import uvicorn
    print("🚀 Starting XLIFF Editor API on http://localhost:8001")
    print("📚 API Documentation: http://localhost:8001/docs")
    uvicorn.run(app, host="0.0.0.0", port=8001)