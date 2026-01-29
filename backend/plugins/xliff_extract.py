"""
Real XLIFF Extract Plugin
Parses actual XLIFF files and extracts trans-units for workflow processing
"""

import xml.etree.ElementTree as ET
from typing import Dict, Any, List, Optional
from pathlib import Path
from dataclasses import dataclass
from workflow_engine import WorkflowPlugin, StageResult, StageStatus


@dataclass
class TransUnit:
    """Represents a translation unit"""
    id: str
    source: str
    target: str
    state: str = "new"
    approved: bool = False
    translated: bool = False
    note: str = ""
    source_tags: List[str] = None
    target_tags: List[str] = None
    
    def __post_init__(self):
        if self.source_tags is None:
            self.source_tags = []
        if self.target_tags is None:
            self.target_tags = []


class XliffParser:
    """Parser for XLIFF 1.2 files"""
    
    # XLIFF namespaces
    XLIFF_NS = {
        'xliff': 'urn:oasis:names:tc:xliff:document:1.2',
        'xliff12': 'urn:oasis:names:tc:xliff:document:1.2',
        'xliff20': 'urn:oasis:names:tc:xliff:document:2.0'
    }
    
    def __init__(self):
        self.source_language = None
        self.target_language = None
        self.file_count = 0
        self.trans_units = []
    
    def parse_file(self, file_path: str) -> Dict[str, Any]:
        """
        Parse XLIFF file and extract trans-units
        
        Args:
            file_path: Path to XLIFF file
            
        Returns:
            Dict with parsed data
        """
        path = Path(file_path)
        
        if not path.exists():
            raise FileNotFoundError(f"XLIFF file not found: {file_path}")
        
        # Parse XML
        tree = ET.parse(file_path)
        root = tree.getroot()
        
        # Detect XLIFF version and namespace
        namespace = self._detect_namespace(root)
        
        # Parse based on version
        if 'xliff:document:2.0' in namespace:
            return self._parse_xliff_20(root, namespace)
        else:
            return self._parse_xliff_12(root, namespace)
    
    def _detect_namespace(self, root: ET.Element) -> str:
        """Detect XLIFF namespace from root element"""
        # Get namespace from root tag
        if root.tag.startswith('{'):
            namespace = root.tag[1:root.tag.index('}')]
            return namespace
        return ""
    
    def _parse_xliff_12(self, root: ET.Element, namespace: str) -> Dict[str, Any]:
        """Parse XLIFF 1.2 format"""
        self.trans_units = []
        
        # Setup namespace prefix
        ns = {'xliff': namespace} if namespace else {}
        
        # Find all file elements
        if namespace:
            file_elements = root.findall('.//xliff:file', ns)
        else:
            file_elements = root.findall('.//file')
        
        if not file_elements:
            # Try without namespace
            file_elements = root.findall('.//file')
        
        self.file_count = len(file_elements)
        
        # Get source and target languages from first file
        if file_elements:
            first_file = file_elements[0]
            self.source_language = first_file.get('source-language', 'en')
            self.target_language = first_file.get('target-language', 'es')
        
        # Extract all trans-units
        for file_elem in file_elements:
            if namespace:
                trans_unit_elements = file_elem.findall('.//xliff:trans-unit', ns)
            else:
                trans_unit_elements = file_elem.findall('.//trans-unit')
            
            for tu_elem in trans_unit_elements:
                trans_unit = self._parse_trans_unit_12(tu_elem, namespace, ns)
                if trans_unit:
                    self.trans_units.append(trans_unit)
        
        return {
            "source_language": self.source_language,
            "target_language": self.target_language,
            "file_count": self.file_count,
            "trans_units": self.trans_units,
            "xliff_version": "1.2"
        }
    
    def _parse_trans_unit_12(
        self, 
        tu_elem: ET.Element, 
        namespace: str, 
        ns: Dict[str, str]
    ) -> Optional[TransUnit]:
        """Parse a single trans-unit element (XLIFF 1.2)"""
        
        # Get ID
        unit_id = tu_elem.get('id', '')
        
        # Get source element
        if namespace:
            source_elem = tu_elem.find('xliff:source', ns)
            target_elem = tu_elem.find('xliff:target', ns)
            note_elem = tu_elem.find('xliff:note', ns)
        else:
            source_elem = tu_elem.find('source')
            target_elem = tu_elem.find('target')
            note_elem = tu_elem.find('note')
        
        # Extract text content (including tail text after tags)
        source_text = self._extract_text_content(source_elem) if source_elem is not None else ""
        target_text = self._extract_text_content(target_elem) if target_elem is not None else ""
        note_text = note_elem.text if note_elem is not None and note_elem.text else ""
        
        # Get state
        state = target_elem.get('state', 'new') if target_elem is not None else 'new'
        
        # Determine if translated/approved
        translated = bool(target_text and target_text.strip())
        approved = state in ['final', 'signed-off']
        
        # Extract tags
        source_tags = self._extract_tags(source_elem) if source_elem is not None else []
        target_tags = self._extract_tags(target_elem) if target_elem is not None else []
        
        return TransUnit(
            id=unit_id,
            source=source_text,
            target=target_text,
            state=state,
            approved=approved,
            translated=translated,
            note=note_text,
            source_tags=source_tags,
            target_tags=target_tags
        )
    
    def _parse_xliff_20(self, root: ET.Element, namespace: str) -> Dict[str, Any]:
        """Parse XLIFF 2.0 format"""
        # Simplified XLIFF 2.0 support
        # XLIFF 2.0 has different structure: <unit> instead of <trans-unit>
        
        self.trans_units = []
        
        ns = {'xliff': namespace}
        
        # Find all unit elements
        unit_elements = root.findall('.//xliff:unit', ns)
        
        # Get languages from root
        self.source_language = root.get('srcLang', 'en')
        self.target_language = root.get('trgLang', 'es')
        
        for unit_elem in unit_elements:
            trans_unit = self._parse_unit_20(unit_elem, ns)
            if trans_unit:
                self.trans_units.append(trans_unit)
        
        return {
            "source_language": self.source_language,
            "target_language": self.target_language,
            "file_count": 1,
            "trans_units": self.trans_units,
            "xliff_version": "2.0"
        }
    
    def _parse_unit_20(self, unit_elem: ET.Element, ns: Dict[str, str]) -> Optional[TransUnit]:
        """Parse a single unit element (XLIFF 2.0)"""
        
        unit_id = unit_elem.get('id', '')
        
        # Find segment element
        segment = unit_elem.find('xliff:segment', ns)
        if segment is None:
            return None
        
        # Get source and target
        source_elem = segment.find('xliff:source', ns)
        target_elem = segment.find('xliff:target', ns)
        
        source_text = self._extract_text_content(source_elem) if source_elem is not None else ""
        target_text = self._extract_text_content(target_elem) if target_elem is not None else ""
        
        # Get state
        state = segment.get('state', 'initial')
        
        translated = bool(target_text and target_text.strip())
        approved = state == 'final'
        
        return TransUnit(
            id=unit_id,
            source=source_text,
            target=target_text,
            state=state,
            approved=approved,
            translated=translated
        )
    
    def _extract_text_content(self, elem: ET.Element) -> str:
        """
        Extract all text content from element, including text after inline tags
        
        For example:
        <source>Click <g id="1">here</g> to continue</source>
        Should extract: "Click here to continue"
        """
        if elem is None:
            return ""
        
        # Start with element's direct text
        text_parts = [elem.text] if elem.text else []
        
        # Add text from all children (including tail text)
        for child in elem:
            if child.text:
                text_parts.append(child.text)
            if child.tail:
                text_parts.append(child.tail)
        
        return ''.join(text_parts).strip()
    
    def _extract_tags(self, elem: ET.Element) -> List[str]:
        """Extract inline tags from element"""
        if elem is None:
            return []
        
        tags = []
        for child in elem:
            # Get tag name without namespace
            tag_name = child.tag
            if '}' in tag_name:
                tag_name = tag_name.split('}')[1]
            
            # Store tag info
            tag_id = child.get('id', '')
            tags.append(f"<{tag_name} id='{tag_id}'>")
        
        return tags


