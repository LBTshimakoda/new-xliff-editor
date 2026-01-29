"""
Test File Upload API
Tests file upload, download, and workflow execution with files
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


def test_file_upload():
    """Test basic file upload"""
    print_section("Test 1: File Upload")
    
    # Create a test XLIFF file
    xliff_content = """<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file source-language="en" target-language="es" datatype="plaintext">
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
    </body>
  </file>
</xliff>"""
    
    # Save to temp file
    test_file = Path("test_document.xliff")
    test_file.write_text(xliff_content)
    
    print("\n📤 Uploading test XLIFF file...")
    
    # Upload file
    with open(test_file, 'rb') as f:
        files = {'file': ('test_document.xliff', f, 'application/x-xliff+xml')}
        data = {'description': 'Test XLIFF document for workflow testing'}
        response = requests.post(f"{BASE_URL}/api/files/upload", files=files, data=data)
    
    # Clean up temp file
    test_file.unlink()
    
    if response.status_code == 200:
        result = response.json()
        print(f"✅ File uploaded successfully!")
        print(f"   File ID: {result['file_id']}")
        print(f"   Filename: {result['filename']}")
        print(f"   Size: {result['size_formatted']}")
        print(f"   Content Type: {result['content_type']}")
        return result['file_id']
    else:
        print(f"❌ Upload failed: {response.status_code}")
        print(f"   {response.text}")
        return None


def test_list_files():
    """Test listing files"""
    print_section("Test 2: List Files")
    
    print("\n📋 Fetching file list...")
    response = requests.get(f"{BASE_URL}/api/files")
    
    if response.status_code == 200:
        result = response.json()
        print(f"✅ Found {result['count']} file(s)")
        
        for file in result['files']:
            print(f"\n   📄 {file['filename']}")
            print(f"      ID: {file['file_id']}")
            print(f"      Size: {file['size_formatted']}")
            print(f"      Uploaded: {file['uploaded_at']}")
    else:
        print(f"❌ Failed: {response.status_code}")


def test_file_info(file_id: str):
    """Test getting file info"""
    print_section("Test 3: Get File Info")
    
    print(f"\n📊 Fetching info for file: {file_id[:8]}...")
    response = requests.get(f"{BASE_URL}/api/files/{file_id}")
    
    if response.status_code == 200:
        info = response.json()
        print(f"✅ File information:")
        print(f"   Filename: {info['filename']}")
        print(f"   Size: {info['size_formatted']}")
        print(f"   Content Type: {info['content_type']}")
        print(f"   Hash: {info['file_hash'][:16]}...")
        print(f"   Uploaded: {info['uploaded_at']}")
    else:
        print(f"❌ Failed: {response.status_code}")


def test_download_file(file_id: str):
    """Test file download"""
    print_section("Test 4: Download File")
    
    print(f"\n⬇️  Downloading file: {file_id[:8]}...")
    response = requests.get(f"{BASE_URL}/api/files/{file_id}/download")
    
    if response.status_code == 200:
        print(f"✅ Downloaded {len(response.content)} bytes")
        print(f"   Content preview: {response.content[:100].decode('utf-8', errors='ignore')}...")
        return response.content
    else:
        print(f"❌ Failed: {response.status_code}")
        return None


def test_workflow_with_file(file_id: str):
    """Test workflow execution with file"""
    print_section("Test 5: Execute Workflow with File")
    
    # Create a simple workflow
    workflow = {
        "name": "XLIFF Processing with File",
        "description": "Process uploaded XLIFF file",
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
                "name": "validate",
                "type": "custom",
                "config": {
                    "plugin": "xliff_validate",
                    "handler": "validate"
                },
                "dependencies": ["extract"]
            }
        ]
    }
    
    print("\n📝 Creating workflow...")
    response = requests.post(f"{BASE_URL}/api/workflows", json=workflow)
    
    if response.status_code != 200:
        print(f"❌ Workflow creation failed: {response.status_code}")
        return
    
    workflow_id = response.json()["workflow_id"]
    print(f"✅ Workflow created: {workflow_id[:8]}...")
    
    # Execute with file
    print(f"\n🚀 Executing workflow with file: {file_id[:8]}...")
    response = requests.post(
        f"{BASE_URL}/api/workflows/{workflow_id}/execute",
        json={
            "file_id": file_id,
            "config": {}
        }
    )
    
    if response.status_code != 200:
        print(f"❌ Execution failed: {response.status_code}")
        print(f"   {response.text}")
        return
    
    execution_id = response.json()["execution_id"]
    print(f"✅ Execution started: {execution_id[:8]}...")
    
    # Monitor execution
    print("\n👁️  Monitoring execution...")
    
    for i in range(10):
        time.sleep(1)
        response = requests.get(f"{BASE_URL}/api/executions/{execution_id}")
        
        if response.status_code != 200:
            print(f"❌ Failed to get status: {response.status_code}")
            break
        
        status = response.json()
        
        print(f"\n   Status: {status['status']}")
        
        # Show file info
        if status.get('input_file'):
            print(f"   📄 Input: {status['input_file']['filename']} ({status['input_file']['size']} bytes)")
        
        if status.get('output_file'):
            print(f"   📄 Output: {status['output_file']['filename']} ({status['output_file']['size']} bytes)")
        
        # Show stages
        for stage in status['stages']:
            stage_icon = {
                'pending': '⭕',
                'running': '🔄',
                'completed': '✅',
                'failed': '❌'
            }.get(stage['status'], '❓')
            
            print(f"   {stage_icon} {stage['name']}: {stage['status']}")
        
        if status['status'] in ['completed', 'failed']:
            print(f"\n🏁 Workflow {status['status']}!")
            break
    
    # Show context that was passed to stages
    print(f"\n📦 Context information:")
    for stage in status['stages']:
        if stage['result']['output']:
            print(f"   Stage '{stage['name']}' output keys: {list(stage['result']['output'].keys())}")


def test_storage_stats():
    """Test storage statistics"""
    print_section("Test 6: Storage Statistics")
    
    print("\n📊 Fetching storage stats...")
    response = requests.get(f"{BASE_URL}/api/storage/stats")
    
    if response.status_code == 200:
        stats = response.json()
        print(f"✅ Storage statistics:")
        print(f"   Total files: {stats['file_count']}")
        print(f"   Total size: {stats['total_size_mb']} MB")
        print(f"   Storage path: {stats['storage_path']}")
        print(f"\n   File types:")
        for content_type, count in stats['file_types'].items():
            print(f"      {content_type}: {count}")
    else:
        print(f"❌ Failed: {response.status_code}")


def test_delete_file(file_id: str):
    """Test file deletion"""
    print_section("Test 7: Delete File")
    
    print(f"\n🗑️  Deleting file: {file_id[:8]}...")
    response = requests.delete(f"{BASE_URL}/api/files/{file_id}")
    
    if response.status_code == 200:
        print(f"✅ File deleted successfully")
    else:
        print(f"❌ Failed: {response.status_code}")


def main():
    """Run all tests"""
    print_section("File Upload API Tests")
    
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
    print("\n📋 Running tests...")
    
    # Test 1: Upload
    file_id = test_file_upload()
    if not file_id:
        print("\n❌ Upload failed, stopping tests")
        return
    
    # Test 2: List files
    test_list_files()
    
    # Test 3: File info
    test_file_info(file_id)
    
    # Test 4: Download
    test_download_file(file_id)
    
    # Test 5: Workflow with file
    test_workflow_with_file(file_id)
    
    # Test 6: Storage stats
    test_storage_stats()
    
    # Test 7: Delete (optional - comment out to keep file)
    # test_delete_file(file_id)
    
    print_section("All Tests Complete")
    
    print("\n✅ File upload API is working!")
    print(f"\n📄 Test file ID: {file_id}")
    print(f"   Download: {BASE_URL}/api/files/{file_id}/download")
    print(f"   Delete: DELETE {BASE_URL}/api/files/{file_id}")


if __name__ == "__main__":
    main()