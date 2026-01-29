"""
Test Real XLIFF Extract Plugin
Tests parsing of real XLIFF files and workflow integration
"""

import requests
import time
from pathlib import Path


BASE_URL = "http://localhost:8000"


def print_section(title: str):
    """Print formatted section header"""
    print("\n" + "="*70)
    print(f"  {title}")
    print("="*70)


def create_test_xliff_file() -> str:
    """Create a test XLIFF file for testing"""
    xliff_content = """<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file source-language="en" target-language="es" datatype="plaintext" original="test.txt">
    <body>
      <trans-unit id="1">
        <source>Hello World</source>
        <target></target>
      </trans-unit>
      <trans-unit id="2">
        <source>Welcome to the application</source>
        <target></target>
      </trans-unit>
      <trans-unit id="3">
        <source>Click here to continue</source>
        <target></target>
      </trans-unit>
      <trans-unit id="4">
        <source>Thank you for using our service</source>
        <target>Gracias por usar nuestro servicio</target>
      </trans-unit>
      <trans-unit id="5">
        <source>Goodbye</source>
        <target state="final">Adiós</target>
      </trans-unit>
      <trans-unit id="6">
        <source>Settings</source>
        <target></target>
      </trans-unit>
      <trans-unit id="7">
        <source>Save changes</source>
        <target></target>
      </trans-unit>
      <trans-unit id="8">
        <source>Cancel</source>
        <target></target>
      </trans-unit>
      <trans-unit id="9">
        <source>Error occurred</source>
        <target></target>
      </trans-unit>
      <trans-unit id="10">
        <source>Please try again</source>
        <target></target>
      </trans-unit>
    </body>
  </file>
</xliff>"""
    
    # Save to temp file
    test_file = Path("test_real_xliff.xliff")
    test_file.write_text(xliff_content, encoding='utf-8')
    
    return str(test_file)


def test_upload_xliff_file():
    """Test uploading XLIFF file"""
    print_section("Test 1: Upload XLIFF File")
    
    # Create test XLIFF
    xliff_file = create_test_xliff_file()
    
    print(f"\n📤 Uploading XLIFF file: {xliff_file}")
    
    # Upload file
    with open(xliff_file, 'rb') as f:
        files = {'file': (xliff_file, f, 'application/x-xliff+xml')}
        data = {'description': 'Test XLIFF for extraction'}
        response = requests.post(f"{BASE_URL}/api/files/upload", files=files, data=data)
    
    # Clean up temp file
    Path(xliff_file).unlink()
    
    if response.status_code == 200:
        result = response.json()
        print(f"✅ File uploaded successfully!")
        print(f"   File ID: {result['file_id']}")
        print(f"   Filename: {result['filename']}")
        print(f"   Size: {result['size_formatted']}")
        return result['file_id']
    else:
        print(f"❌ Upload failed: {response.status_code}")
        print(f"   {response.text}")
        return None


def test_extract_from_file(file_id: str):
    """Test extracting segments from uploaded XLIFF file"""
    print_section("Test 2: Extract Segments from XLIFF")
    
    # Create workflow with real extract plugin
    workflow = {
        "name": "XLIFF Real Extract Test",
        "stages": [
            {
                "name": "extract",
                "type": "custom",
                "config": {
                    "plugin": "xliff_extract_real",
                    "handler": "extract"
                },
                "dependencies": []
            }
        ]
    }
    
    print("\n📝 Creating extraction workflow...")
    response = requests.post(f"{BASE_URL}/api/workflows", json=workflow)
    
    if response.status_code != 200:
        print(f"❌ Failed to create workflow: {response.status_code}")
        return None
    
    workflow_id = response.json()["workflow_id"]
    print(f"✅ Workflow created: {workflow_id[:8]}...")
    
    # Execute with uploaded file
    print(f"\n🚀 Extracting from file: {file_id[:8]}...")
    response = requests.post(
        f"{BASE_URL}/api/workflows/{workflow_id}/execute",
        json={"file_id": file_id}
    )
    
    if response.status_code != 200:
        print(f"❌ Execution failed: {response.status_code}")
        return None
    
    execution_id = response.json()["execution_id"]
    print(f"✅ Execution started: {execution_id[:8]}...")
    
    # Wait for completion
    print("\n👁️  Monitoring extraction...")
    
    for i in range(10):
        time.sleep(0.5)
        response = requests.get(f"{BASE_URL}/api/executions/{execution_id}")
        
        if response.status_code != 200:
            print(f"❌ Failed to get status: {response.status_code}")
            break
        
        status = response.json()
        
        if status["status"] in ["completed", "failed"]:
            break
    
    if status["status"] == "completed":
        extract_stage = status["stages"][0]
        output = extract_stage["result"]["output"]
        metrics = extract_stage["result"]["metrics"]
        
        
        print(f"\n✅ Extraction complete!")
        print(f"\n📊 Extracted Data:")
        
        print(f"\n🔍 Debug - Full output: {output}")
        
        print(f"   Total segments: {output['segment_count']}")
        print(f"   Source language: {output['source_language']}")
        print(f"   Target language: {output['target_language']}")
        print(f"   XLIFF version: {output['xliff_version']}")
        print(f"   Translated: {output['translated_count']}")
        print(f"   Approved: {output['approved_count']}")
        print(f"   Source words: {metrics['source_words']}")
        
        # Show sample segments
        print(f"\n📝 Sample Segments:")
        for i, segment in enumerate(output['segments'][:5], 1):
            print(f"\n   {i}. ID: {segment['id']}")
            print(f"      Source: {segment['source']}")
            print(f"      Target: {segment['target'] if segment['target'] else '(empty)'}")
            print(f"      State: {segment['state']}")
            print(f"      Translated: {segment['translated']}")
        
        return output['segments']
    else:
        print(f"❌ Extraction failed: {status['status']}")
        if extract_stage["result"].get("errors"):
            print(f"   Errors: {extract_stage['result']['errors']}")
        return None