class RealXliffExtractPlugin(WorkflowPlugin):
    """Real XLIFF extraction plugin that parses actual XLIFF files"""
    
    def __init__(self):
        super().__init__("xliff_extract_real", "1.0.0")
        self.register_handler("extract", self.extract_segments)
        print("✅ Real XLIFF Extract Plugin initialized")
    
    async def extract_segments(self, config: Dict, context: Dict) -> StageResult:
        """
        Extract segments from uploaded XLIFF file
        
        Config:
            source_language: Expected source language (optional)
            target_languages: Expected target languages (optional)
            
        Context:
            input_file_path: Path to uploaded XLIFF file (from file upload)
        """
        import asyncio
        await asyncio.sleep(0.1)  # Small delay for async
        
        # Get file path from context
        file_path = context.get("input_file_path")
        
        if not file_path:
            return StageResult(
                status=StageStatus.FAILED,
                errors=["No input file provided. Upload an XLIFF file first."]
            )
        
        try:
            # Parse XLIFF file
            parser = XliffParser()
            xliff_data = parser.parse_file(file_path)
            
            # Convert TransUnit objects to dicts for JSON serialization
            segments = []
            for tu in xliff_data["trans_units"]:
                segments.append({
                    "id": tu.id,
                    "source": tu.source,
                    "target": tu.target,
                    "state": tu.state,
                    "approved": tu.approved,
                    "translated": tu.translated,
                    "note": tu.note,
                    "source_tags": tu.source_tags,
                    "target_tags": tu.target_tags
                })
            
            # Calculate statistics
            translated_count = sum(1 for s in segments if s["translated"])
            approved_count = sum(1 for s in segments if s["approved"])
            
            return StageResult(
                status=StageStatus.COMPLETED,
                output={
                    "segments": segments,
                    "source_language": xliff_data["source_language"],
                    "target_language": xliff_data["target_language"],
                    "segment_count": len(segments),
                    "file_count": xliff_data["file_count"],
                    "xliff_version": xliff_data["xliff_version"],
                    "translated_count": translated_count,
                    "approved_count": approved_count,
                    "file_info": {
                        "path": file_path,
                        "name": context.get("input_filename", "unknown.xliff")
                    }
                },
                metrics={
                    "segments_extracted": len(segments),
                    "source_words": sum(len(s["source"].split()) for s in segments),
                    "translated_segments": translated_count,
                    "translation_rate": translated_count / len(segments) if segments else 0,
                    "duration_ms": 100
                }
            )
        
        except FileNotFoundError as e:
            return StageResult(
                status=StageStatus.FAILED,
                errors=[f"File not found: {str(e)}"]
            )
        
        except ET.ParseError as e:
            return StageResult(
                status=StageStatus.FAILED,
                errors=[f"Invalid XLIFF XML: {str(e)}"]
            )
        
        except Exception as e:
            return StageResult(
                status=StageStatus.FAILED,
                errors=[f"Error parsing XLIFF: {str(e)}"]
            )


