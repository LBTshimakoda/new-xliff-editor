"""
Handler for XLZ (Zipped XLIFF) files
XLZ files are ZIP archives containing:
- content.xlf (or content.xliff) - The XLIFF content
- skeleton.skl (or multiple) - Original document structure
- Other metadata files
"""

import zipfile
import io
from typing import Tuple, Dict, Optional
from lxml import etree

class XLZHandler:
    """Handler for XLZ (zipped XLIFF) files"""
    
    @staticmethod
    def is_xlz_file(filename: str) -> bool:
        """Check if filename is an XLZ file"""
        return filename.lower().endswith('.xlz')
    
    @staticmethod
    def extract_xliff_from_xlz(xlz_content: bytes) -> Tuple[bytes, Dict[str, bytes]]:
        """
        Extract XLIFF content and skeleton files from XLZ archive
        
        Returns:
            (xliff_content, other_files)
            - xliff_content: The XLIFF file content
            - other_files: Dictionary of {filename: content} for skeleton files
        """
        xliff_content = None
        other_files = {}
        
        try:
            with zipfile.ZipFile(io.BytesIO(xlz_content), 'r') as zip_ref:
                # List all files in the archive
                file_list = zip_ref.namelist()
                
                # Find the XLIFF file with multiple strategies
                # Strategy 1: Look for content.xlf or content.xliff (most common)
                xliff_candidates = [
                    f for f in file_list 
                    if f.lower().endswith(('.xlf', '.xliff')) 
                    and 'content' in f.lower()
                    and not f.endswith('/')
                ]
                
                # Strategy 2: If no content.xlf, look for any .xlf/.xliff file
                if not xliff_candidates:
                    xliff_candidates = [
                        f for f in file_list 
                        if f.lower().endswith(('.xlf', '.xliff'))
                        and not f.endswith('/')
                    ]
                
                # Strategy 3: Look in subdirectories
                if not xliff_candidates:
                    xliff_candidates = [
                        f for f in file_list 
                        if '.xlf' in f.lower() or '.xliff' in f.lower()
                    ]
                
                if not xliff_candidates:
                    raise ValueError("No XLIFF file found in XLZ archive")
                
                # Use the first XLIFF file found
                xliff_filename = xliff_candidates[0]
                xliff_content = zip_ref.read(xliff_filename)
                
                # Extract skeleton and other files
                for filename in file_list:
                    if filename != xliff_filename and not filename.endswith('/'):
                        other_files[filename] = zip_ref.read(filename)
        
        except zipfile.BadZipFile:
            raise ValueError("Invalid XLZ file: not a valid ZIP archive")
        
        if xliff_content is None:
            raise ValueError("Could not extract XLIFF content from XLZ")
        
        return xliff_content, other_files
    
    @staticmethod
    def create_xlz_archive(xliff_content: bytes, skeleton_files: Dict[str, bytes] = None) -> bytes:
        """
        Create an XLZ archive from XLIFF content and skeleton files
        
        Args:
            xliff_content: The XLIFF file content
            skeleton_files: Dictionary of {filename: content} for skeleton files
        
        Returns:
            XLZ file content as bytes
        """
        xlz_buffer = io.BytesIO()
        
        with zipfile.ZipFile(xlz_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_ref:
            # Add XLIFF content
            zip_ref.writestr('content.xlf', xliff_content)
            
            # Add skeleton files if provided
            if skeleton_files:
                for filename, content in skeleton_files.items():
                    zip_ref.writestr(filename, content)
        
        xlz_buffer.seek(0)
        return xlz_buffer.read()
    
    @staticmethod
    def list_xlz_contents(xlz_content: bytes) -> list:
        """List all files in an XLZ archive"""
        try:
            with zipfile.ZipFile(io.BytesIO(xlz_content), 'r') as zip_ref:
                files = []
                for info in zip_ref.infolist():
                    if not info.is_dir():
                        files.append({
                            'filename': info.filename,
                            'size': info.file_size,
                            'compressed_size': info.compress_size,
                            'date_time': info.date_time
                        })
                return files
        except zipfile.BadZipFile:
            raise ValueError("Invalid XLZ file: not a valid ZIP archive")
    
    @staticmethod
    def validate_xlz(xlz_content: bytes) -> Tuple[bool, str]:
        """
        Validate an XLZ file
        
        Returns:
            (is_valid, message)
        """
        try:
            xliff_content, other_files = XLZHandler.extract_xliff_from_xlz(xlz_content)
            
            # Try to parse the XLIFF
            try:
                etree.fromstring(xliff_content)
            except etree.XMLSyntaxError as e:
                return False, f"Invalid XLIFF content: {str(e)}"
            
            # Check for skeleton files
            skeleton_count = len([f for f in other_files.keys() if 'skeleton' in f.lower()])
            
            return True, f"Valid XLZ with {skeleton_count} skeleton file(s)"
            
        except Exception as e:
            return False, str(e)