"""
Ollama-based Machine Translation Plugin for XLIFF Workflows
Uses local Ollama LLM models for translation
"""

import asyncio
import aiohttp
from typing import Dict, Any, List
from workflow_engine import WorkflowPlugin, StageResult, StageStatus


class XliffOllamaMTPlugin(WorkflowPlugin):
    """Machine translate XLIFF segments using Ollama local LLM"""
    
    def __init__(self, ollama_base_url: str = "http://localhost:11434"):
        super().__init__("xliff_ollama_mt", "1.0.0")
        self.register_handler("translate", self.machine_translate)
        self.ollama_base_url = ollama_base_url
    
    async def _resolve_model_name(self, short_name: str) -> str:
        """
        Resolve short model name to full name with tag
        e.g., 'qwen' -> 'qwen2.5:14b'
        
        Args:
            short_name: Short model name (e.g., 'qwen', 'llama3')
            
        Returns:
            Full model name with tag, or original if not found
        """
        try:
            # Get list of available models
            url = f"{self.ollama_base_url}/api/tags"
            timeout_obj = aiohttp.ClientTimeout(total=5)
            
            async with aiohttp.ClientSession(timeout=timeout_obj) as session:
                async with session.get(url) as response:
                    if response.status == 200:
                        data = await response.json()
                        models = data.get("models", [])
                        
                        # Try to find a matching model
                        for model in models:
                            model_name = model.get("name", "")
                            # Check if short name matches the beginning
                            if model_name.startswith(short_name):
                                print(f"   ✅ Resolved model name: '{short_name}' -> '{model_name}'")
                                return model_name
            
            # If not found, return original
            print(f"   ⚠️  Could not resolve model '{short_name}', using as-is")
            return short_name
            
        except Exception as e:
            print(f"   ⚠️  Error resolving model name: {e}")
            return short_name
    
    async def machine_translate(self, config: Dict, context: Dict) -> StageResult:
        """
        Machine translate segments using Ollama
        
        Config params:
            model: Ollama model name (default: llama3)
            source_language: Source language name (e.g., "English")
            target_language: Target language name (e.g., "Spanish")
            skip_pretranslated: Skip already translated segments (default: True)
            prompt_template: Custom prompt template (optional)
            temperature: Model temperature 0.0-1.0 (default: 0.3)
            max_concurrent: Max parallel translations (default: 5)
        
        Context expectations:
            Looks for segments in context["pretranslate"]["segments"] or context["extract"]["segments"]
        
        Returns:
            StageResult with translated segments, metrics, and any errors
        """
        # Get configuration
        model = config.get("model", "llama3")
        source_lang = config.get("source_language", "English")
        target_lang = config.get("target_language", "Spanish")
        skip_pretranslated = config.get("skip_pretranslated", True)
        temperature = config.get("temperature", 0.3)
        max_concurrent = config.get("max_concurrent", 5)
        
        # Auto-resolve short model names to full names with tags
        # This fixes frontend sending "qwen" instead of "qwen2.5:14b"
        if ":" not in model:  # No tag specified
            print(f"   🔍 Model name has no tag, attempting to resolve: '{model}'")
            model = await self._resolve_model_name(model)
        
        # Log configuration
        print(f"\n🔄 Starting Ollama MT Translation")
        print(f"   Model: {model}")
        print(f"   {source_lang} → {target_lang}")
        print(f"   Ollama URL: {self.ollama_base_url}")
        
        # Get prompt template
        prompt_template = config.get("prompt_template", 
            "Translate the following text from {source_lang} to {target_lang}. "
            "Provide only the translation, no explanations or additional text.\n\n"
            "Text: {text}\n\n"
            "Translation:"
        )
        
        # Get segments from previous stage
        segments = context.get("pretranslate", {}).get("segments", [])
        if not segments:
            segments = context.get("extract", {}).get("segments", [])
        
        if not segments:
            return StageResult(
                status=StageStatus.FAILED,
                output={},
                errors=["No segments found in context. Ensure extract stage ran first."]
            )
        
        # Filter segments that need translation
        segments_to_translate = [
            s for s in segments 
            if not (skip_pretranslated and s.get("target"))
        ]
        
        if not segments_to_translate:
            return StageResult(
                status=StageStatus.COMPLETED,
                output={
                    "segments": segments,
                    "translated_count": 0,
                    "message": "All segments already translated (skip_pretranslated=True)"
                },
                metrics={
                    "segments_translated": 0,
                    "segments_skipped": len(segments)
                }
            )
        
        translated_count = 0
        error_count = 0
        errors = []
        
        # Translate in batches with concurrency limit
        semaphore = asyncio.Semaphore(max_concurrent)
        
        async def translate_segment(segment):
            nonlocal translated_count, error_count
            
            async with semaphore:
                try:
                    # Build prompt
                    prompt = prompt_template.format(
                        source_lang=source_lang,
                        target_lang=target_lang,
                        text=segment["source"]
                    )
                    
                    # Call Ollama API
                    translation = await self._call_ollama(
                        model=model,
                        prompt=prompt,
                        temperature=temperature
                    )
                    
                    # Update segment
                    segment["target"] = translation.strip()
                    segment["state"] = "translated"
                    segment["translation_provider"] = f"ollama_{model}"
                    segment["translation_method"] = "mt"
                    
                    translated_count += 1
                    
                except Exception as e:
                    error_count += 1
                    error_msg = str(e)
                    
                    # Print detailed error for debugging
                    print(f"❌ MT Translation failed for segment {segment.get('id', 'unknown')}")
                    print(f"   Error: {error_msg}")
                    print(f"   Model: {model}")
                    print(f"   Source text: {segment['source'][:50]}...")
                    
                    errors.append({
                        "segment_id": segment.get("id", "unknown"),
                        "error": error_msg
                    })
                    segment["state"] = "failed"
                    segment["error"] = error_msg
        
        # Translate all segments concurrently
        await asyncio.gather(*[
            translate_segment(seg) for seg in segments_to_translate
        ])
        
        # Determine overall status
        status = StageStatus.COMPLETED
        if error_count == len(segments_to_translate):
            status = StageStatus.FAILED
        elif error_count > 0:
            status = StageStatus.COMPLETED  # Partial success
        
        # Log summary
        print(f"\n✅ Ollama MT Translation Complete")
        print(f"   Translated: {translated_count}/{len(segments_to_translate)}")
        print(f"   Failed: {error_count}")
        if errors:
            print(f"   First error: {errors[0]['error']}")
        
        return StageResult(
            status=status,
            output={
                "segments": segments,
                "translated_count": translated_count,
                "error_count": error_count,
                "errors": errors[:10],  # Limit error list to first 10
                "model": model,
                "source_language": source_lang,
                "target_language": target_lang,
                "total_segments": len(segments),
                "segments_to_translate": len(segments_to_translate),
                "translation_rate": translated_count / len(segments_to_translate) if segments_to_translate else 0
            },
            metrics={
                "segments_translated": translated_count,
                "segments_failed": error_count,
                "segments_skipped": len(segments) - len(segments_to_translate),
                "model": model,
                "translation_rate": translated_count / len(segments_to_translate) if segments_to_translate else 0
            },
            errors=[f"Translation failed for {error_count} segments"] if error_count > 0 else []
        )
    
    async def _call_ollama(
        self, 
        model: str, 
        prompt: str, 
        temperature: float = 0.3,
        timeout: int = 60
    ) -> str:
        """
        Call Ollama API to generate translation
        
        Args:
            model: Ollama model name
            prompt: Translation prompt
            temperature: Model temperature (0.0-1.0)
            timeout: Request timeout in seconds
            
        Returns:
            Generated translation text
            
        Raises:
            Exception: If API call fails or times out
        """
        url = f"{self.ollama_base_url}/api/generate"
        
        payload = {
            "model": model,
            "prompt": prompt,
            "temperature": temperature,
            "stream": False
        }
        
        timeout_obj = aiohttp.ClientTimeout(total=timeout)
        
        try:
            async with aiohttp.ClientSession(timeout=timeout_obj) as session:
                async with session.post(url, json=payload) as response:
                    if response.status != 200:
                        error_text = await response.text()
                        raise Exception(f"Ollama API error (status {response.status}): {error_text}")
                    
                    result = await response.json()
                    translation = result.get("response", "")
                    
                    if not translation:
                        raise Exception("Empty response from Ollama")
                    
                    return translation
        
        except asyncio.TimeoutError:
            raise Exception(f"Ollama API timeout after {timeout} seconds")
        except aiohttp.ClientError as e:
            raise Exception(f"Ollama connection error: {str(e)}")