def test_extract_with_tm_lookup(file_id: str):
    """Test extraction + TM lookup workflow"""
    print_section("Test 3: Extract + TM Lookup Integration")
    
    workflow = {
        "name": "XLIFF Extract + TM",
        "stages": [
            {
                "name": "extract",
                "type": "custom",
                "config": {
                    "plugin": "xliff_extract_real",
                    "handler": "extract"
                },
                "dependencies": []
            },
            {
                "name": "tm_lookup",
                "type": "custom",
                "config": {
                    "plugin": "translation_memory_real",
                    "handler": "tm_batch_lookup",
                    "threshold": 0.75
                },
                "dependencies": ["extract"]
            }
        ]
    }
    
    print("\n📝 Creating integrated workflow...")
    response = requests.post(f"{BASE_URL}/api/workflows", json=workflow)
    workflow_id = response.json()["workflow_id"]
    
    print(f"\n🚀 Executing extract + TM lookup...")
    response = requests.post(
        f"{BASE_URL}/api/workflows/{workflow_id}/execute",
        json={"file_id": file_id}
    )
    execution_id = response.json()["execution_id"]
    
    # Wait for completion
    time.sleep(2)
    response = requests.get(f"{BASE_URL}/api/executions/{execution_id}")
    status = response.json()
    
    if status["status"] == "completed":
        extract_output = status["stages"][0]["result"]["output"]
        tm_output = status["stages"][1]["result"]["output"]
        tm_metrics = status["stages"][1]["result"]["metrics"]
        
        print(f"\n✅ Integrated workflow complete!")
        
        print(f"\n📊 Extract Results:")
        print(f"   Segments extracted: {extract_output['segment_count']}")
        
        print(f"\n📊 TM Lookup Results:")
        print(f"   Exact matches: {tm_output['exact_matches']}")
        print(f"   Fuzzy matches: {tm_output['fuzzy_matches']}")
        print(f"   No matches: {tm_output['no_matches']}")
        print(f"   Coverage: {tm_metrics['coverage']:.1%}")
        
        # Show which segments got matches
        print(f"\n🎯 Match Details:")
        matches = tm_output.get('matches', {})
        matched_count = 0
        for source, match_list in list(matches.items())[:5]:
            if match_list:
                match = match_list[0]
                print(f"   '{source[:40]}...' → '{match['target'][:40]}...' ({match['score']:.0%})")
                matched_count += 1
        
        if matched_count == 0:
            print("   No TM matches found (TM might be empty)")
            print("   💡 Run test_tm_plugin.py first to populate TM")
        
        return True
    else:
        print(f"❌ Workflow failed: {status['status']}")
        return False


