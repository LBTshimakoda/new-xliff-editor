import React, { useState } from 'react';
import { Layout, Typography, Space } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import MenuBar from '../components/MenuBar';
import Settings from '../components/Settings';

const { Header, Content } = Layout;
const { Title, Text } = Typography;

const EmptyState: React.FC = () => {
  const navigate = useNavigate();
  const [settingsVisible, setSettingsVisible] = useState(false);

  const handleFileOpen = (sessionId: string) => {
    navigate(`/editor/${sessionId}`);
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ background: '#fff', padding: 0, borderBottom: '1px solid #f0f0f0' }}>
        <MenuBar
          onFileOpen={handleFileOpen}
          onSettingsClick={() => setSettingsVisible(true)}
        />
      </Header>

      <Content style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: '#fafafa'
      }}>
        <Space direction="vertical" align="center" size="large">
          <FileTextOutlined style={{ fontSize: 120, color: '#d9d9d9' }} />
          <Title level={3} style={{ color: '#8c8c8c', margin: 0 }}>
            No file open
          </Title>
          <Text type="secondary" style={{ fontSize: 16 }}>
            Press <kbd style={{ 
              background: '#fff', 
              padding: '4px 8px', 
              borderRadius: 4,
              border: '1px solid #d9d9d9',
              fontFamily: 'monospace'
            }}>Ctrl+O</kbd> or use <strong>File → Open</strong> to get started
          </Text>
        </Space>
      </Content>

      <Settings
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
      />
    </Layout>
  );
};

export default EmptyState;