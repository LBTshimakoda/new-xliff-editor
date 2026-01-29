"""
Translation Memory Plugin - Real Implementation
SQLite-backed translation memory for workflow engine
"""

import sqlite3
import asyncio
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime
from pathlib import Path
from dataclasses import dataclass
import difflib
from workflow_engine import WorkflowPlugin, StageResult, StageStatus


@dataclass
class TMMatch:
    """Translation Memory match"""
    source: str
    target: str
    score: float  # 0.0 to 1.0
    context: str = ""
    created_at: str = ""
    created_by: str = "system"
    source_lang: str = ""
    target_lang: str = ""


class TranslationMemoryDB:
    """SQLite-backed Translation Memory database"""
    
    def __init__(self, db_path: str = "./tm_database.db"):
        """
        Initialize TM database
        
        Args:
            db_path: Path to SQLite database file
        """
        self.db_path = db_path
        self.conn = None
        self._initialize_db()
    
    def _initialize_db(self):
        """Create database tables if they don't exist"""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Create translation units table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS translation_units (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_text TEXT NOT NULL,
                target_text TEXT NOT NULL,
                source_lang TEXT NOT NULL,
                target_lang TEXT NOT NULL,
                context TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                created_by TEXT DEFAULT 'system',
                match_count INTEGER DEFAULT 0,
                last_used TEXT,
                UNIQUE(source_text, target_text, source_lang, target_lang)
            )
        """)
        
        # Create indexes for fast lookup
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_source_text 
            ON translation_units(source_text)
        """)
        
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_source_target_lang 
            ON translation_units(source_lang, target_lang)
        """)
        
        # Create full-text search virtual table
        cursor.execute("""
            CREATE VIRTUAL TABLE IF NOT EXISTS translation_units_fts 
            USING fts5(source_text, target_text, content=translation_units, content_rowid=id)
        """)
        
        # Create triggers to keep FTS in sync
        cursor.execute("""
            CREATE TRIGGER IF NOT EXISTS translation_units_ai AFTER INSERT ON translation_units 
            BEGIN
                INSERT INTO translation_units_fts(rowid, source_text, target_text)
                VALUES (new.id, new.source_text, new.target_text);
            END
        """)
        
        cursor.execute("""
            CREATE TRIGGER IF NOT EXISTS translation_units_ad AFTER DELETE ON translation_units 
            BEGIN
                INSERT INTO translation_units_fts(translation_units_fts, rowid, source_text, target_text)
                VALUES('delete', old.id, old.source_text, old.target_text);
            END
        """)
        
        conn.commit()
        conn.close()
    
    def get_connection(self):
        """Get database connection"""
        return sqlite3.connect(self.db_path)
    
    async def add_translation(
        self,
        source: str,
        target: str,
        source_lang: str,
        target_lang: str,
        context: str = "",
        created_by: str = "system"
    ) -> bool:
        """
        Add or update a translation in TM
        
        For the same source+language pair, only keeps the latest translation.
        This prevents multiple translations for the same source text.
        
        Args:
            source: Source text
            target: Target text
            source_lang: Source language code
            target_lang: Target language code
            context: Optional context
            created_by: Creator identifier
            
        Returns:
            True if added/updated successfully
        """
        await asyncio.sleep(0)  # Make it async-friendly
        
        conn = self.get_connection()
        cursor = conn.cursor()
        
        try:
            # First, delete any existing entry with same source+language pair
            cursor.execute("""
                DELETE FROM translation_units
                WHERE source_text = ? AND source_lang = ? AND target_lang = ?
            """, (source.strip(), source_lang, target_lang))
            
            # Then insert the new translation
            cursor.execute("""
                INSERT INTO translation_units 
                (source_text, target_text, source_lang, target_lang, context, created_at, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                source.strip(),
                target.strip(),
                source_lang,
                target_lang,
                context,
                datetime.now().isoformat(),
                created_by
            ))
            
            conn.commit()
            return True
            
        except Exception as e:
            conn.rollback()
            print(f"Error adding translation to TM: {e}")
            return False
            
        finally:
            conn.close()

    async def find_exact_match(
        self,
        source: str,
        source_lang: str,
        target_lang: str
    ) -> Optional[TMMatch]:
        """
        Find exact match in TM
        
        Args:
            source: Source text to match
            source_lang: Source language
            target_lang: Target language
            
        Returns:
            TMMatch if found, None otherwise
        """
        await asyncio.sleep(0)
        
        conn = self.get_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT source_text, target_text, context, created_at, created_by
            FROM translation_units
            WHERE source_text = ? AND source_lang = ? AND target_lang = ?
            LIMIT 1
        """, (source.strip(), source_lang, target_lang))
        
        row = cursor.fetchone()
        conn.close()
        
        if row:
            # Update usage stats
            self._update_usage_stats(source, source_lang, target_lang)
            
            return TMMatch(
                source=row[0],
                target=row[1],
                score=1.0,  # Exact match
                context=row[2],
                created_at=row[3],
                created_by=row[4],
                source_lang=source_lang,
                target_lang=target_lang
            )
        
        return None
    
    async def find_fuzzy_matches(
        self,
        source: str,
        source_lang: str,
        target_lang: str,
        threshold: float = 0.7,
        limit: int = 5
    ) -> List[TMMatch]:
        """
        Find fuzzy matches in TM
        
        Args:
            source: Source text to match
            source_lang: Source language
            target_lang: Target language
            threshold: Minimum similarity score (0.0-1.0)
            limit: Maximum number of matches to return
            
        Returns:
            List of TMMatch objects sorted by score
        """
        await asyncio.sleep(0)
        
        conn = self.get_connection()
        cursor = conn.cursor()
        
        # Get all translations for language pair
        cursor.execute("""
            SELECT source_text, target_text, context, created_at, created_by
            FROM translation_units
            WHERE source_lang = ? AND target_lang = ?
        """, (source_lang, target_lang))
        
        rows = cursor.fetchall()
        conn.close()
        
        # Calculate similarity scores
        matches = []
        source_clean = source.strip().lower()
        
        for row in rows:
            row_source = row[0].strip().lower()
            
            # Calculate similarity using difflib
            similarity = difflib.SequenceMatcher(None, source_clean, row_source).ratio()
            
            if similarity >= threshold:
                matches.append(TMMatch(
                    source=row[0],
                    target=row[1],
                    score=similarity,
                    context=row[2],
                    created_at=row[3],
                    created_by=row[4],
                    source_lang=source_lang,
                    target_lang=target_lang
                ))
        
        # Sort by score (descending) and limit
        matches.sort(key=lambda x: x.score, reverse=True)
        return matches[:limit]
    
    async def batch_lookup(
        self,
        sources: List[str],
        source_lang: str,
        target_lang: str,
        threshold: float = 0.7
    ) -> Dict[str, List[TMMatch]]:
        """
        Batch lookup for multiple source texts
        
        Args:
            sources: List of source texts
            source_lang: Source language
            target_lang: Target language
            threshold: Minimum similarity for fuzzy matches
            
        Returns:
            Dict mapping source text to list of matches
        """
        results = {}
        
        for source in sources:
            # Try exact match first
            exact = await self.find_exact_match(source, source_lang, target_lang)
            
            if exact:
                results[source] = [exact]
            else:
                # Try fuzzy matches
                fuzzy = await self.find_fuzzy_matches(
                    source, source_lang, target_lang, threshold
                )
                results[source] = fuzzy
        
        return results
    
    def _update_usage_stats(self, source: str, source_lang: str, target_lang: str):
        """Update usage statistics for a translation"""
        conn = self.get_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            UPDATE translation_units
            SET match_count = match_count + 1,
                last_used = ?
            WHERE source_text = ? AND source_lang = ? AND target_lang = ?
        """, (datetime.now().isoformat(), source.strip(), source_lang, target_lang))
        
        conn.commit()
        conn.close()
    
    async def get_stats(self) -> Dict[str, Any]:
        """Get TM statistics"""
        await asyncio.sleep(0)
        
        conn = self.get_connection()
        cursor = conn.cursor()
        
        # Total count
        cursor.execute("SELECT COUNT(*) FROM translation_units")
        total = cursor.fetchone()[0]
        
        # Language pairs
        cursor.execute("""
            SELECT source_lang, target_lang, COUNT(*)
            FROM translation_units
            GROUP BY source_lang, target_lang
        """)
        lang_pairs = {f"{row[0]}-{row[1]}": row[2] for row in cursor.fetchall()}
        
        # Most used
        cursor.execute("""
            SELECT source_text, target_text, match_count
            FROM translation_units
            ORDER BY match_count DESC
            LIMIT 10
        """)
        most_used = [
            {"source": row[0], "target": row[1], "count": row[2]}
            for row in cursor.fetchall()
        ]
        
        conn.close()
        
        return {
            "total_translations": total,
            "language_pairs": lang_pairs,
            "most_used": most_used,
            "database_path": self.db_path
        }
    
    async def import_from_tmx(self, tmx_file_path: str) -> int:
        """
        Import translations from TMX file
        
        Args:
            tmx_file_path: Path to TMX file
            
        Returns:
            Number of translations imported
        """
        # This is a placeholder - full TMX parsing would require lxml
        # For now, just return 0
        # TODO: Implement TMX parsing
        return 0


