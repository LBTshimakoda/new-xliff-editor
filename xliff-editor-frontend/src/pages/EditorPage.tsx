import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Layout,
  Progress,
  Button,
  Space,
  Typography,
  App,
  Spin,
  Select,
  Tag,
  Tooltip,
  Drawer,
  Divider,
  Modal,
  Form,
  Input,
} from 'antd';
import {
  LeftOutlined,
  RightOutlined,
  SaveOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  FilterOutlined,
} from '@ant-design/icons';
import { editorAPI, Segment } from '../services/api';
import SegmentEditor from '../components/SegmentEditor';
import TMPanel from '../components/TMPanel';
import Settings from '../components/Settings';
import MenuBar from '../components/MenuBar';
import './EditorPage.css';

const { Header, Content, Sider } = Layout;
const { Title, Text } = Typography;

type FilterType = 'all' | 'untranslated' | 'translated' | 'warnings';

const EditorPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { message } = App.useApp(); // Use App's message hook

  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [filter, setFilter] = useState<FilterType>('all');
  const [tmPanelVisible, setTmPanelVisible] = useState(true);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [saveAsVisible, setSaveAsVisible] = useState(false);
  const [saveAsFilename, setSaveAsFilename] = useState('');
  const [tmInsertedText, setTmInsertedText] = useState<string | null>(null);
  const [tmRefreshTrigger, setTmRefreshTrigger] = useState(0);

  // Fetch session info
  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => editorAPI.getSession(sessionId!),
    enabled: !!sessionId,
  });

  // Fetch segments with pagination (backend limit is 100 per request)
  const {
    data: segmentsData,
    isLoading: segmentsLoading,
    refetch: refetchSegments,
  } = useQuery({
    queryKey: ['segments', sessionId, filter],
    queryFn: async () => {
      // Load all segments by paginating through 100-segment chunks
      const allSegments: Segment[] = [];
      let offset = 0;
      const limit = 100; // Backend max
      let hasMore = true;

      while (hasMore) {
        const result = await editorAPI.getSegments(sessionId!, {
          offset,
          limit,
          filter: filter === 'all' ? undefined : filter,
        });

        allSegments.push(...result.segments);
        hasMore = result.has_more;
        offset += limit;

        // Safety limit: don't load more than 10,000 segments
        if (offset >= 10000) break;
      }

      return {
        segments: allSegments,
        total: allSegments.length,
        offset: 0,
        limit: allSegments.length,
        has_more: false,
      };
    },
    enabled: !!sessionId,
  });

  // Update segment mutation
  const updateMutation = useMutation({
    mutationFn: ({
      segmentId,
      target,
      state,
    }: {
      segmentId: string;
      target: string;
      state?: 'translated' | 'reviewed';
    }) => editorAPI.updateSegment(sessionId!, segmentId, { target, state }),
    onSuccess: (data) => {
      // Update cache
      queryClient.invalidateQueries({ queryKey: ['segments', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });

      // Refresh TM panel to show newly saved translation
      setTmRefreshTrigger(prev => prev + 1);

      if (data.warnings.length > 0) {
        message.warning({
          content: (
            <div>
              <div>Translation saved with warnings:</div>
              <ul style={{ margin: '8px 0', paddingLeft: 20 }}>
                {data.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          ),
          duration: 5,
        });
      } else {
        message.success('Segment saved successfully');
      }
    },
    onError: (error: any) => {
      message.error(`Failed to save: ${error.response?.data?.detail || error.message}`);
    },
  });

  // Download file helper (used by both Save and Save As)
  const downloadFile = async (customFilename?: string) => {
    try {
      message.loading({ content: 'Saving file...', key: 'save' });
      
      const response = await editorAPI.downloadTranslatedFile(sessionId!);
      
      // Create blob from response
      const blob = new Blob([response.data], { 
        type: response.headers['content-type'] || 'application/octet-stream'
      });
      
      // Determine filename
      let filename = customFilename;
      if (!filename) {
        // Try to get from Content-Disposition header
        const contentDisposition = response.headers['content-disposition'];
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
          if (filenameMatch && filenameMatch[1]) {
            filename = filenameMatch[1].replace(/['"]/g, '');
          }
        }
      }
      
      // Fallback to session filename
      if (!filename) {
        filename = session?.filename || 'translated.xliff';
      }
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      message.success({ 
        content: `File saved: ${filename}`, 
        key: 'save',
        duration: 2
      });
      
      return true;
      
    } catch (error: any) {
      console.error('Save error:', error);
      message.error({
        content: `Failed to save file: ${error.message}`,
        key: 'save'
      });
      return false;
    }
  };

  // File → Save: Download with original filename
  const handleSave = async () => {
    await downloadFile(session?.filename);
  };

  // File → Save As: Show dialog for custom filename
  const handleSaveAs = () => {
    // Get current filename without extension
    const currentName = session?.filename.replace(/\.(xliff|xlf|xlz)$/i, '') || 'document';
    setSaveAsFilename(currentName);
    setSaveAsVisible(true);
  };

  // Confirm Save As with custom filename
  const handleSaveAsConfirm = async () => {
    if (!saveAsFilename.trim()) {
      message.error('Please enter a filename');
      return;
    }
    
    // Add appropriate extension
    const extension = session?.is_xlz ? '.xlz' : '.xliff';
    const filename = saveAsFilename.trim() + extension;
    
    const success = await downloadFile(filename);
    if (success) {
      setSaveAsVisible(false);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Alt + Down = Next segment
      if (e.altKey && e.key === 'ArrowDown') {
        e.preventDefault();
        handleNext();
      }
      // Alt + Up = Previous segment
      else if (e.altKey && e.key === 'ArrowUp') {
        e.preventDefault();
        handlePrevious();
      }
      // Ctrl + S = Save (handled in SegmentEditor)
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [currentSegmentIndex, segmentsData]);

  const handleNext = useCallback(() => {
    if (segmentsData && currentSegmentIndex < segmentsData.segments.length - 1) {
      setCurrentSegmentIndex((prev) => prev + 1);
    }
  }, [currentSegmentIndex, segmentsData]);

  const handlePrevious = useCallback(() => {
    if (currentSegmentIndex > 0) {
      setCurrentSegmentIndex((prev) => prev - 1);
    }
  }, [currentSegmentIndex]);

  const handleSaveSegment = (target: string, state?: 'translated' | 'reviewed') => {
    const currentSegment = segmentsData?.segments[currentSegmentIndex];
    if (currentSegment) {
      updateMutation.mutate({
        segmentId: currentSegment.id,
        target,
        state: state || 'translated',
      });
    }
  };

  if (sessionLoading || segmentsLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh' 
      }}>
        <Space direction="vertical" align="center">
          <Spin size="large" />
          <Text>Loading editor...</Text>
        </Space>
      </div>
    );
  }

  if (!session || !segmentsData) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <Title level={3}>Session not found</Title>
        <Button type="primary" onClick={() => navigate('/')}>
          Back to Home
        </Button>
      </div>
    );
  }

  const currentSegment = segmentsData.segments[currentSegmentIndex];
  const progressPercent = Math.round((session.translated_count / session.total_segments) * 100);
  
  // Extract languages from session
  const sourceLanguage = session.source_language || 'UNKNOWN';
  const targetLanguage = session.target_language || 'UNKNOWN';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {/* Header */}
      <Header style={{ 
        background: '#fff', 
        padding: 0,
        borderBottom: '1px solid #f0f0f0',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Menu Bar */}
        <div style={{ borderBottom: '1px solid #f0f0f0' }}>
          <MenuBar
            onFileOpen={(newSessionId) => navigate(`/editor/${newSessionId}`)}
            onSettingsClick={() => setSettingsVisible(true)}
            onSave={handleSave}
            onSaveAs={handleSaveAs}
            onClose={() => navigate('/')}
            hasActiveSession={true}
          />
        </div>

        {/* File Info Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 24px',
        }}>
          <Space size="large">
            <div>
              <Title level={5} style={{ margin: 0 }}>
                {session.filename}
              </Title>
              <Space size="small" style={{ fontSize: 12, color: '#666' }}>
                <Text type="secondary">Session: {sessionId?.substring(0, 8)}...</Text>
                <Divider type="vertical" />
                <Tag color="blue">{sourceLanguage}</Tag>
                <Text type="secondary">→</Text>
                <Tag color="green">{targetLanguage}</Tag>
              </Space>
            </div>
          </Space>

          <Space size="middle">
            <div>
              <Text strong>Progress: </Text>
              <Tag color={progressPercent === 100 ? 'success' : 'processing'}>
                {session.translated_count}/{session.total_segments} ({progressPercent}%)
              </Tag>
            </div>
            <Progress
              percent={progressPercent}
              style={{ width: 200 }}
              strokeColor="#52c41a"
            />
          </Space>
        </div>
      </Header>

      <Settings
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
      />

      <Layout>
        {/* Main Content */}
        <Content style={{ padding: 24, background: '#f5f5f5' }}>
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            {/* Segment Navigation */}
            <div style={{ 
              background: '#fff', 
              padding: '16px 24px', 
              borderRadius: 8,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <Space>
                <Button
                  icon={<LeftOutlined />}
                  onClick={handlePrevious}
                  disabled={currentSegmentIndex === 0}
                >
                  Previous
                </Button>
                <Text strong>
                  Segment {currentSegmentIndex + 1} / {segmentsData.total}
                </Text>
                <Button
                  icon={<RightOutlined />}
                  onClick={handleNext}
                  disabled={currentSegmentIndex >= segmentsData.segments.length - 1}
                  type="primary"
                >
                  Next
                </Button>
              </Space>

              <Space>
                <Select
                  value={filter}
                  onChange={setFilter}
                  style={{ width: 180 }}
                  options={[
                    { value: 'all', label: 'All Segments' },
                    { value: 'untranslated', label: 'Untranslated Only' },
                    { value: 'translated', label: 'Translated Only' },
                    { value: 'warnings', label: 'With Warnings' },
                  ]}
                  prefix={<FilterOutlined />}
                />
                <Button onClick={() => setTmPanelVisible(!tmPanelVisible)}>
                  {tmPanelVisible ? 'Hide' : 'Show'} TM Panel
                </Button>
              </Space>
            </div>

            {/* Segment Editor */}
            {currentSegment && (
              <SegmentEditor
                segment={currentSegment}
                onSave={handleSaveSegment}
                onNext={handleNext}
                onPrevious={handlePrevious}
                saving={updateMutation.isPending}
                sourceLang={sourceLanguage}
                targetLang={targetLanguage}
                tmInsertedText={tmInsertedText}
                onTmTextUsed={() => setTmInsertedText(null)}
              />
            )}

            {/* Keyboard Shortcuts Help */}
            <div style={{ 
              background: '#fff', 
              padding: 16, 
              borderRadius: 8,
              fontSize: 12
            }}>
              <Text type="secondary">
                <strong>Keyboard Shortcuts:</strong> Alt+↓ = Next | Alt+↑ = Previous | Ctrl+Enter = Confirm & Next | Ctrl+S = Save
              </Text>
            </div>
          </Space>
        </Content>

        {/* TM Panel (Right Sidebar) */}
        {tmPanelVisible && (
          <Sider width={350} style={{ background: '#fff', borderLeft: '1px solid #f0f0f0' }}>
            <TMPanel 
              segment={currentSegment} 
              sessionId={sessionId!}
              sourceLang={sourceLanguage}
              targetLang={targetLanguage}
              refreshTrigger={tmRefreshTrigger}
              onInsert={(text) => {
                // Store the inserted text so SegmentEditor can use it
                setTmInsertedText(text);
                message.success('TM match inserted');
              }}
            />
          </Sider>
        )}
      </Layout>

      {/* Save As Dialog */}
      <Modal
        title="Save As"
        open={saveAsVisible}
        onOk={handleSaveAsConfirm}
        onCancel={() => setSaveAsVisible(false)}
        okText="Save"
      >
        <Form layout="vertical">
          <Form.Item 
            label="Filename"
            help={`File will be saved as ${saveAsFilename}${session?.is_xlz ? '.xlz' : '.xliff'}`}
          >
            <Input
              value={saveAsFilename}
              onChange={(e) => setSaveAsFilename(e.target.value)}
              placeholder="Enter filename"
              suffix={
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {session?.is_xlz ? '.xlz' : '.xliff'}
                </Text>
              }
              onPressEnter={handleSaveAsConfirm}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Settings Modal */}
      <Settings
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
      />
    </Layout>
  );
};

export default EditorPage;