# Registration function
def register_ollama_mt_plugin(plugin_registry):
    """Register Ollama MT plugin with the workflow engine"""
    ollama_mt = XliffOllamaMTPlugin()
    plugin_registry.register(ollama_mt)
    print("✅ Ollama MT plugin registered")


# Example usage in workflow definition
EXAMPLE_OLLAMA_WORKFLOW = {
    "name": "XLIFF Translation with Ollama",
    "description": "Translate XLIFF using local Ollama LLM",
    "stages": [
        {
            "name": "extract",
            "type": "custom",
            "config": {
                "plugin": "xliff_extract",
                "handler": "extract",
                "source_language": "en",
                "target_languages": ["es"]
            },
            "dependencies": [],
            "position": {"x": 100, "y": 200}
        },
        {
            "name": "ollama_translate",
            "type": "custom",
            "config": {
                "plugin": "xliff_ollama_mt",
                "handler": "translate",
                "model": "llama3",
                "source_language": "English",
                "target_language": "Spanish",
                "temperature": 0.3,
                "max_concurrent": 5,
                "skip_pretranslated": True
            },
            "dependencies": ["extract"],
            "position": {"x": 400, "y": 200}
        },
        {
            "name": "validate",
            "type": "custom",
            "config": {
                "plugin": "xliff_validate",
                "handler": "validate",
                "check_tags": True
            },
            "dependencies": ["ollama_translate"],
            "position": {"x": 700, "y": 200}
        }
    ]
}