def register_real_xliff_extract_plugin(plugin_registry):
    """Register the real XLIFF extract plugin"""
    extract_plugin = RealXliffExtractPlugin()
    plugin_registry.register(extract_plugin)
    print("✅ Real XLIFF Extract plugin registered")


# For testing
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python xliff_extract.py <xliff_file>")
        sys.exit(1)
    
    file_path = sys.argv[1]
    
    print(f"Testing XLIFF parser with: {file_path}")
    print("="*60)
    
    try:
        parser = XliffParser()
        result = parser.parse_file(file_path)
        
        print(f"\n✅ Successfully parsed XLIFF file")
        print(f"   Version: {result['xliff_version']}")
        print(f"   Source language: {result['source_language']}")
        print(f"   Target language: {result['target_language']}")
        print(f"   Files: {result['file_count']}")
        print(f"   Trans-units: {len(result['trans_units'])}")
        
        # Show first few trans-units
        print(f"\n📝 Sample trans-units:")
        for i, tu in enumerate(result['trans_units'][:5], 1):
            print(f"\n   {i}. ID: {tu.id}")
            print(f"      Source: {tu.source[:80]}...")
            print(f"      Target: {tu.target[:80] if tu.target else '(empty)'}...")
            print(f"      State: {tu.state}")
            print(f"      Translated: {tu.translated}")
        
        if len(result['trans_units']) > 5:
            print(f"\n   ... and {len(result['trans_units']) - 5} more")
        
        print("\n" + "="*60)
        print("✅ XLIFF parser test successful!")
        
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)