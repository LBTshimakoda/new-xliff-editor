"""
XLIFF Workflow Plugins
Specialized plugins for XLIFF file processing in workflows
"""

from workflow_engine import WorkflowPlugin, StageResult, StageStatus
import asyncio
from lxml import etree
from typing import Dict, Any, List
import re
from pathlib import Path


class XliffExtractPlugin(WorkflowPlugin):
    """Extract translatable segments from XLIFF/XLZ files"""
    
    def __init__(self, file_manager=None):
        super().__init__("xliff_extract", "1.0.0")
        self.register_handler("extract", self.extract_segments)
        self.file_manager = file_manager
    
    async def extract_segments(self, config: Dict, context: Dict) -> StageResult:
        """
        Extract segments from XLIFF/XLZ file for processing
        
        Config params:
            source_language: Source language code (optional)
            target_languages: List of target language codes (optional)
        
        Context params:
            input_file_id: File ID of uploaded XLIFF/XLZ file
        """
        import time
        start_time = time.time()
        
        # Get file_id from context
        file_id = context.get("input_file_id")
        
        if not file_id:
            # Fallback to demo data if no file provided
            return await self._extract_demo_segments(config, context)
        
        try:
            # Read file from file manager
            if not self.file_manager:
                # Import here to avoid circular dependency
                from file_manager import FileManager
                self.file_manager = FileManager()
            
            file_info = await self.file_manager.get_file_info(file_id)
            if not file_info:
                return StageResult(
                    status=StageStatus.FAILED,
                    errors=[f"File not found: {file_id}"]
                )
            
            file_path = Path(file_info["file_path"])
            filename = file_info["filename"]
            
            # Read file content
            with open(file_path, 'rb') as f:
                file_content = f.read()
            
            # Check if XLZ and extract if needed
            from xlz_handler import XLZHandler
            
            if XLZHandler.is_xlz_file(filename):
                # Extract XLIFF from XLZ
                xliff_content, skeleton_files = XLZHandler.extract_xliff_from_xlz(file_content)
                file_content = xliff_content
            
            # Parse XLIFF with lxml
            tree = etree.fromstring(file_content)
            
            # Detect namespace
            namespace = ''
            if tree.tag.startswith('{'):
                namespace = tree.tag[1:tree.tag.index('}')]
            
            ns = {'xliff': namespace} if namespace else {}
            
            # Extract segments from all trans-units
            segments = []
            
            # Find all file elements
            file_elements = tree.findall('.//xliff:file', ns) if namespace else tree.findall('.//file')
            
            source_language = config.get("source_language", "en")
            target_languages = config.get("target_languages", ["es"])
            
            for file_idx, file_elem in enumerate(file_elements):
                # Get file attributes
                file_source_lang = file_elem.get('source-language', source_language)
                file_target_lang = file_elem.get('target-language', target_languages[0] if target_languages else 'es')
                original = file_elem.get('original', f'file_{file_idx}')
                
                # Find all trans-units
                trans_unit_elements = file_elem.findall('.//xliff:trans-unit', ns) if namespace else file_elem.findall('.//trans-unit')
                
                for tu_elem in trans_unit_elements:
                    tu_id = tu_elem.get('id', '')
                    
                    # Get source
                    source_elem = tu_elem.find('xliff:source', ns) if namespace else tu_elem.find('source')
                    source_text = ''
                    source_tags = []
                    if source_elem is not None:
                        source_text = ''.join(source_elem.itertext())
                        source_tags = self._extract_tags_from_element(source_elem)
                    
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
                    
                    # Build context string
                    context_parts = [original]
                    if notes:
                        context_parts.append(notes[0])
                    context_str = " > ".join(context_parts)
                    
                    segments.append({
                        "id": tu_id,
                        "source": source_text,
                        "target": target_text,
                        "state": target_state,
                        "source_tags": source_tags,
                        "context": context_str,
                        "file_index": file_idx,
                        "original": original
                    })
            
            duration_ms = int((time.time() - start_time) * 1000)
            
            return StageResult(
                status=StageStatus.COMPLETED,
                output={
                    "segments": segments,
                    "source_language": source_language,
                    "target_languages": target_languages,
                    "segment_count": len(segments),
                    "file_info": {
                        "format": "xliff_1.2",
                        "source_file": filename,
                        "is_xlz": XLZHandler.is_xlz_file(filename)
                    }
                },
                metrics={
                    "segments_extracted": len(segments),
                    "source_words": sum(len(s["source"].split()) for s in segments),
                    "duration_ms": duration_ms
                }
            )
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            return StageResult(
                status=StageStatus.FAILED,
                errors=[f"Failed to extract XLIFF segments: {str(e)}"]
            )
    
    async def _extract_demo_segments(self, config: Dict, context: Dict) -> StageResult:
        """Fallback to demo segments if no file provided"""
        await asyncio.sleep(0.5)  # Simulate parsing
        
        source_language = config.get("source_language", "en")
        target_languages = config.get("target_languages", ["es", "fr", "de"])
        
        # Generate demo segments
        segments = []
        for i in range(1, 51):  # Simulate 50 segments
            segments.append({
                "id": f"segment_{i}",
                "source": f"This is source text {i}",
                "target": "",
                "state": "new",
                "source_tags": [],
                "context": f"File > Section > Item {i}"
            })
        
        return StageResult(
            status=StageStatus.COMPLETED,
            output={
                "segments": segments,
                "source_language": source_language,
                "target_languages": target_languages,
                "segment_count": len(segments),
                "file_info": {
                    "format": "xliff_1.2",
                    "source_file": "demo.xliff"
                }
            },
            metrics={
                "segments_extracted": len(segments),
                "source_words": sum(len(s["source"].split()) for s in segments),
                "duration_ms": 500
            }
        )
    
    def _extract_tags_from_element(self, element) -> List[str]:
        """Extract XML tags from an lxml element"""
        tags = []
        for child in element:
            tag_str = etree.tostring(child, encoding='unicode')
            tags.append(tag_str)
        return tags
    
    def _extract_tags(self, text: str) -> List[str]:
        """Extract XML tags from text"""
        tags = re.findall(r'<[^>]+>', text)
        return tags


