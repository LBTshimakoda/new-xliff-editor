"""
Translation Memory Database Manager
Handles multiple TM databases with access control
"""
import os
import json
from typing import List, Dict, Optional
from pathlib import Path
from datetime import datetime


class TMDatabaseManager:
    """Manages multiple TM databases with access control"""
    
    def __init__(self, registry_path: str = "./tm_registry.json"):
        self.registry_path = registry_path
        self.registry: Dict[str, Dict] = {}
        self.active_connections: Dict[str, any] = {}
        self.load_registry()
    
    def load_registry(self):
        """Load TM database registry from JSON file"""
        if os.path.exists(self.registry_path):
            try:
                with open(self.registry_path, 'r') as f:
                    self.registry = json.load(f)
            except Exception as e:
                print(f"Error loading registry: {e}")
                self.registry = {}
        else:
            self.registry = {}
            self.save_registry()
    
    def save_registry(self):
        """Save TM database registry to JSON file"""
        try:
            with open(self.registry_path, 'w') as f:
                json.dump(self.registry, f, indent=2)
        except Exception as e:
            print(f"Error saving registry: {e}")
    
    def create_database(
        self, 
        name: str, 
        description: str = "",
        owner: str = "admin",
        access_type: str = "private"  # private, shared, public
    ) -> Dict:
        """
        Create a new TM database
        
        Args:
            name: Database name (unique identifier)
            description: Database description
            owner: Owner username
            access_type: "private", "shared", or "public"
        
        Returns:
            Database info dict
        """
        # Import here to avoid circular dependency
        from plugins.tm_plugin import TranslationMemoryDB
        
        if name in self.registry:
            raise ValueError(f"Database '{name}' already exists")
        
        # Create database file path
        db_dir = Path("./tm_databases")
        db_dir.mkdir(exist_ok=True)
        db_path = db_dir / f"{name}.db"
        
        # Initialize database
        tm_db = TranslationMemoryDB(db_path=str(db_path))
        
        # Register in registry
        db_info = {
            "name": name,
            "description": description,
            "path": str(db_path),
            "owner": owner,
            "access_type": access_type,
            "created_at": datetime.now().isoformat(),
            "created_by": owner,
            "allowed_users": [owner],  # Owner always has access
            "allowed_projects": [],
            "stats": {
                "total_entries": 0,
                "last_used": None
            }
        }
        
        self.registry[name] = db_info
        self.save_registry()
        
        return db_info
    
    def list_databases(self, user: str = "admin") -> List[Dict]:
        """
        List TM databases accessible by user
        
        Args:
            user: Username to check access for
        
        Returns:
            List of accessible database info dicts
        """
        accessible = []
        
        for name, db_info in self.registry.items():
            if self.check_access(name, user):
                accessible.append(db_info)
        
        return accessible
    
    def check_access(self, db_name: str, user: str = "admin") -> bool:
        """
        Check if user has access to database
        
        Args:
            db_name: Database name
            user: Username
        
        Returns:
            True if user has access, False otherwise
        """
        if db_name not in self.registry:
            return False
        
        db_info = self.registry[db_name]
        access_type = db_info.get("access_type", "private")
        
        # Public databases accessible to everyone
        if access_type == "public":
            return True
        
        # Owner always has access
        if db_info.get("owner") == user:
            return True
        
        # Check allowed users list
        if user in db_info.get("allowed_users", []):
            return True
        
        return False
    
    def grant_access(self, db_name: str, user: str, granter: str = "admin") -> bool:
        """
        Grant user access to database
        
        Args:
            db_name: Database name
            user: Username to grant access to
            granter: Username performing the grant (must be owner)
        
        Returns:
            True if successful, False otherwise
        """
        if db_name not in self.registry:
            raise ValueError(f"Database '{db_name}' not found")
        
        db_info = self.registry[db_name]
        
        # Only owner can grant access
        if db_info.get("owner") != granter:
            raise PermissionError(f"Only owner can grant access to '{db_name}'")
        
        # Add user to allowed list
        allowed_users = db_info.get("allowed_users", [])
        if user not in allowed_users:
            allowed_users.append(user)
            db_info["allowed_users"] = allowed_users
            self.save_registry()
            return True
        
        return False
    
    def revoke_access(self, db_name: str, user: str, revoker: str = "admin") -> bool:
        """
        Revoke user access to database
        
        Args:
            db_name: Database name
            user: Username to revoke access from
            revoker: Username performing the revocation (must be owner)
        
        Returns:
            True if successful, False otherwise
        """
        if db_name not in self.registry:
            raise ValueError(f"Database '{db_name}' not found")
        
        db_info = self.registry[db_name]
        
        # Only owner can revoke access
        if db_info.get("owner") != revoker:
            raise PermissionError(f"Only owner can revoke access to '{db_name}'")
        
        # Cannot revoke owner's access
        if user == db_info.get("owner"):
            raise PermissionError("Cannot revoke owner's access")
        
        # Remove user from allowed list
        allowed_users = db_info.get("allowed_users", [])
        if user in allowed_users:
            allowed_users.remove(user)
            db_info["allowed_users"] = allowed_users
            self.save_registry()
            return True
        
        return False
    
    def change_access_type(
        self, 
        db_name: str, 
        access_type: str, 
        changer: str = "admin"
    ) -> bool:
        """
        Change database access type
        
        Args:
            db_name: Database name
            access_type: "private", "shared", or "public"
            changer: Username performing the change (must be owner)
        
        Returns:
            True if successful, False otherwise
        """
        if db_name not in self.registry:
            raise ValueError(f"Database '{db_name}' not found")
        
        if access_type not in ["private", "shared", "public"]:
            raise ValueError(f"Invalid access type: {access_type}")
        
        db_info = self.registry[db_name]
        
        # Only owner can change access type
        if db_info.get("owner") != changer:
            raise PermissionError(f"Only owner can change access type for '{db_name}'")
        
        db_info["access_type"] = access_type
        self.save_registry()
        return True
    
    def connect_to_database(self, db_name: str, user: str = "admin"):
        """
        Connect to TM database
        
        Args:
            db_name: Database name
            user: Username requesting connection
        
        Returns:
            TranslationMemoryDB instance
        
        Raises:
            PermissionError: If user doesn't have access
            ValueError: If database doesn't exist
        """
        # Import here to avoid circular dependency
        from plugins.tm_plugin import TranslationMemoryDB
        
        if db_name not in self.registry:
            raise ValueError(f"Database '{db_name}' not found")
        
        if not self.check_access(db_name, user):
            raise PermissionError(f"User '{user}' doesn't have access to '{db_name}'")
        
        # Return cached connection if exists
        if db_name in self.active_connections:
            return self.active_connections[db_name]
        
        # Create new connection
        db_info = self.registry[db_name]
        db_path = db_info["path"]
        
        if not os.path.exists(db_path):
            raise FileNotFoundError(f"Database file not found: {db_path}")
        
        tm_db = TranslationMemoryDB(db_path=db_path)
        self.active_connections[db_name] = tm_db
        
        # Update last used
        db_info["stats"]["last_used"] = datetime.now().isoformat()
        self.save_registry()
        
        return tm_db
    
    def delete_database(self, db_name: str, deleter: str = "admin") -> bool:
        """
        Delete TM database (owner only)
        
        Args:
            db_name: Database name
            deleter: Username performing deletion (must be owner)
        
        Returns:
            True if successful
        """
        if db_name not in self.registry:
            raise ValueError(f"Database '{db_name}' not found")
        
        db_info = self.registry[db_name]
        
        # Only owner can delete
        if db_info.get("owner") != deleter:
            raise PermissionError(f"Only owner can delete '{db_name}'")
        
        # Remove from active connections
        if db_name in self.active_connections:
            del self.active_connections[db_name]
        
        # Delete database file
        db_path = db_info["path"]
        if os.path.exists(db_path):
            os.remove(db_path)
        
        # Remove from registry
        del self.registry[db_name]
        self.save_registry()
        
        return True
    
    def get_database_info(self, db_name: str, user: str = "admin") -> Dict:
        """
        Get database information
        
        Args:
            db_name: Database name
            user: Username requesting info
        
        Returns:
            Database info dict
        """
        if db_name not in self.registry:
            raise ValueError(f"Database '{db_name}' not found")
        
        if not self.check_access(db_name, user):
            raise PermissionError(f"User '{user}' doesn't have access to '{db_name}'")
        
        return self.registry[db_name].copy()
    
    def update_stats(self, db_name: str, total_entries: int):
        """Update database statistics"""
        if db_name in self.registry:
            self.registry[db_name]["stats"]["total_entries"] = total_entries
            self.registry[db_name]["stats"]["last_used"] = datetime.now().isoformat()
            self.save_registry()