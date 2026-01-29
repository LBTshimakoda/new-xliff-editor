"""
File Manager for Workflow Engine
Handles file uploads, storage, metadata, and downloads
"""

import os
import uuid
import aiofiles
import hashlib
from datetime import datetime
from typing import Optional, Dict, Any, List
from pathlib import Path
import mimetypes


class FileManager:
    """Manages file uploads and storage for workflow engine"""
    
    def __init__(self, storage_path: str = "./uploads"):
        """
        Initialize file manager
        
        Args:
            storage_path: Base directory for file storage
        """
        self.storage_path = Path(storage_path)
        self.storage_path.mkdir(parents=True, exist_ok=True)
        
        # In-memory metadata store (will use Redis in production)
        self.file_metadata: Dict[str, Dict[str, Any]] = {}
    
    async def upload_file(
        self, 
        file_content: bytes, 
        filename: str,
        content_type: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Upload and store a file
        
        Args:
            file_content: File content as bytes
            filename: Original filename
            content_type: MIME type (auto-detected if None)
            metadata: Optional metadata dict
            
        Returns:
            Dict with file_id, filename, size, etc.
        """
        # Generate unique file ID
        file_id = str(uuid.uuid4())
        
        # Get file extension and detect content type
        file_ext = Path(filename).suffix
        if not content_type:
            content_type, _ = mimetypes.guess_type(filename)
            if not content_type:
                content_type = "application/octet-stream"
        
        # Calculate file hash for deduplication
        file_hash = hashlib.sha256(file_content).hexdigest()
        
        # Store file on disk
        file_path = self.storage_path / f"{file_id}{file_ext}"
        async with aiofiles.open(file_path, 'wb') as f:
            await f.write(file_content)
        
        # Create metadata record
        file_info = {
            "file_id": file_id,
            "filename": filename,
            "original_filename": filename,
            "file_path": str(file_path),
            "size": len(file_content),
            "content_type": content_type,
            "file_hash": file_hash,
            "uploaded_at": datetime.now().isoformat(),
            "metadata": metadata or {}
        }
        
        # Store metadata
        self.file_metadata[file_id] = file_info
        
        return file_info
    
    async def get_file_info(self, file_id: str) -> Optional[Dict[str, Any]]:
        """
        Get file metadata
        
        Args:
            file_id: File identifier
            
        Returns:
            File metadata dict or None if not found
        """
        return self.file_metadata.get(file_id)
    
    async def get_file_path(self, file_id: str) -> Optional[Path]:
        """
        Get file path on disk
        
        Args:
            file_id: File identifier
            
        Returns:
            Path object or None if file not found
        """
        file_info = await self.get_file_info(file_id)
        if not file_info:
            return None
        
        file_path = Path(file_info["file_path"])
        if not file_path.exists():
            return None
        
        return file_path
    
    async def read_file(self, file_id: str) -> Optional[bytes]:
        """
        Read file content
        
        Args:
            file_id: File identifier
            
        Returns:
            File content as bytes or None if not found
        """
        file_path = await self.get_file_path(file_id)
        if not file_path:
            return None
        
        async with aiofiles.open(file_path, 'rb') as f:
            content = await f.read()
        
        return content
    
    async def delete_file(self, file_id: str) -> bool:
        """
        Delete a file and its metadata
        
        Args:
            file_id: File identifier
            
        Returns:
            True if deleted, False if not found
        """
        file_path = await self.get_file_path(file_id)
        if not file_path:
            return False
        
        # Delete file from disk
        try:
            file_path.unlink()
        except Exception as e:
            print(f"Error deleting file {file_id}: {e}")
            return False
        
        # Remove metadata
        if file_id in self.file_metadata:
            del self.file_metadata[file_id]
        
        return True
    
    async def list_files(self, limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
        """
        List all files with pagination
        
        Args:
            limit: Maximum number of files to return
            offset: Offset for pagination
            
        Returns:
            List of file metadata dicts
        """
        files = list(self.file_metadata.values())
        
        # Sort by upload date (newest first)
        files.sort(key=lambda x: x["uploaded_at"], reverse=True)
        
        # Apply pagination
        return files[offset:offset + limit]
    
    async def cleanup_old_files(self, days: int = 7) -> int:
        """
        Delete files older than specified days
        
        Args:
            days: Age threshold in days
            
        Returns:
            Number of files deleted
        """
        from datetime import timedelta
        
        now = datetime.now()
        threshold = now - timedelta(days=days)
        deleted_count = 0
        
        for file_id, file_info in list(self.file_metadata.items()):
            uploaded_at = datetime.fromisoformat(file_info["uploaded_at"])
            
            if uploaded_at < threshold:
                if await self.delete_file(file_id):
                    deleted_count += 1
        
        return deleted_count
    
    def get_storage_stats(self) -> Dict[str, Any]:
        """
        Get storage statistics
        
        Returns:
            Dict with file count, total size, etc.
        """
        total_size = sum(info["size"] for info in self.file_metadata.values())
        file_count = len(self.file_metadata)
        
        # Get file types distribution
        file_types = {}
        for info in self.file_metadata.values():
            content_type = info["content_type"]
            file_types[content_type] = file_types.get(content_type, 0) + 1
        
        return {
            "file_count": file_count,
            "total_size_bytes": total_size,
            "total_size_mb": round(total_size / (1024 * 1024), 2),
            "file_types": file_types,
            "storage_path": str(self.storage_path)
        }


class FileManagerWithRedis(FileManager):
    """File manager with Redis-backed metadata storage"""
    
    def __init__(self, storage_path: str = "./uploads", redis_client=None):
        super().__init__(storage_path)
        self.redis_client = redis_client
    
    async def upload_file(
        self, 
        file_content: bytes, 
        filename: str,
        content_type: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Upload file and store metadata in Redis"""
        
        # Use parent method to handle file storage
        file_info = await super().upload_file(file_content, filename, content_type, metadata)
        
        # Store metadata in Redis if available
        if self.redis_client:
            import json
            await self.redis_client.set(
                f"file:{file_info['file_id']}",
                json.dumps(file_info),
                ex=7 * 24 * 60 * 60  # 7 days TTL
            )
        
        return file_info
    
    async def get_file_info(self, file_id: str) -> Optional[Dict[str, Any]]:
        """Get file metadata from Redis"""
        
        if self.redis_client:
            import json
            data = await self.redis_client.get(f"file:{file_id}")
            if data:
                return json.loads(data)
        
        # Fallback to in-memory
        return await super().get_file_info(file_id)
    
    async def delete_file(self, file_id: str) -> bool:
        """Delete file and remove from Redis"""
        
        success = await super().delete_file(file_id)
        
        if success and self.redis_client:
            await self.redis_client.delete(f"file:{file_id}")
        
        return success


# Utility functions
def get_file_extension(filename: str) -> str:
    """Extract file extension from filename"""
    return Path(filename).suffix.lower()


def is_allowed_file(filename: str, allowed_extensions: List[str]) -> bool:
    """Check if file extension is allowed"""
    ext = get_file_extension(filename)
    return ext in [e if e.startswith('.') else f'.{e}' for e in allowed_extensions]


def format_file_size(size_bytes: int) -> str:
    """Format file size in human-readable format"""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.1f} TB"