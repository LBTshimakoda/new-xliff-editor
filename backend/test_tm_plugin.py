"""
Test Real Translation Memory Plugin
Tests TM database operations and workflow integration
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


def test_tm_add_translations():
    """Test adding translations to TM"""
    print_section("Test 1: Add Translations to TM")
    
    # Create workflow to add translations
    workflow = {
        "name": "Populate TM",
        "description": "Add sample translations to TM",
        "stages": [
            {
                "name": "add_hello",
                "type": "custom",
                "config": {
                    "plugin": "translation_memory_real",
                    "handler": "tm_add",
                    "source": "Hello World",
                    "target": "Hola Mundo",
                    "source_lang": "en",
                    "target_lang": "es"
                },
                "dependencies": []
            },
            {
                "name": "add_welcome",
                "type": "custom",
                "config": {
                    "plugin": "translation_memory_real",
                    "handler": "tm_add",
                    "source": "Welcome to the application",
                    "target": "Bienvenido a la aplicación",
                    "source_lang": "en",
                    "target_lang": "es"
                },
                "dependencies": []
            },
            {
                "name": "add_goodbye",
                "type": "custom",
                "config": {
                    "plugin": "translation_memory_real",
                    "handler": "tm_add",
                    "source": "Goodbye",
                    "target": "Adiós",
                    "source_lang": "en",
                    "target_lang": "es"
                },
                "dependencies": []
            },
            {
                "name": "add_thank_you",
                "type": "custom",
                "config": {
                    "plugin": "translation_memory_real",
                    "handler": "tm_add",
                    "source": "Thank you very much",
                    "target": "Muchas gracias",
                    "source_lang": "en",
                    "target_lang": "es"
                },
                "dependencies": []
            },
            {
                "name": "add_click_here",
                "type": "custom",
                "config": {
                    "plugin": "translation_memory_real",
                    "handler": "tm_add",
                    "source": "Click here to continue",
                    "target": "Haga clic aquí para continuar",
                    "source_lang": "en",
                    "target_lang": "es"
                },
                "dependencies": []
            }
        ]
    }
    
    print("\n📝 Creating TM population workflow...")
    response = requests.post(f"{BASE_URL}/api/workflows", json=workflow)
    
    if response.status_code != 200:
        print(f"❌ Failed to create workflow: {response.status_code}")
        return False
    
    workflow_id = response.json()["workflow_id"]
    print(f"✅ Workflow created: {workflow_id[:8]}...")
    
    # Execute workflow
    print("\n🚀 Adding translations to TM...")
    response = requests.post(f"{BASE_URL}/api/workflows/{workflow_id}/execute", json={})
    
    if response.status_code != 200:
        print(f"❌ Execution failed: {response.status_code}")
        return False
    
    execution_id = response.json()["execution_id"]
    
    # Wait for completion
    for i in range(10):
        time.sleep(0.5)
        response = requests.get(f"{BASE_URL}/api/executions/{execution_id}")
        status = response.json()
        
        if status["status"] in ["completed", "failed"]:
            break
    
    if status["status"] == "completed":
        added_count = sum(
            1 for stage in status["stages"]
            if stage["status"] == "completed" and 
            stage["result"]["output"].get("added", False)
        )
        print(f"✅ Added {added_count} translations to TM")
        return True
    else:
        print(f"❌ Workflow failed")
        return False


def test_tm_exact_match():
    """Test exact TM match"""
    print_section("Test 2: Exact TM Match")
    
    workflow = {
        "name": "TM Exact Match Test",
        "stages": [
            {
                "name": "lookup",
                "type": "custom",
                "config": {
                    "plugin": "translation_memory_real",
                    "handler": "tm_lookup",
                    "source_text": "Hello World",
                    "source_lang": "en",
                    "target_lang": "es"
                },
                "dependencies": []
            }
        ]
    }
    
    print("\n🔍 Looking up 'Hello World' in TM...")
    
    # Create and execute
    response = requests.post(f"{BASE_URL}/api/workflows", json=workflow)
    workflow_id = response.json()["workflow_id"]
    
    response = requests.post(f"{BASE_URL}/api/workflows/{workflow_id}/execute", json={})
    execution_id = response.json()["execution_id"]
    
    # Wait and check result
    time.sleep(1)
    response = requests.get(f"{BASE_URL}/api/executions/{execution_id}")
    status = response.json()
    
    if status["stages"][0]["status"] == "completed":
        output = status["stages"][0]["result"]["output"]
        print(f"\n✅ Match found!")
        print(f"   Type: {output['match_type']}")
        print(f"   Source: {output['source']}")
        print(f"   Target: {output['target']}")
        print(f"   Score: {output['score']}")
        return True
    else:
        print("❌ Lookup failed")
        return False


def test_tm_fuzzy_match():
    """Test fuzzy TM match"""
    print_section("Test 3: Fuzzy TM Match")
    
    workflow = {
        "name": "TM Fuzzy Match Test",
        "stages": [
            {
                "name": "lookup",
                "type": "custom",
                "config": {
                    "plugin": "translation_memory_real",
                    "handler": "tm_lookup",
                    "source_text": "Helo World",  # Typo: should match "Hello World"
                    "source_lang": "en",
                    "target_lang": "es",
                    "threshold": 0.7
                },
                "dependencies": []
            }
        ]
    }
    
    print("\n🔍 Looking up 'Helo World' (fuzzy) in TM...")
    
    response = requests.post(f"{BASE_URL}/api/workflows", json=workflow)
    workflow_id = response.json()["workflow_id"]
    
    response = requests.post(f"{BASE_URL}/api/workflows/{workflow_id}/execute", json={})
    execution_id = response.json()["execution_id"]
    
    time.sleep(1)
    response = requests.get(f"{BASE_URL}/api/executions/{execution_id}")
    status = response.json()
    
    if status["stages"][0]["status"] == "completed":
        output = status["stages"][0]["result"]["output"]
        print(f"\n✅ Fuzzy match found!")
        print(f"   Type: {output['match_type']}")
        print(f"   Source: {output['source']}")
        print(f"   Target: {output['target']}")
        print(f"   Score: {output['score']:.2%}")
        
        if "all_matches" in output:
            print(f"   Total matches: {len(output['all_matches'])}")
        
        return True
    else:
        print("❌ Lookup failed")
        return False


def test_tm_no_match():
    """Test no TM match scenario"""
    print_section("Test 4: No TM Match")
    
    workflow = {
        "name": "TM No Match Test",
        "stages": [
            {
                "name": "lookup",
                "type": "custom",
                "config": {
                    "plugin": "translation_memory_real",
                    "handler": "tm_lookup",
                    "source_text": "This text is not in TM database",
                    "source_lang": "en",
                    "target_lang": "es"
                },
                "dependencies": []
            }
        ]
    }
    
    print("\n🔍 Looking up text not in TM...")
    
    response = requests.post(f"{BASE_URL}/api/workflows", json=workflow)
    workflow_id = response.json()["workflow_id"]
    
    response = requests.post(f"{BASE_URL}/api/workflows/{workflow_id}/execute", json={})
    execution_id = response.json()["execution_id"]
    
    time.sleep(1)
    response = requests.get(f"{BASE_URL}/api/executions/{execution_id}")
    status = response.json()
    
    if status["stages"][0]["status"] == "completed":
        output = status["stages"][0]["result"]["output"]
        print(f"\n✅ Correct behavior - no match")
        print(f"   Type: {output['match_type']}")
        print(f"   Score: {output['score']}")
        return True
    else:
        print("❌ Lookup failed")
        return False


def test_tm_batch_lookup():
    """Test batch TM lookup"""
    print_section("Test 5: Batch TM Lookup")
    
    workflow = {
        "name": "TM Batch Lookup Test",
        "stages": [
            {
                "name": "batch_lookup",
                "type": "custom",
                "config": {
                    "plugin": "translation_memory_real",
                    "handler": "tm_batch_lookup",
                    "segments": [
                        {"source": "Hello World"},
                        {"source": "Goodbye"},
                        {"source": "Thank you very much"},
                        {"source": "Some new text"},
                        {"source": "Click here to continue"}
                    ],
                    "source_lang": "en",
                    "target_lang": "es",
                    "threshold": 0.75
                },
                "dependencies": []
            }
        ]
    }
    
    print("\n🔍 Batch lookup for 5 segments...")
    
    response = requests.post(f"{BASE_URL}/api/workflows", json=workflow)
    workflow_id = response.json()["workflow_id"]
    
    response = requests.post(f"{BASE_URL}/api/workflows/{workflow_id}/execute", json={})
    execution_id = response.json()["execution_id"]
    
    time.sleep(1)
    response = requests.get(f"{BASE_URL}/api/executions/{execution_id}")
    status = response.json()
    
    if status["stages"][0]["status"] == "completed":
        output = status["stages"][0]["result"]["output"]
        metrics = status["stages"][0]["result"]["metrics"]
        
        print(f"\n✅ Batch lookup complete!")
        print(f"   Total segments: {output['total_segments']}")
        print(f"   Exact matches: {output['exact_matches']}")
        print(f"   Fuzzy matches: {output['fuzzy_matches']}")
        print(f"   No matches: {output['no_matches']}")
        print(f"   Coverage: {metrics['coverage']:.1%}")
        print(f"   Exact match rate: {metrics['exact_match_rate']:.1%}")
        
        return True
    else:
        print("❌ Batch lookup failed")
        return False


def test_tm_stats():
    """Test TM statistics"""
    print_section("Test 6: TM Statistics")
    
    workflow = {
        "name": "TM Stats Test",
        "stages": [
            {
                "name": "stats",
                "type": "custom",
                "config": {
                    "plugin": "translation_memory_real",
                    "handler": "tm_stats"
                },
                "dependencies": []
            }
        ]
    }
    
    print("\n📊 Fetching TM statistics...")
    
    response = requests.post(f"{BASE_URL}/api/workflows", json=workflow)
    workflow_id = response.json()["workflow_id"]
    
    response = requests.post(f"{BASE_URL}/api/workflows/{workflow_id}/execute", json={})
    execution_id = response.json()["execution_id"]
    
    time.sleep(1)
    response = requests.get(f"{BASE_URL}/api/executions/{execution_id}")
    status = response.json()
    
    if status["stages"][0]["status"] == "completed":
        output = status["stages"][0]["result"]["output"]
        
        print(f"\n✅ TM Statistics:")
        print(f"   Total translations: {output['total_translations']}")
        print(f"   Language pairs: {output['language_pairs']}")
        print(f"   Database: {output['database_path']}")
        
        if output.get('most_used'):
            print(f"\n   Most used translations:")
            for i, trans in enumerate(output['most_used'][:5], 1):
                print(f"      {i}. {trans['source']} → {trans['target']} ({trans['count']} uses)")
        
        return True
    else:
        print("❌ Stats failed")
        return False


def test_tm_with_xliff_workflow():
    """Test TM integration with XLIFF workflow"""
    print_section("Test 7: TM + XLIFF Integration")
    
    workflow = {
        "name": "XLIFF with TM",
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
                "name": "tm_lookup",
                "type": "custom",
                "config": {
                    "plugin": "translation_memory_real",
                    "handler": "tm_batch_lookup",
                    "source_lang": "en",
                    "target_lang": "es",
                    "threshold": 0.75
                },
                "dependencies": ["extract"]
            }
        ]
    }
    
    print("\n🔄 Testing TM with XLIFF extraction...")
    
    response = requests.post(f"{BASE_URL}/api/workflows", json=workflow)
    workflow_id = response.json()["workflow_id"]
    
    response = requests.post(f"{BASE_URL}/api/workflows/{workflow_id}/execute", json={})
    execution_id = response.json()["execution_id"]
    
    time.sleep(2)
    response = requests.get(f"{BASE_URL}/api/executions/{execution_id}")
    status = response.json()
    
    if status["status"] == "completed":
        # Show extract results
        extract_output = status["stages"][0]["result"]["output"]
        print(f"\n✅ Extract stage:")
        print(f"   Segments extracted: {extract_output.get('segment_count', 0)}")
        
        # Show TM lookup results
        tm_output = status["stages"][1]["result"]["output"]
        tm_metrics = status["stages"][1]["result"]["metrics"]
        
        print(f"\n✅ TM Lookup stage:")
        print(f"   Exact matches: {tm_output['exact_matches']}")
        print(f"   Fuzzy matches: {tm_output['fuzzy_matches']}")
        print(f"   No matches: {tm_output['no_matches']}")
        print(f"   Coverage: {tm_metrics['coverage']:.1%}")
        
        return True
    else:
        print(f"❌ Workflow failed: {status['status']}")
        return False


def main():
    """Run all TM plugin tests"""
    print_section("Real Translation Memory Plugin Tests")
    
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
    
    results["Add Translations"] = test_tm_add_translations()
    results["Exact Match"] = test_tm_exact_match()
    results["Fuzzy Match"] = test_tm_fuzzy_match()
    results["No Match"] = test_tm_no_match()
    results["Batch Lookup"] = test_tm_batch_lookup()
    results["Statistics"] = test_tm_stats()
    results["TM + XLIFF"] = test_tm_with_xliff_workflow()
    
    # Summary
    print_section("Test Summary")
    
    passed = sum(1 for result in results.values() if result)
    total = len(results)
    
    print(f"\n📊 Results: {passed}/{total} tests passed\n")
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"   {status}: {test_name}")
    
    print_section("TM Plugin Tests Complete")
    
    if passed == total:
        print("\n🎉 All tests passed! Real TM plugin is working correctly.")
        print("\n📊 TM Database:")
        print("   Location: ./tm_database.db")
        print("   You can inspect it with: sqlite3 tm_database.db")
        print("\n💡 Next steps:")
        print("   1. Add more translations to build your TM")
        print("   2. Import TMX files (future feature)")
        print("   3. Integrate with frontend")
    else:
        print(f"\n⚠️  {total - passed} test(s) failed. Check the output above.")


if __name__ == "__main__":
    main()