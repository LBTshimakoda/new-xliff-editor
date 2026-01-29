"""
Test XLIFF Workflow Integration
Tests the complete XLIFF translation pipeline
"""

import requests
import time
import json

BASE_URL = "http://localhost:8000"


def print_section(title: str):
    """Print formatted section header"""
    print("\n" + "="*70)
    print(f"  {title}")
    print("="*70)


def test_xliff_translation_workflow():
    """Test complete XLIFF translation pipeline"""
    print_section("XLIFF Translation Workflow Test")
    
    workflow = {
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
                    "target_languages": ["es", "fr", "de"],
                    "file_name": "strings.xliff"
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
        ]
    }
    
    print("\n📝 Creating XLIFF translation workflow...")
    response = requests.post(f"{BASE_URL}/api/workflows", json=workflow)
    
    if response.status_code != 200:
        print(f"❌ Failed to create workflow: {response.text}")
        return
    
    workflow_id = response.json()["workflow_id"]
    print(f"✅ Workflow created: {workflow_id[:8]}...")
    
    print("\n🚀 Executing XLIFF translation workflow...")
    response = requests.post(
        f"{BASE_URL}/api/workflows/{workflow_id}/execute",
        json={"xliff_file_id": "test_file_123"}
    )
    
    if response.status_code != 200:
        print(f"❌ Failed to execute workflow: {response.text}")
        return
    
    execution_id = response.json()["execution_id"]
    print(f"✅ Execution started: {execution_id[:8]}...")
    
    print("\n👁️  Monitoring XLIFF workflow execution...")
    print("     (This will take ~6-7 seconds)")
    
    start_time = time.time()
    while time.time() - start_time < 30:
        time.sleep(1)
        
        response = requests.get(f"{BASE_URL}/api/executions/{execution_id}")
        if response.status_code != 200:
            print(f"❌ Failed to get status: {response.text}")
            break
        
        status = response.json()
        current_status = status["status"]
        
        print(f"\n   Overall Status: {current_status}")
        
        # Show detailed stage information
        for stage in status["stages"]:
            stage_name = stage["name"]
            stage_status = stage["status"]
            result = stage.get("result")
            
            status_icon = {
                "pending": "⭕",
                "running": "🔄",
                "completed": "✅",
                "failed": "❌"
            }.get(stage_status, "❓")
            
            print(f"   {status_icon} {stage_name}: {stage_status}")
            
            # Show key metrics for completed stages
            if result and stage_status == "completed":
                output = result.get("output", {})
                
                if stage_name == "extract":
                    print(f"      • Segments extracted: {output.get('segment_count', 0)}")
                    print(f"      • Source language: {output.get('source_language', 'N/A')}")
                
                elif stage_name == "tm_lookup":
                    coverage = output.get("coverage", 0)
                    print(f"      • TM coverage: {coverage*100:.1f}%")
                    print(f"      • Exact matches: {output.get('exact_matches', 0)}")
                
                elif stage_name == "pretranslate":
                    rate = output.get("pretranslation_rate", 0)
                    print(f"      • Pretranslation rate: {rate*100:.1f}%")
                    print(f"      • Segments pretranslated: {output.get('pretranslated_count', 0)}")
                
                elif stage_name == "mt_translate":
                    print(f"      • MT provider: {output.get('provider', 'N/A')}")
                    print(f"      • Segments translated: {output.get('mt_translated_count', 0)}")
                    print(f"      • Total translated: {output.get('total_translated', 0)}")
                
                elif stage_name == "validate":
                    print(f"      • Valid: {output.get('valid', False)}")
                    print(f"      • Errors: {output.get('error_count', 0)}")
                    print(f"      • Warnings: {output.get('warning_count', 0)}")
                
                elif stage_name == "export":
                    print(f"      • Format: {output.get('format', 'N/A')}")
                    print(f"      • Segments exported: {output.get('segment_count', 0)}")
                    print(f"      • Download: {output.get('download_url', 'N/A')}")
        
        if current_status in ["completed", "failed"]:
            print(f"\n🏁 Workflow {current_status}!")
            
            # Print summary
            print_section("Workflow Summary")
            
            all_stages = status["stages"]
            completed = [s for s in all_stages if s["status"] == "completed"]
            failed = [s for s in all_stages if s["status"] == "failed"]
            
            print(f"\n   Total stages: {len(all_stages)}")
            print(f"   ✅ Completed: {len(completed)}")
            print(f"   ❌ Failed: {len(failed)}")
            print(f"   ⏱️  Duration: {time.time() - start_time:.1f}s")
            
            # Extract key metrics
            if len(completed) > 0:
                extract_result = next((s for s in all_stages if s["name"] == "extract"), None)
                if extract_result and extract_result.get("result"):
                    output = extract_result["result"]["output"]
                    print(f"\n   📊 Translation Statistics:")
                    print(f"      • Source segments: {output.get('segment_count', 0)}")
                    
                    pretrans_result = next((s for s in all_stages if s["name"] == "pretranslate"), None)
                    if pretrans_result and pretrans_result.get("result"):
                        pt_output = pretrans_result["result"]["output"]
                        rate = pt_output.get("pretranslation_rate", 0)
                        print(f"      • TM pretranslation: {rate*100:.1f}%")
                    
                    mt_result = next((s for s in all_stages if s["name"] == "mt_translate"), None)
                    if mt_result and mt_result.get("result"):
                        mt_output = mt_result["result"]["output"]
                        print(f"      • MT translated: {mt_output.get('mt_translated_count', 0)}")
                        print(f"      • Total complete: {mt_output.get('total_translated', 0)}")
            
            break