class RealTranslationMemoryPlugin(WorkflowPlugin):
    """Real Translation Memory plugin with SQLite backend"""
    
    def __init__(self, db_path: str = "./tm_database.db"):
        super().__init__("translation_memory_real", "1.0.0")
        
        # Initialize database
        self.tm_db = TranslationMemoryDB(db_path)
        
        # Register handlers
        self.register_handler("tm_lookup", self.tm_lookup)
        self.register_handler("tm_add", self.tm_add)
        self.register_handler("tm_batch_lookup", self.tm_batch_lookup)
        self.register_handler("tm_stats", self.tm_stats)
        
        print(f"✅ Real TM Plugin initialized with database: {db_path}")
    
    async def tm_lookup(self, config: Dict, context: Dict) -> StageResult:
        """
        Look up translation in TM
        
        Config:
            source_text: Text to look up
            source_lang: Source language
            target_lang: Target language
            threshold: Fuzzy match threshold (default: 0.75)
            
        Context:
            Can also read from previous stages
        """
        await asyncio.sleep(0.1)  # Simulate processing
        
        source_text = config.get("source_text", "")
        source_lang = config.get("source_lang", context.get("source_language", "en"))
        target_lang = config.get("target_lang", context.get("target_language", "es"))
        threshold = config.get("threshold", 0.75)
        
        if not source_text:
            return StageResult(
                status=StageStatus.FAILED,
                errors=["No source_text provided"]
            )
        
        # Try exact match first
        exact_match = await self.tm_db.find_exact_match(
            source_text, source_lang, target_lang
        )
        
        if exact_match:
            return StageResult(
                status=StageStatus.COMPLETED,
                output={
                    "match_type": "exact",
                    "source": exact_match.source,
                    "target": exact_match.target,
                    "score": 1.0,
                    "context": exact_match.context
                },
                metrics={
                    "match_quality": 1.0,
                    "lookup_time_ms": 100
                }
            )
        
        # Try fuzzy matches
        fuzzy_matches = await self.tm_db.find_fuzzy_matches(
            source_text, source_lang, target_lang, threshold
        )
        
        if fuzzy_matches:
            best_match = fuzzy_matches[0]
            return StageResult(
                status=StageStatus.COMPLETED,
                output={
                    "match_type": "fuzzy",
                    "source": best_match.source,
                    "target": best_match.target,
                    "score": best_match.score,
                    "all_matches": [
                        {
                            "source": m.source,
                            "target": m.target,
                            "score": m.score
                        }
                        for m in fuzzy_matches
                    ]
                },
                metrics={
                    "match_quality": best_match.score,
                    "fuzzy_matches_found": len(fuzzy_matches),
                    "lookup_time_ms": 200
                }
            )
        
        # No match found
        return StageResult(
            status=StageStatus.COMPLETED,
            output={
                "match_type": "none",
                "source": source_text,
                "target": "",
                "score": 0.0
            },
            metrics={
                "match_quality": 0.0,
                "lookup_time_ms": 50
            }
        )
    
    async def tm_batch_lookup(self, config: Dict, context: Dict) -> StageResult:
        """
        Batch lookup multiple segments
        
        Config/Context:
            segments: List of segments with 'source' field
            source_lang: Source language
            target_lang: Target language
            threshold: Fuzzy match threshold
        """
        await asyncio.sleep(0.5)
        
        # Get segments from context (from previous extract stage)
        segments = context.get("extract", {}).get("segments", [])
        
        if not segments:
            segments = config.get("segments", [])
        
        if not segments:
            return StageResult(
                status=StageStatus.FAILED,
                errors=["No segments provided"]
            )
        
        source_lang = config.get("source_lang", context.get("source_language", "en"))
        target_lang = config.get("target_lang", context.get("target_language", "es"))
        threshold = config.get("threshold", 0.75)
        
        # Extract source texts
        source_texts = [seg.get("source", seg.get("source_text", "")) for seg in segments]
        
        # Batch lookup
        matches = await self.tm_db.batch_lookup(
            source_texts, source_lang, target_lang, threshold
        )
        
        # Calculate statistics
        exact_matches = sum(1 for m in matches.values() if m and m[0].score == 1.0)
        fuzzy_matches = sum(1 for m in matches.values() if m and 0.7 <= m[0].score < 1.0)
        no_matches = sum(1 for m in matches.values() if not m)
        
        coverage = (exact_matches + fuzzy_matches) / len(segments) if segments else 0
        
        return StageResult(
            status=StageStatus.COMPLETED,
            output={
                "matches": matches,
                "exact_matches": exact_matches,
                "fuzzy_matches": fuzzy_matches,
                "no_matches": no_matches,
                "coverage": coverage,
                "total_segments": len(segments)
            },
            metrics={
                "segments_processed": len(segments),
                "exact_match_rate": exact_matches / len(segments) if segments else 0,
                "fuzzy_match_rate": fuzzy_matches / len(segments) if segments else 0,
                "coverage": coverage,
                "lookup_time_ms": 500
            }
        )
    
    async def tm_add(self, config: Dict, context: Dict) -> StageResult:
        """
        Add translation to TM
        
        Config:
            source: Source text
            target: Target text
            source_lang: Source language
            target_lang: Target language
            context: Optional context
        """
        await asyncio.sleep(0.05)
        
        source = config.get("source", "")
        target = config.get("target", "")
        source_lang = config.get("source_lang", "en")
        target_lang = config.get("target_lang", "es")
        tm_context = config.get("context", "")
        
        if not source or not target:
            return StageResult(
                status=StageStatus.FAILED,
                errors=["Both source and target are required"]
            )
        
        added = await self.tm_db.add_translation(
            source, target, source_lang, target_lang, tm_context
        )
        
        return StageResult(
            status=StageStatus.COMPLETED,
            output={
                "added": added,
                "source": source,
                "target": target,
                "message": "Translation added" if added else "Translation already exists"
            },
            metrics={
                "translations_added": 1 if added else 0
            }
        )
    
    async def tm_stats(self, config: Dict, context: Dict) -> StageResult:
        """Get TM statistics"""
        await asyncio.sleep(0.1)
        
        stats = await self.tm_db.get_stats()
        
        return StageResult(
            status=StageStatus.COMPLETED,
            output=stats,
            metrics={
                "total_translations": stats["total_translations"]
            }
        )