class XliffPretranslatePlugin(WorkflowPlugin):
    """Apply Translation Memory matches to XLIFF segments"""
    
    def __init__(self):
        super().__init__("xliff_pretranslate", "1.0.0")
        self.register_handler("pretranslate", self.apply_tm_matches)
    
    async def apply_tm_matches(self, config: Dict, context: Dict) -> StageResult:
        """
        Apply TM matches from previous stage to segments
        
        Config params:
            threshold: Minimum match quality (0.0-1.0)
            apply_fuzzy: Whether to apply fuzzy matches
        """
        await asyncio.sleep(1.0)  # Simulate TM lookup
        
        threshold = config.get("threshold", 0.75)
        apply_fuzzy = config.get("apply_fuzzy", True)
        
        # Get segments from extract stage
        segments = context.get("extract", {}).get("segments", [])
        tm_matches = context.get("tm_lookup", {})
        
        pretranslated = 0
        fuzzy_matches = 0
        
        for segment in segments:
            # Simulate TM match
            import random
            match_score = random.uniform(0.5, 1.0)
            
            if match_score >= threshold:
                if match_score == 1.0:
                    # Perfect match
                    segment["target"] = f"[TM 100%] {segment['source']}"
                    segment["state"] = "translated"
                    segment["match_quality"] = 1.0
                    segment["match_type"] = "exact"
                    pretranslated += 1
                elif apply_fuzzy and match_score >= threshold:
                    # Fuzzy match
                    segment["target"] = f"[TM {int(match_score*100)}%] {segment['source']}"
                    segment["state"] = "needs-review-translation"
                    segment["match_quality"] = match_score
                    segment["match_type"] = "fuzzy"
                    fuzzy_matches += 1
        
        return StageResult(
            status=StageStatus.COMPLETED,
            output={
                "segments": segments,
                "pretranslated_count": pretranslated,
                "fuzzy_matches_count": fuzzy_matches,
                "pretranslation_rate": (pretranslated + fuzzy_matches) / len(segments) if segments else 0,
                "threshold_used": threshold
            },
            metrics={
                "segments_pretranslated": pretranslated,
                "fuzzy_matches": fuzzy_matches,
                "pretranslation_rate": (pretranslated + fuzzy_matches) / len(segments) if segments else 0,
                "duration_ms": 1000
            }
        )


