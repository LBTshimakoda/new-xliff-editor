import React, { useState, useEffect, useRef } from 'react';
import { Card, Input, Button, Space, Tag, Alert, Tooltip, App } from 'antd';
import {
  CheckCircleOutlined,
  WarningOutlined,
  CopyOutlined,
  ClearOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { Segment, editorAPI } from '../services/api';

const { TextArea } = Input;

interface SegmentEditorProps {
  segment: Segment;
  onSave: (target: string, state?: 'translated' | 'reviewed') => void;
  onNext: () => void;
  onPrevious: () => void;
  saving?: boolean;
  sourceLang?: string;
  targetLang?: string;
  tmInsertedText?: string | null;
  onTmTextUsed?: () => void;
}

const SegmentEditor: React.FC<SegmentEditorProps> = ({
  segment,
  onSave,
  onNext,
  onPrevious,
  saving = false,
  sourceLang = 'EN',
  targetLang = 'ES',
  tmInsertedText = null,
  onTmTextUsed,
}) => {
  const [target, setTarget] = useState(segment.target || '');
  const [hasChanges, setHasChanges] = useState(false);
  const [translating, setTranslating] = useState(false);
  const targetInputRef = useRef<any>(null);
  const { message } = App.useApp();

  // Update target when segment changes
  useEffect(() => {
    setTarget(segment.target || '');
    setHasChanges(false);
  }, [segment.id]);

  // Handle TM inserted text
  useEffect(() => {
    if (tmInsertedText) {
      setTarget(tmInsertedText);
      setHasChanges(true);
      targetInputRef.current?.focus();
      onTmTextUsed?.();
    }
  }, [tmInsertedText, onTmTextUsed]);

  // Focus target input
  useEffect(() => {
    targetInputRef.current?.focus();
  }, [segment.id]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Ctrl + Enter = Confirm & Next
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        handleConfirmAndNext();
      }
      // Ctrl + S = Save
      else if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [target]);

  const handleTargetChange = (value: string) => {
    setTarget(value);
    setHasChanges(value !== (segment.target || ''));
  };

  const handleCopySource = () => {
    setTarget(segment.source);
    setHasChanges(true);
    targetInputRef.current?.focus();
  };

  const handleClear = () => {
    setTarget('');
    setHasChanges(true);
    targetInputRef.current?.focus();
  };

  const handleSave = () => {
    onSave(target, 'translated');
    setHasChanges(false);
  };

  const handleConfirmAndNext = () => {
    if (hasChanges || !segment.target) {
      onSave(target, 'translated');
    }
    setHasChanges(false);
    setTimeout(() => onNext(), 100);
  };

  const handleMachineTranslate = async () => {
    try {
      setTranslating(true);
      
      message.loading({ content: 'Translating with MT...', key: 'mt' });
      
      // Call MT API
      const result = await editorAPI.translateSegment(
        segment.source,
        sourceLang,
        targetLang,
        'qwen2.5:14b',  // TODO: Get from Settings
        'http://localhost:11434'  // TODO: Get from Settings
      );
      
      // Set the translated text
      setTarget(result.translation);
      setHasChanges(true);
      
      message.success({ 
        content: `Translation completed with ${result.model}`, 
        key: 'mt',
        duration: 2
      });
      
      // Focus on target input so user can review/edit
      targetInputRef.current?.focus();
      
    } catch (error: any) {
      console.error('MT Error:', error);
      
      let errorMessage = 'Translation failed';
      if (error.response?.status === 503) {
        errorMessage = 'Ollama is not running. Please start Ollama.';
      } else if (error.response?.status === 504) {
        errorMessage = 'Translation timeout. Model might not be downloaded.';
      } else if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      }
      
      message.error({ 
        content: errorMessage, 
        key: 'mt',
        duration: 5
      });
    } finally {
      setTranslating(false);
    }
  };

  const getStateColor = (state: string) => {
    switch (state) {
      case 'translated':
        return 'success';
      case 'reviewed':
        return 'processing';
      case 'locked':
        return 'default';
      default:
        return 'warning';
    }
  };

  return (
    <Card
      style={{ borderRadius: 8 }}
      styles={{ body: { padding: 24 } }}
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {/* Segment Info */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <Tag color="blue">ID: {segment.id}</Tag>
            <Tag color={getStateColor(segment.state)}>
              {segment.state.toUpperCase()}
            </Tag>
            {segment.tm_match !== undefined && segment.tm_match > 0 && (
              <Tag color="purple">
                TM: {segment.tm_match}%
              </Tag>
            )}
          </Space>
          {hasChanges && (
            <Tag color="orange">Unsaved Changes</Tag>
          )}
        </div>

        {/* Source Text */}
        <div>
          <div style={{ 
            marginBottom: 8, 
            fontWeight: 600, 
            color: '#666',
            fontSize: 12,
            textTransform: 'uppercase'
          }}>
            Source
          </div>
          <div style={{
            padding: '12px 16px',
            background: '#f5f5f5',
            borderRadius: 6,
            border: '1px solid #d9d9d9',
            minHeight: 60,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontFamily: 'monospace',
            fontSize: 14,
          }}>
            {segment.source}
          </div>
        </div>

        {/* Target Text */}
        <div>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: 8 
          }}>
            <span style={{ 
              fontWeight: 600, 
              color: '#666',
              fontSize: 12,
              textTransform: 'uppercase'
            }}>
              Target
            </span>
            <Space size="small">
              <Tooltip title="Copy source to target">
                <Button
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={handleCopySource}
                >
                  Copy Source
                </Button>
              </Tooltip>
              <Tooltip title="Clear target">
                <Button
                  size="small"
                  icon={<ClearOutlined />}
                  onClick={handleClear}
                  danger
                >
                  Clear
                </Button>
              </Tooltip>
            </Space>
          </div>
          <TextArea
            ref={targetInputRef}
            value={target}
            onChange={(e) => handleTargetChange(e.target.value)}
            placeholder="Enter translation here..."
            autoSize={{ minRows: 3, maxRows: 10 }}
            style={{
              fontFamily: 'monospace',
              fontSize: 14,
            }}
          />
          <div style={{ 
            marginTop: 8, 
            fontSize: 12, 
            color: '#999',
            display: 'flex',
            justifyContent: 'space-between'
          }}>
            <span>Character count: {target.length}</span>
            <span>Source length: {segment.source.length}</span>
          </div>
        </div>

        {/* Warnings */}
        {segment.warnings && segment.warnings.length > 0 && (
          <Alert
            message="Quality Warnings"
            description={
              <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
                {segment.warnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            }
            type="warning"
            showIcon
            icon={<WarningOutlined />}
          />
        )}

        {/* Notes */}
        {segment.notes && segment.notes.length > 0 && (
          <Alert
            message="Notes"
            description={
              <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
                {segment.notes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            }
            type="info"
            showIcon
          />
        )}

        {/* Actions */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          paddingTop: 16,
          borderTop: '1px solid #f0f0f0'
        }}>
          <Space>
            <Button onClick={handleSave} loading={saving} disabled={!hasChanges}>
              Save
            </Button>
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={handleConfirmAndNext}
              loading={saving}
            >
              Confirm & Next
            </Button>
          </Space>

          <Tooltip title={`Translate with Ollama (${sourceLang} → ${targetLang})`}>
            <Button 
              icon={<ThunderboltOutlined />}
              onClick={handleMachineTranslate}
              loading={translating}
              disabled={saving}
            >
              MT Translate
            </Button>
          </Tooltip>
        </div>
      </Space>
    </Card>
  );
};

export default SegmentEditor;