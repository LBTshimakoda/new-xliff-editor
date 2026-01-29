import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Card, Typography, Space, App, Spin } from 'antd';
import { InboxOutlined, FileTextOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { editorAPI } from '../services/api';

const { Dragger } = Upload;
const { Title, Text } = Typography;

const UploadPage: React.FC = () => {
  const navigate = useNavigate();
  const [uploading, setUploading] = useState(false);
  const { message } = App.useApp(); // Use App's message hook

  const handleUpload: UploadProps['customRequest'] = async ({ file, onSuccess, onError }) => {
    try {
      setUploading(true);
      const uploadFile = file as File;

      // Validate file type
      const validExtensions = ['.xliff', '.xlf', '.xlz'];
      const fileExtension = uploadFile.name.substring(uploadFile.name.lastIndexOf('.')).toLowerCase();
      
      if (!validExtensions.includes(fileExtension)) {
        message.error('Please upload a valid XLIFF or XLZ file');
        onError?.(new Error('Invalid file type'));
        return;
      }

      message.loading({ content: 'Uploading and analyzing file...', key: 'upload' });

      // Upload file
      const response = await editorAPI.uploadFile(uploadFile);

      message.success({
        content: `File uploaded! Found ${response.total_segments} segments.`,
        key: 'upload',
        duration: 2,
      });

      // Navigate to editor
      setTimeout(() => {
        navigate(`/editor/${response.session_id}`);
      }, 500);

      onSuccess?.(response);
    } catch (error: any) {
      console.error('Upload error:', error);
      message.error({
        content: `Upload failed: ${error.response?.data?.detail || error.message}`,
        key: 'upload',
      });
      onError?.(error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <Card 
        style={{ 
          maxWidth: 600, 
          width: '100%',
          borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
        }}
      >
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            <FileTextOutlined style={{ fontSize: 48, color: '#1890ff', marginBottom: 16 }} />
            <Title level={2} style={{ marginBottom: 8 }}>XLIFF Editor</Title>
            <Text type="secondary">
              Professional translation editor for XLIFF and XLZ files
            </Text>
          </div>

          <Dragger
            name="file"
            multiple={false}
            customRequest={handleUpload}
            disabled={uploading}
            showUploadList={false}
            accept=".xliff,.xlf,.xlz"
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">
              Click or drag file to upload
            </p>
            <p className="ant-upload-hint">
              Supports XLIFF 1.2, XLIFF 2.0, and XLZ (memoQ) files
            </p>
          </Dragger>

          {uploading && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <Spin size="large" />
              <div style={{ marginTop: 16 }}>
                <Text>Processing your file...</Text>
              </div>
            </div>
          )}

          <div style={{ 
            background: '#f0f2f5', 
            padding: 16, 
            borderRadius: 8,
            fontSize: 13
          }}>
            <Text type="secondary">
              <strong>Features:</strong>
              <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
                <li>Segment-by-segment editing</li>
                <li>Translation Memory integration</li>
                <li>Machine Translation support</li>
                <li>Quality assurance checks</li>
                <li>Keyboard shortcuts for productivity</li>
              </ul>
            </Text>
          </div>
        </Space>
      </Card>
    </div>
  );
};

export default UploadPage;