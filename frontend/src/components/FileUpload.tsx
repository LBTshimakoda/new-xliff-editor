import React, { useState, useCallback } from 'react';
import axios from 'axios';
import { useApp, UploadedFile } from '../contexts/AppContext';

interface FileUploadProps {
  onFileUploaded?: (file: UploadedFile) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileUploaded }) => {
  // Use AppContext for global file management
  const { uploadedFiles, addUploadedFile, selectedFileId, setSelectedFileId } = useApp();
  
  // Local UI state
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Validate file type
  const isValidFile = (file: File): boolean => {
    const validExtensions = ['.xliff', '.xlf', '.xml', '.xlz'];
    const fileName = file.name.toLowerCase();
    return validExtensions.some(ext => fileName.endsWith(ext));
  };

  // Handle file upload
  const uploadFile = async (file: File) => {
    if (!isValidFile(file)) {
      setError(`Invalid file type. Please upload XLIFF files (.xliff, .xlf)`);
      return;
    }

    setIsUploading(true);
    setError(null);
    setSuccessMessage(null);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('description', `Uploaded: ${file.name}`);

      const response = await axios.post<UploadedFile>(
        'http://localhost:8000/api/files/upload',
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              setUploadProgress(progress);
            }
          },
        }
      );

      // Add to global context instead of local state
      addUploadedFile(response.data);
      
      // Automatically select the uploaded file
      setSelectedFileId(response.data.file_id);
      
      setSuccessMessage(`✅ Successfully uploaded: ${response.data.filename}`);
      
      // Notify parent component if callback provided
      if (onFileUploaded) {
        onFileUploaded(response.data);
      }

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);

    } catch (err: any) {
      setError(`Failed to upload file: ${err.response?.data?.detail || err.message}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // Handle drag events
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      uploadFile(files[0]); // Upload first file
    }
  }, []);

  // Handle click to browse
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      uploadFile(files[0]);
    }
  };

  // Handle file selection from the list
  const handleFileSelect = (fileId: string) => {
    setSelectedFileId(fileId);
  };

  // Format date
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  return (
    <div className="file-upload-container" style={styles.container}>
      {/* Drop Zone */}
      <div
        className={`drop-zone ${isDragging ? 'dragging' : ''}`}
        style={{
          ...styles.dropZone,
          ...(isDragging ? styles.dropZoneDragging : {}),
        }}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div style={styles.dropZoneContent}>
          {/* Icon */}
          <div style={styles.icon}>
            📁
          </div>

          {/* Text */}
          <h3 style={styles.title}>
            {isDragging ? 'Drop XLIFF file here' : 'Upload XLIFF File'}
          </h3>
          <p style={styles.subtitle}>
            Drag and drop your XLIFF file here, or click to browse
          </p>

          {/* Browse Button */}
          <label htmlFor="file-input" style={styles.browseButton}>
            Browse Files
          </label>
          <input
            id="file-input"
            type="file"
            accept=".xliff,.xlf,.xml,.xlz"
            onChange={handleFileInputChange}
            style={styles.fileInput}
            disabled={isUploading}
          />

          {/* Accepted formats */}
          <p style={styles.formats}>
            Accepted formats: .xliff, .xlf, .xml, .xlz
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      {isUploading && (
        <div style={styles.progressContainer}>
          <div style={styles.progressBar}>
            <div
              style={{
                ...styles.progressFill,
                width: `${uploadProgress}%`,
              }}
            />
          </div>
          <p style={styles.progressText}>Uploading... {uploadProgress}%</p>
        </div>
      )}

      {/* Success Message */}
      {successMessage && (
        <div style={styles.successMessage}>
          {successMessage}
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div style={styles.errorMessage}>
          ❌ {error}
        </div>
      )}

      {/* Uploaded Files List */}
      {uploadedFiles.length > 0 && (
        <div style={styles.filesList}>
          <h3 style={styles.filesListTitle}>
            Uploaded Files ({uploadedFiles.length})
          </h3>
          {uploadedFiles.map((file) => (
            <div 
              key={file.file_id} 
              style={{
                ...styles.fileCard,
                ...(selectedFileId === file.file_id ? styles.fileCardSelected : {})
              }}
              onClick={() => handleFileSelect(file.file_id)}
            >
              <div style={styles.fileIcon}>📄</div>
              <div style={styles.fileInfo}>
                <div style={styles.fileName}>
                  {file.filename}
                  {selectedFileId === file.file_id && (
                    <span style={styles.selectedBadge}>✓ Selected</span>
                  )}
                </div>
                <div style={styles.fileMetadata}>
                  {file.size_formatted} • {formatDate(file.uploaded_at)}
                </div>
              </div>
              <div style={styles.fileId}>
                ID: {file.file_id.slice(0, 8)}...
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Styles
const styles: { [key: string]: React.CSSProperties } = {
  container: {
    width: '100%',
    maxWidth: '600px',
    margin: '0 auto',
    padding: '20px',
  },
  dropZone: {
    border: '2px dashed #cbd5e0',
    borderRadius: '8px',
    padding: '40px 20px',
    textAlign: 'center',
    backgroundColor: '#f7fafc',
    transition: 'all 0.3s ease',
    cursor: 'pointer',
  },
  dropZoneDragging: {
    borderColor: '#4299e1',
    backgroundColor: '#ebf8ff',
    transform: 'scale(1.02)',
  },
  dropZoneContent: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
  },
  icon: {
    fontSize: '48px',
    marginBottom: '8px',
  },
  title: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#2d3748',
    margin: 0,
  },
  subtitle: {
    fontSize: '14px',
    color: '#718096',
    margin: 0,
  },
  browseButton: {
    display: 'inline-block',
    padding: '10px 24px',
    backgroundColor: '#4299e1',
    color: 'white',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    marginTop: '12px',
    transition: 'background-color 0.2s',
  },
  fileInput: {
    display: 'none',
  },
  formats: {
    fontSize: '12px',
    color: '#a0aec0',
    margin: '8px 0 0 0',
  },
  progressContainer: {
    marginTop: '20px',
  },
  progressBar: {
    width: '100%',
    height: '8px',
    backgroundColor: '#e2e8f0',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4299e1',
    transition: 'width 0.3s ease',
  },
  progressText: {
    textAlign: 'center',
    marginTop: '8px',
    fontSize: '14px',
    color: '#4a5568',
  },
  successMessage: {
    marginTop: '16px',
    padding: '12px',
    backgroundColor: '#c6f6d5',
    border: '1px solid #9ae6b4',
    borderRadius: '6px',
    color: '#22543d',
    fontSize: '14px',
  },
  errorMessage: {
    marginTop: '16px',
    padding: '12px',
    backgroundColor: '#fed7d7',
    border: '1px solid #fc8181',
    borderRadius: '6px',
    color: '#742a2a',
    fontSize: '14px',
  },
  filesList: {
    marginTop: '30px',
  },
  filesListTitle: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#2d3748',
    marginBottom: '12px',
  },
  fileCard: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px',
    backgroundColor: 'white',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    marginBottom: '8px',
    gap: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  fileCardSelected: {
    backgroundColor: '#ebf8ff',
    borderColor: '#4299e1',
    borderWidth: '2px',
  },
  fileIcon: {
    fontSize: '24px',
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#2d3748',
    marginBottom: '4px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  selectedBadge: {
    fontSize: '11px',
    backgroundColor: '#4299e1',
    color: 'white',
    padding: '2px 8px',
    borderRadius: '12px',
    fontWeight: '600',
  },
  fileMetadata: {
    fontSize: '12px',
    color: '#718096',
  },
  fileId: {
    fontSize: '11px',
    color: '#a0aec0',
    fontFamily: 'monospace',
  },
};

export default FileUpload;