class XliffMachineTranslatePlugin(WorkflowPlugin):
    """Machine translate untranslated XLIFF segments"""
    
    def __init__(self):
        super().__init__("xliff_mt", "1.0.0")
        self.register_handler("translate", self.machine_translate)
    
    async def machine_translate(self, config: Dict, context: Dict) -> StageResult:
        """
        Machine translate segments without TM matches
        
        Config params:
            provider: MT provider (google, deepl, azure)
            skip_pretranslated: Skip segments already translated
            quality: Quality level (fast, balanced, high)
        """
        await asyncio.sleep(2.0)  # Simulate MT API calls
        
        provider = config.get("provider", "google_translate")
        skip_pretranslated = config.get("skip_pretranslated", True)
        quality = config.get("quality", "balanced")
        
        # Get segments from pretranslate stage
        segments = context.get("pretranslate", {}).get("segments", [])
        
        translated = 0
        for segment in segments:
            # Skip if already translated
            if skip_pretranslated and segment.get("target"):
                continue
            
            # Machine translate
            segment["target"] = f"[MT-{provider}] {segment['source']}"
            segment["state"] = "translated"
            segment["translation_provider"] = provider
            segment["translation_quality"] = quality
            translated += 1
        
        return StageResult(
            status=StageStatus.COMPLETED,
            output={
                "segments": segments,
                "mt_translated_count": translated,
                "provider": provider,
                "quality_level": quality,
                "total_translated": sum(1 for s in segments if s.get("target"))
            },
            metrics={
                "segments_translated": translated,
                "provider": provider,
                "api_calls": translated,
                "estimated_cost": translated * 0.001,  # $0.001 per segment
                "duration_ms": 2000
            }
        )


class XliffValidatePlugin(WorkflowPlugin):
    """Validate XLIFF structure and translation quality"""
    
    def __init__(self):
        super().__init__("xliff_validate", "1.0.0")
        self.register_handler("validate", self.validate_xliff)
    
    async def validate_xliff(self, config: Dict, context: Dict) -> StageResult:
        """
        Validate XLIFF file integrity and translations
        
        Config params:
            check_tags: Validate tag consistency
            check_placeholders: Validate placeholders
            check_length: Check length constraints
            check_terminology: Validate terminology
        """
        await asyncio.sleep(1.0)  # Simulate validation
        
        check_tags = config.get("check_tags", True)
        check_placeholders = config.get("check_placeholders", True)
        check_length = config.get("check_length", False)
        
        # Get segments
        segments = context.get("ollama_translate", {}).get("segments", [])
        if not segments:
            segments = context.get("mt_translate", {}).get("segments", [])
        if not segments:
            segments = context.get("pretranslate", {}).get("segments", [])
        if not segments:
            segments = context.get("extract", {}).get("segments", [])
        
        issues = []
        warnings = []
        
        for segment in segments:
            segment_id = segment.get("id", "unknown")
            
            # Check for empty targets
            if not segment.get("target"):
                issues.append({
                    "segment_id": segment_id,
                    "type": "missing_translation",
                    "severity": "error",
                    "message": "Segment has no translation"
                })
            
            # Check tag consistency
            if check_tags:
                source_tags = segment.get("source_tags", [])
                target_tags = self._extract_tags(segment.get("target", ""))
                
                if len(source_tags) != len(target_tags):
                    issues.append({
                        "segment_id": segment_id,
                        "type": "tag_mismatch",
                        "severity": "error",
                        "message": f"Tag count mismatch: source has {len(source_tags)}, target has {len(target_tags)}"
                    })
            
            # Check length (if enabled)
            if check_length:
                source_len = len(segment.get("source", ""))
                target_len = len(segment.get("target", ""))
                
                if target_len > source_len * 1.5:
                    warnings.append({
                        "segment_id": segment_id,
                        "type": "length_warning",
                        "severity": "warning",
                        "message": f"Target is {int((target_len/source_len)*100)}% longer than source"
                    })
        
        has_errors = any(i["severity"] == "error" for i in issues)
        
        return StageResult(
            status=StageStatus.FAILED if has_errors else StageStatus.COMPLETED,
            output={
                "valid": not has_errors,
                "segments": segments,
                "issues": issues,
                "warnings": warnings,
                "error_count": len([i for i in issues if i["severity"] == "error"]),
                "warning_count": len(warnings),
                "validation_summary": {
                    "total_segments": len(segments),
                    "validated_segments": len(segments),
                    "passed": len(segments) - len(issues),
                    "failed": len(issues)
                }
            },
            metrics={
                "issues_found": len(issues),
                "warnings_found": len(warnings),
                "validation_time_ms": 1000
            }
        )
    
    def _extract_tags(self, text: str) -> List[str]:
        """Extract XML tags from text"""
        tags = re.findall(r'<[^>]+>', text)
        return tags