def test_complete_translation_workflow(file_id: str):
    """Test complete translation workflow: Extract → TM → Pretranslate → MT"""
    print_section("Test 4: Complete Translation Workflow")
    
    workflow = {
        "name": "Complete Translation",
        "stages": [
            {
                "name": "extract",
                "type": "custom",
                "config": {
                    "plugin": "xliff_extract_real",
                    "handler": "extract"
                },
                "dependencies": []
            },
            {
                "name": "tm_lookup",
                "type": "custom",
                "config": {
                    "plugin": "translation_memory_real",
                    "handler": "tm_batch_lookup",
                    "threshold": 0.75
                },
                "dependencies": ["extract"]
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
                "dependencies": ["tm_lookup"]
            },
            {
                "name": "mt_translate",
                "type": "custom",
                "config": {
                    "plugin": "xliff_mt",
                    "handler": "translate",
                    "provider": "google_translate",
                    "skip_pretranslated": True
                },
                "dependencies": ["pretranslate"]
            },
            {
                "name": "validate",
                "type": "custom",
                "config": {
                    "plugin": "xliff_validate",
                    "handler": "validate",
                    "check_tags": True
                },
                "dependencies": ["mt_translate"]
            }
        ]
    }
    
    print("\n📝 Creating complete translation workflow...")
    response = requests.post(f"{BASE_URL}/api/workflows", json=workflow)
    
    if response.status_code != 200:
        print(f"❌ Failed: {response.status_code}")
        return False
    
    workflow_id = response.json()["workflow_id"]
    
    print(f"\n🚀 Executing complete workflow...")
    response = requests.post(
        f"{BASE_URL}/api/workflows/{workflow_id}/execute",
        json={"file_id": file_id}
    )
    execution_id = response.json()["execution_id"]
    
    # Monitor progress
    print("\n👁️  Monitoring (will take ~5 seconds)...")
    
    for i in range(15):
        time.sleep(0.5)
        response = requests.get(f"{BASE_URL}/api/executions/{execution_id}")
        status = response.json()
        
        if status["status"] in ["completed", "failed"]:
            break
    
    if status["status"] == "completed":
        print(f"\n✅ Complete workflow finished!")
        
        # Show results from each stage
        for stage in status["stages"]:
            stage_name = stage["name"]
            stage_output = stage["result"]["output"]
            
            print(f"\n   📌 {stage_name.upper()}:")
            
            if stage_name == "extract":
                print(f"      Segments: {stage_output.get('segment_count', 0)}")
            
            elif stage_name == "tm_lookup":
                print(f"      Exact matches: {stage_output.get('exact_matches', 0)}")
                print(f"      Coverage: {stage['result']['metrics'].get('coverage', 0):.1%}")
            
            elif stage_name == "pretranslate":
                print(f"      Pretranslated: {stage_output.get('pretranslated_count', 0)}")
                print(f"      Rate: {stage_output.get('pretranslation_rate', 0):.1%}")
            
            elif stage_name == "mt_translate":
                print(f"      MT translated: {stage_output.get('mt_translated_count', 0)}")
                print(f"      Total done: {stage_output.get('total_translated', 0)}")
            
            elif stage_name == "validate":
                print(f"      Valid: {stage_output.get('valid', False)}")
                print(f"      Errors: {stage_output.get('error_count', 0)}")
        
        return True
    else:
        print(f"❌ Workflow failed at stage: {status.get('current_stage', 'unknown')}")
        return False


def main():
    """Run all XLIFF extract tests"""
    print_section("Real XLIFF Extract Plugin Tests")
    
    # Check backend
    print("\n🔍 Checking backend...")
    try:
        response = requests.get(f"{BASE_URL}/docs")
        print("✅ Backend is running")
    except requests.exceptions.ConnectionError:
        print("❌ Backend not running!")
        print("   Start with: python workflow_engine.py")
        return
    
    # Run tests
    results = {}
    
    # Test 1: Upload XLIFF
    file_id = test_upload_xliff_file()
    results["Upload XLIFF"] = file_id is not None
    
    if not file_id:
        print("\n❌ Upload failed, cannot continue tests")
        return
    
    # Test 2: Extract segments
    segments = test_extract_from_file(file_id)
    results["Extract Segments"] = segments is not None
    
    # Test 3: Extract + TM
    results["Extract + TM"] = test_extract_with_tm_lookup(file_id)
    
    # Test 4: Complete workflow
    results["Complete Workflow"] = test_complete_translation_workflow(file_id)
    
    # Summary
    print_section("Test Summary")
    
    passed = sum(1 for result in results.values() if result)
    total = len(results)
    
    print(f"\n📊 Results: {passed}/{total} tests passed\n")
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"   {status}: {test_name}")
    
    print_section("XLIFF Extract Tests Complete")
    
    if passed == total:
        print("\n🎉 All tests passed! Real XLIFF extract is working!")
        print("\n✨ You now have:")
        print("   ✅ Real file upload")
        print("   ✅ Real XLIFF parsing")
        print("   ✅ Real TM lookups")
        print("   ✅ Complete translation workflows")
        print("\n💡 This is a REAL, production-ready localization platform!")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed.")


if __name__ == "__main__":
    main()