def test_simple_xliff_workflow():
    """Test a simpler XLIFF workflow (extract → translate → validate)"""
    print_section("Simple XLIFF Workflow Test")
    
    workflow = {
        "name": "Simple XLIFF Pipeline",
        "description": "Quick XLIFF processing",
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
                "dependencies": []
            },
            {
                "name": "mt_translate",
                "type": "custom",
                "config": {
                    "plugin": "xliff_mt",
                    "handler": "translate",
                    "provider": "google_translate"
                },
                "dependencies": ["extract"]
            },
            {
                "name": "validate",
                "type": "custom",
                "config": {
                    "plugin": "xliff_validate",
                    "handler": "validate"
                },
                "dependencies": ["mt_translate"]
            }
        ]
    }
    
    print("\n📝 Creating simple workflow...")
    response = requests.post(f"{BASE_URL}/api/workflows", json=workflow)
    workflow_id = response.json()["workflow_id"]
    print(f"✅ Workflow created: {workflow_id[:8]}...")
    
    print("\n🚀 Executing workflow...")
    response = requests.post(f"{BASE_URL}/api/workflows/{workflow_id}/execute", json={})
    execution_id = response.json()["execution_id"]
    print(f"✅ Execution started: {execution_id[:8]}...")
    
    print("\n👁️  Monitoring (will take ~4 seconds)...")
    
    for i in range(10):
        time.sleep(1)
        response = requests.get(f"{BASE_URL}/api/executions/{execution_id}")
        status = response.json()
        
        if status["status"] in ["completed", "failed"]:
            print(f"\n✅ Workflow {status['status']} in {i+1}s!")
            break


def main():
    """Main test runner"""
    print_section("XLIFF Workflow Integration Tests")
    
    # Check backend
    print("\n🔍 Checking backend...")
    try:
        response = requests.get(f"{BASE_URL}/docs")
        print("✅ Backend is running")
    except requests.exceptions.ConnectionError:
        print("❌ Backend not running!")
        print("   Start with: python workflow_engine.py")
        print("   (Make sure XLIFF plugins are registered)")
        return
    
    print("\n📋 Available tests:")
    print("   1. Simple XLIFF Workflow (3 stages, ~4s)")
    print("   2. Complete XLIFF Translation Pipeline (6 stages, ~7s)")
    print("   3. Both tests")
    
    choice = input("\nYour choice (1-3): ").strip()
    
    if choice == "1":
        test_simple_xliff_workflow()
    elif choice == "2":
        test_xliff_translation_workflow()
    elif choice == "3":
        test_simple_xliff_workflow()
        test_xliff_translation_workflow()
    else:
        print("❌ Invalid choice")
    
    print_section("XLIFF Integration Tests Complete")
    
    print("\n🎯 Next Steps:")
    print("   1. Open React UI: http://localhost:3000")
    print("   2. Upload an XLIFF file")
    print("   3. Create workflow using XLIFF stages")
    print("   4. Watch real-time processing")
    print("   5. Download translated XLIFF")


if __name__ == "__main__":
    main()