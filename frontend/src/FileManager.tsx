import React, { useState } from 'react';
import FileUpload from './components/FileUpload';

interface UploadedFile {
  file_id: string;
  filename: string;
  size: number;
  size_formatted: string;
  content_type: string;
  uploaded_at: string;
}

const FileManager: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<UploadedFile | null>(null);

  const handleFileUploaded = (file: UploadedFile) => {
    console.log('File uploaded:', file);
    setSelectedFile(file);
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>XLIFF File Upload</h1>
        <p style={styles.subtitle}>
          Upload your XLIFF files for translation workflows
        </p>
      </div>

      <FileUpload onFileUploaded={handleFileUploaded} />

      {selectedFile && (
        <div style={styles.selectedFile}>
          <h3 style={styles.selectedTitle}>File Ready for Workflow</h3>
          <div style={styles.selectedInfo}>
            <p><strong>Filename:</strong> {selectedFile.filename}</p>
            <p><strong>Size:</strong> {selectedFile.size_formatted}</p>
            <p><strong>File ID:</strong> {selectedFile.file_id}</p>
            <p><strong>Uploaded:</strong> {new Date(selectedFile.uploaded_at).toLocaleString()}</p>
          </div>
          <button style={styles.workflowButton}>
            Create Workflow with This File →
          </button>
        </div>
      )}

      <div style={styles.instructions}>
        <h3 style={styles.instructionsTitle}>How to Use</h3>
        <ol style={styles.instructionsList}>
          <li>Upload your XLIFF file using drag-and-drop or browse</li>
          <li>Wait for upload to complete</li>
          <li>File will appear in the list below</li>
          <li>Use the file ID in your workflow execution</li>
        </ol>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    height: '100%',
    backgroundColor: '#f7fafc',
    padding: '40px 20px',
    overflowY: 'auto',
    overflowX: 'hidden',
  },
  header: {
    textAlign: 'center',
    marginBottom: '40px',
  },
  title: {
    fontSize: '32px',
    fontWeight: '700',
    color: '#2d3748',
    margin: '0 0 8px 0',
  },
  subtitle: {
    fontSize: '16px',
    color: '#718096',
    margin: 0,
  },
  selectedFile: {
    maxWidth: '600px',
    margin: '30px auto',
    padding: '20px',
    backgroundColor: 'white',
    border: '2px solid #48bb78',
    borderRadius: '8px',
  },
  selectedTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#22543d',
    marginTop: 0,
    marginBottom: '16px',
  },
  selectedInfo: {
    fontSize: '14px',
    color: '#2d3748',
    marginBottom: '16px',
  },
  workflowButton: {
    width: '100%',
    padding: '12px 24px',
    backgroundColor: '#4299e1',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    fontSize: '16px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
  },
  instructions: {
    maxWidth: '600px',
    margin: '40px auto',
    padding: '20px',
    backgroundColor: 'white',
    borderRadius: '8px',
    border: '1px solid #e2e8f0',
  },
  instructionsTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#2d3748',
    marginTop: 0,
  },
  instructionsList: {
    fontSize: '14px',
    color: '#4a5568',
    lineHeight: '1.8',
    paddingLeft: '20px',
  },
};

export default FileManager;