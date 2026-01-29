import React from 'react';
import { Card, List, Button, Empty, Tag, Typography } from 'antd';
import { CopyOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Segment } from '../services/api';

const { Title, Text } = Typography;

interface TMPanelProps {
  segment: Segment | null;
  sessionId: string;
  onInsert: (text: string) => void;
}

const TMPanel: React.FC<TMPanelProps> = ({ segment, sessionId, onInsert }) => {
  // Mock TM matches - in real implementation, fetch from API
  const tmMatches = segment?.tm_match
    ? [
        {
          id: '1',
          source: segment.source,
          target: segment.target || 'Example translation',
          match: segment.tm_match,
          origin: 'Project TM',
        },
      ]
    : [];

  const getMatchColor = (match: number) => {
    if (match === 100) return '#52c41a';
    if (match >= 95) return '#1890ff';
    if (match >= 85) return '#faad14';
    return '#999';
  };

  return (
    <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
      <Title level={4} style={{ marginBottom: 16 }}>
        Translation Memory
      </Title>

      {tmMatches.length > 0 ? (
        <List
          dataSource={tmMatches}
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
                  {match.origin}
                </Text>
              </div>

              <div style={{ marginBottom: 8 }}>
                <Text strong style={{ fontSize: 11, color: '#999' }}>
                  SOURCE:
                </Text>
                <div style={{
                  padding: 8,
                  background: '#fafafa',
                  borderRadius: 4,
                  fontSize: 12,
                  marginTop: 4,
                }}>
                  {match.source}
                </div>
              </div>

              <div style={{ marginBottom: 8 }}>
                <Text strong style={{ fontSize: 11, color: '#999' }}>
                  TARGET:
                </Text>
                <div style={{
                  padding: 8,
                  background: '#f0f5ff',
                  borderRadius: 4,
                  fontSize: 12,
                  marginTop: 4,
                }}>
                  {match.target}
                </div>
              </div>

              <Button
                size="small"
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
          description="No TM matches"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ marginTop: 40 }}
        />
      )}

      {/* MT Section */}
      <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid #f0f0f0' }}>
        <Title level={5} style={{ marginBottom: 12 }}>
          Machine Translation
        </Title>
        <Button
          icon={<ThunderboltOutlined />}
          type="dashed"
          block
          disabled
        >
          Translate with MT
        </Button>
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 8 }}>
          MT integration coming soon
        </Text>
      </div>
    </div>
  );
};

export default TMPanel;