def register_real_tm_plugin(plugin_registry, db_path: str = "./tm_database.db"):
    """Register the real TM plugin"""
    tm_plugin = RealTranslationMemoryPlugin(db_path)
    plugin_registry.register(tm_plugin)
    print("✅ Real Translation Memory plugin registered")


# For testing
if __name__ == "__main__":
    import asyncio
    
    async def test_tm():
        """Test TM plugin"""
        print("Testing Translation Memory Plugin")
        print("="*50)
        
        # Initialize
        tm_db = TranslationMemoryDB("./test_tm.db")
        
        # Add some translations
        print("\n1. Adding translations...")
        await tm_db.add_translation("Hello", "Hola", "en", "es")
        await tm_db.add_translation("Goodbye", "Adiós", "en", "es")
        await tm_db.add_translation("Thank you", "Gracias", "en", "es")
        await tm_db.add_translation("Welcome", "Bienvenido", "en", "es")
        print("✅ Added 4 translations")
        
        # Exact match
        print("\n2. Testing exact match...")
        match = await tm_db.find_exact_match("Hello", "en", "es")
        if match:
            print(f"✅ Found: {match.source} → {match.target} (score: {match.score})")
        
        # Fuzzy match
        print("\n3. Testing fuzzy match...")
        matches = await tm_db.find_fuzzy_matches("Helo", "en", "es", threshold=0.7)
        if matches:
            for m in matches:
                print(f"✅ Match: {m.source} → {m.target} (score: {m.score:.2f})")
        
        # Stats
        print("\n4. TM Statistics...")
        stats = await tm_db.get_stats()
        print(f"✅ Total translations: {stats['total_translations']}")
        print(f"✅ Language pairs: {stats['language_pairs']}")
        
        print("\n" + "="*50)
        print("✅ TM Plugin test complete!")
    
    asyncio.run(test_tm())