class XliffExportPlugin(WorkflowPlugin):
    """Export XLIFF to various formats"""
    
    def __init__(self):
        super().__init__("xliff_export", "1.0.0")
        self.register_handler("export", self.export_xliff)
    
    async def export_xliff(self, config: Dict, context: Dict) -> StageResult:
        """
        Export validated XLIFF file
        
        Config params:
            format: Output format (xliff_1.2, xliff_2.0, sdlxliff, tmx)
            include_metadata: Include workflow metadata
        """
        await asyncio.sleep(0.5)  # Simulate export
        
        format_type = config.get("format", "xliff_1.2")
        include_metadata = config.get("include_metadata", True)
        
        # Get validated segments
        segments = context.get("validate", {}).get("segments", [])
        
        # Simulate export
        exported_file = {
            "format": format_type,
            "segments": segments,
            "metadata": {
                "workflow": "translation_pipeline",
                "date": "2025-01-01T00:00:00Z",
                "source_language": context.get("extract", {}).get("source_language", "en"),
                "target_language": context.get("extract", {}).get("target_languages", ["es"])[0]
            } if include_metadata else {}
        }
        
        return StageResult(
            status=StageStatus.COMPLETED,
            output={
                "exported_file": exported_file,
                "format": format_type,
                "segment_count": len(segments),
                "file_size_bytes": len(str(exported_file)),
                "download_url": f"/api/xliff/download/{context.get('xliff_file_id', 'abc123')}"
            },
            metrics={
                "segments_exported": len(segments),
                "file_size_kb": len(str(exported_file)) / 1024,
                "duration_ms": 500
            }
        )


# Registration function
def register_xliff_plugins(plugin_registry, file_manager=None):
    """Register all XLIFF workflow plugins"""
    
    # Pass file_manager to extract plugin
    extract_plugin = XliffExtractPlugin(file_manager)
    plugin_registry.register(extract_plugin)
    
    pretranslate_plugin = XliffPretranslatePlugin()
    plugin_registry.register(pretranslate_plugin)
    
    mt_plugin = XliffMachineTranslatePlugin()
    plugin_registry.register(mt_plugin)
    
    validate_plugin = XliffValidatePlugin()
    plugin_registry.register(validate_plugin)
    
    export_plugin = XliffExportPlugin()
    plugin_registry.register(export_plugin)
    
    print("✅ All XLIFF plugins registered successfully")


# Example workflow definition using XLIFF plugins
XLIFF_TRANSLATION_WORKFLOW = {
    "name": "XLIFF Translation Pipeline",
    "description": "Complete translation workflow for XLIFF files",
    "stages": [
        {
            "name": "extract",
            "type": "custom",
            "config": {
                "plugin": "xliff_extract",
                "handler": "extract",
                "source_language": "en",
                "target_languages": ["es", "fr", "de"]
            },
            "dependencies": [],
            "position": {"x": 100, "y": 200}
        },
        {
            "name": "tm_lookup",
            "type": "custom",
            "config": {
                "plugin": "translation_memory",
                "handler": "tm_lookup"
            },
            "dependencies": ["extract"],
            "position": {"x": 300, "y": 200}
        },
        {
            "name": "pretranslate",
            "type": "custom",
            "config": {
                "plugin": "xliff_pretranslate",
                "handler": "pretranslate",
                "threshold": 0.75,
                "apply_fuzzy": True
            },
            "dependencies": ["tm_lookup"],
            "position": {"x": 500, "y": 200}
        },
        {
            "name": "mt_translate",
            "type": "custom",
            "config": {
                "plugin": "xliff_mt",
                "handler": "translate",
                "provider": "google_translate",
                "skip_pretranslated": True,
                "quality": "balanced"
            },
            "dependencies": ["pretranslate"],
            "position": {"x": 700, "y": 200}
        },
        {
            "name": "validate",
            "type": "custom",
            "config": {
                "plugin": "xliff_validate",
                "handler": "validate",
                "check_tags": True,
                "check_placeholders": True,
                "check_length": True
            },
            "dependencies": ["mt_translate"],
            "position": {"x": 900, "y": 200}
        },
        {
            "name": "export",
            "type": "custom",
            "config": {
                "plugin": "xliff_export",
                "handler": "export",
                "format": "xliff_1.2",
                "include_metadata": True
            },
            "dependencies": ["validate"],
            "position": {"x": 1100, "y": 200}
        }
    ],
    "variables": {
        "source_language": "en",
        "target_languages": ["es", "fr", "de"]
    }
}
