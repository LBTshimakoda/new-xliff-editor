import React, { useEffect, useState } from 'react';
import { Card, List, Button, Empty, Tag, Typography, Spin, Space, App } from 'antd';
import { CopyOutlined, DatabaseOutlined, LoadingOutlined, ReloadOutlined, ImportOutlined } from '@ant-design/icons';
import { Segment, editorAPI } from '../services/api';

const { Title, Text } = Typography;

interface TMMatch {
  source: string;
  target: string;
  match: number;
  origin: string;
  usage_count: number;
}

interface TMPanelProps {
  segment: Segment | null;
  sessionId: string;
  sourceLang?: string;
  targetLang?: string;
  onInsert: (text: string) => void;
  refreshTrigger?: number; // Add this to force refresh
}

const TMPanel: React.FC<TMPanelProps> = ({ 
  segment, 
  sessionId, 
  sourceLang = 'EN',
  targetLang = 'ES',
  onInsert,
  refreshTrigger = 0
}) => {
  const [matches, setMatches] = useState<TMMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const { message, modal } = App.useApp();

  const fetchTMMatches = async () => {
    if (!segment || !segment.source || !segment.source.trim()) {
      setMatches([]);
      return;
    }

    try {
      setLoading(true);
      
      const result = await editorAPI.searchTM(
        segment.source,
        sourceLang,
        targetLang,
        70, // min match 70%
        5   // max 5 results
      );
      
      setMatches(result.matches || []);
      
    } catch (error) {
      console.error('TM search error:', error);
      setMatches([]);
    } finally {
      setLoading(false);
    }
  };

  // Fetch TM matches when segment changes OR refreshTrigger changes
  useEffect(() => {
    fetchTMMatches();
  }, [segment?.id, segment?.source, sourceLang, targetLang, refreshTrigger]);

  const handleImportToTM = async () => {
    modal.confirm({
      title: 'Import Existing Translations to TM?',
      content: (
        <div>
          <p>This will import all existing translations from the current file to the Translation Memory database.</p>
          <p><strong>Note:</strong> Existing TM entries will be skipped (not overwritten).</p>
        </div>
      ),
      okText: 'Import',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          setImporting(true);
          message.loading({ content: 'Importing translations to TM...', key: 'import' });
          
          const result = await editorAPI.importToTM(sessionId, false);
          
          message.success({
            content: `Imported ${result.imported} translations to TM (${result.skipped} already existed)`,
            key: 'import',
            duration: 5,
          });
          
          // Refresh TM matches after import
          await fetchTMMatches();
          
        } catch (error: any) {
          console.error('Import error:', error);
          message.error({
            content: `Failed to import: ${error.response?.data?.detail || error.message}`,
            key: 'import',
            duration: 5,
          });
        } finally {
          setImporting(false);
        }
      },
    });
  };

  const getMatchColor = (match: number) => {
    if (match === 100) return '#52c41a';  // Green - exact match
    if (match >= 95) return '#1890ff';    // Blue - high match
    if (match >= 85) return '#faad14';    // Orange - medium match
    return '#999';                         // Gray - low match
  };

  return (
    <div style={{ padding: 16, height: '100%', overflowY: 'auto' }}>
      <Card
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space>
              <DatabaseOutlined />
              <span>Translation Memory</span>
            </Space>
            <Space size="small">
              <Button
                size="small"
                icon={<ImportOutlined />}
                onClick={handleImportToTM}
                loading={importing}
                title="Import all existing translations to TM"
              >
                Import
              </Button>
              <Button
                size="small"
                icon={<ReloadOutlined />}
                onClick={fetchTMMatches}
                loading={loading}
                title="Refresh TM matches"
              />
            </Space>
          </div>
        }
        size="small"
        style={{ height: '100%' }}
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} />
            <div style={{ marginTop: 16 }}>
              <Text type="secondary">Searching TM...</Text>
            </div>
          </div>
        ) : matches.length > 0 ? (
          <List
            dataSource={matches}
            renderItem={(match) => (
              <Card
                size="small"
                style={{ marginBottom: 12 }}
                styles={{ body: { padding: 12 } }}
              >
                <div style={{ marginBottom: 8 }}>
                  <Tag
                    color={getMatchColor(match.match)}
                    style={{ fontWeight: 'bold' }}
                  >
                    {match.match}%
                  </Tag>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {match.origin} • Used {match.usage_count}x
                  </Text>
                </div>

                {/* Source */}
                <div style={{ marginBottom: 8 }}>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                    Source:
                  </Text>
                  <Text style={{ fontSize: 12 }}>{match.source}</Text>
                </div>

                {/* Target */}
                <div style={{ marginBottom: 8 }}>
                  <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                    Target:
                  </Text>
                  <Text strong style={{ fontSize: 13 }}>
                    {match.target}
                  </Text>
                </div>

                {/* Insert button */}
                <Button
                  size="small"
                  type="primary"
                  icon={<CopyOutlined />}
                  onClick={() => onInsert(match.target)}
                  block
                >
                  Insert
                </Button>
              </Card>
            )}
          />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <span>
                <Text type="secondary">No TM matches found</Text>
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Translations will be saved to TM automatically
                </Text>
              </span>
            }
          />
        )}
      </Card>
    </div>
  );
};

export default TMPanel;