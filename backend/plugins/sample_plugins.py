"""
Sample Custom Plugin for Workflow Engine
Demonstrates how to create and register custom plugins
"""

from workflow_engine import WorkflowPlugin, StageResult, StageStatus
import asyncio
import random


class GitHubIntegrationPlugin(WorkflowPlugin):
    """Plugin for GitHub integration in workflows"""
    
    def __init__(self):
        super().__init__("github_integration", "1.0.0")
        
        # Register handlers for different GitHub operations
        self.register_handler("create_pr", self.create_pull_request)
        self.register_handler("check_pr_status", self.check_pr_status)
        self.register_handler("merge_pr", self.merge_pull_request)
    
    async def create_pull_request(self, config: dict, context: dict) -> StageResult:
        """Create a pull request with translated content"""
        await asyncio.sleep(1)  # Simulate API call
        
        pr_number = random.randint(100, 999)
        
        return StageResult(
            status=StageStatus.COMPLETED,
            output={
                "pr_number": pr_number,
                "pr_url": f"https://github.com/user/repo/pull/{pr_number}",
                "title": config.get("title", "Translation Update"),
                "branch": config.get("branch", "i18n-update")
            },
            metrics={
                "api_calls": 1,
                "duration_ms": 1000
            }
        )
    
    async def check_pr_status(self, config: dict, context: dict) -> StageResult:
        """Check pull request status"""
        await asyncio.sleep(0.5)
        
        pr_number = context.get("pr_number", 0)
        
        return StageResult(
            status=StageStatus.COMPLETED,
            output={
                "pr_number": pr_number,
                "status": "open",
                "reviews": 2,
                "checks_passed": True
            },
            metrics={
                "api_calls": 1,
                "duration_ms": 500
            }
        )
    
    async def merge_pull_request(self, config: dict, context: dict) -> StageResult:
        """Merge a pull request"""
        await asyncio.sleep(1)
        
        pr_number = context.get("pr_number", 0)
        
        return StageResult(
            status=StageStatus.COMPLETED,
            output={
                "pr_number": pr_number,
                "merge_commit": "abc123def456",
                "merged_at": "2024-01-15T10:30:00Z"
            },
            metrics={
                "api_calls": 1,
                "duration_ms": 1000
            }
        )


class TranslationMemoryPlugin(WorkflowPlugin):
    """Plugin for Translation Memory operations"""
    
    def __init__(self):
        super().__init__("translation_memory", "1.0.0")
        
        self.register_handler("tm_lookup", self.tm_lookup)
        self.register_handler("tm_update", self.tm_update)
    
    async def tm_lookup(self, config: dict, context: dict) -> StageResult:
        """Look up translations in TM"""
        await asyncio.sleep(0.8)
        
        # Simulate TM lookup
        units = context.get("extracted_units", 100)
        exact_matches = int(units * 0.3)
        fuzzy_matches = int(units * 0.2)
        
        return StageResult(
            status=StageStatus.COMPLETED,
            output={
                "total_units": units,
                "exact_matches": exact_matches,
                "fuzzy_matches": fuzzy_matches,
                "no_matches": units - exact_matches - fuzzy_matches,
                "coverage": (exact_matches + fuzzy_matches) / units
            },
            metrics={
                "lookup_time_ms": 800,
                "tm_size": 50000
            }
        )
    
    async def tm_update(self, config: dict, context: dict) -> StageResult:
        """Update Translation Memory with new translations"""
        await asyncio.sleep(0.5)
        
        return StageResult(
            status=StageStatus.COMPLETED,
            output={
                "units_added": context.get("translated_units", 100),
                "tm_updated": True
            },
            metrics={
                "update_time_ms": 500
            }
        )


class QualityAssurancePlugin(WorkflowPlugin):
    """Advanced QA checks plugin"""
    
    def __init__(self):
        super().__init__("advanced_qa", "1.0.0")
        
        self.register_handler("linguistic_qa", self.linguistic_qa)
        self.register_handler("technical_qa", self.technical_qa)
    
    async def linguistic_qa(self, config: dict, context: dict) -> StageResult:
        """Perform linguistic quality checks"""
        await asyncio.sleep(1.5)
        
        # Simulate QA checks
        issues = []
        if random.random() > 0.7:
            issues.append({"type": "spelling", "severity": "warning", "count": 2})
        if random.random() > 0.8:
            issues.append({"type": "grammar", "severity": "error", "count": 1})
        
        return StageResult(
            status=StageStatus.COMPLETED,
            output={
                "quality_score": 0.92 if not issues else 0.85,
                "issues": issues,
                "checks_performed": ["spelling", "grammar", "terminology", "consistency"]
            },
            metrics={
                "duration_ms": 1500,
                "units_checked": context.get("translated_units", 100)
            }
        )
    
    async def technical_qa(self, config: dict, context: dict) -> StageResult:
        """Perform technical quality checks"""
        await asyncio.sleep(1.0)
        
        return StageResult(
            status=StageStatus.COMPLETED,
            output={
                "placeholders_valid": True,
                "tags_balanced": True,
                "encoding_valid": True,
                "length_compliance": 0.95
            },
            metrics={
                "duration_ms": 1000,
                "checks_performed": 4
            }
        )


# Plugin registration function
def register_custom_plugins(plugin_registry):
    """Register all custom plugins with the workflow engine"""
    
    # Register GitHub plugin
    github_plugin = GitHubIntegrationPlugin()
    plugin_registry.register(github_plugin)
    
    # Register TM plugin
    tm_plugin = TranslationMemoryPlugin()
    plugin_registry.register(tm_plugin)
    
    # Register QA plugin
    qa_plugin = QualityAssurancePlugin()
    plugin_registry.register(qa_plugin)
    
    print("✅ All custom plugins registered successfully")


# Example workflow definition using custom plugins
EXAMPLE_WORKFLOW_WITH_PLUGINS = {
    "name": "Advanced Localization Pipeline",
    "description": "Pipeline with custom plugins",
    "stages": [
        {
            "name": "extract",
            "type": "extract",
            "config": {
                "plugin": "builtin.extract"
            },
            "dependencies": []
        },
        {
            "name": "tm_lookup",
            "type": "custom",
            "config": {
                "plugin": "translation_memory",
                "handler": "tm_lookup"
            },
            "dependencies": ["extract"]
        },
        {
            "name": "translate",
            "type": "translate",
            "config": {
                "plugin": "builtin.translate"
            },
            "dependencies": ["tm_lookup"]
        },
        {
            "name": "linguistic_qa",
            "type": "custom",
            "config": {
                "plugin": "advanced_qa",
                "handler": "linguistic_qa"
            },
            "dependencies": ["translate"]
        },
        {
            "name": "technical_qa",
            "type": "custom",
            "config": {
                "plugin": "advanced_qa",
                "handler": "technical_qa"
            },
            "dependencies": ["translate"]
        },
        {
            "name": "create_pr",
            "type": "custom",
            "config": {
                "plugin": "github_integration",
                "handler": "create_pr",
                "title": "Translation Update",
                "branch": "i18n-update"
            },
            "dependencies": ["linguistic_qa", "technical_qa"]
        },
        {
            "name": "tm_update",
            "type": "custom",
            "config": {
                "plugin": "translation_memory",
                "handler": "tm_update"
            },
            "dependencies": ["create_pr"]
        }
    ]
}