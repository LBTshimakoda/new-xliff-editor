import React, { useState } from 'react';
import { Modal, Form, Input, Select, Switch, Button, Tabs, Space, Typography, Divider } from 'antd';
import {
  SettingOutlined,
  DatabaseOutlined,
  ThunderboltOutlined,
  GlobalOutlined,
} from '@ant-design/icons';

const { Title, Text } = Typography;
const { TabPane } = Tabs;

interface SettingsProps {
  visible: boolean;
  onClose: () => void;
}

const Settings: React.FC<SettingsProps> = ({ visible, onClose }) => {
  const [form] = Form.useForm();

  // Default settings (load from localStorage or API later)
  const [settings, setSettings] = useState({
    // TM Settings
    tm: {
      enabled: true,
      database: 'default',
      minMatchThreshold: 75,
      fuzzyMatching: true,
    },
    // MT Settings
    mt: {
      enabled: true,
      provider: 'ollama',
      model: 'qwen2.5:14b',
      apiUrl: 'http://localhost:11434',
    },
    // QA Settings
    qa: {
      checkNumbers: true,
      checkPlaceholders: true,
      checkLength: true,
      checkTags: true,
    },
    // UI Settings
    ui: {
      autoSave: true,
      autoSaveInterval: 30,
      showWarnings: true,
    },
  });

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      // TODO: Save to localStorage or API
      console.log('Settings saved:', values);
      setSettings(values);
      onClose();
    } catch (error) {
      console.error('Validation failed:', error);
    }
  };

  const handleReset = () => {
    form.resetFields();
  };

  return (
    <Modal
      title={
        <Space>
          <SettingOutlined />
          <span>Settings</span>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      width={800}
      footer={[
        <Button key="reset" onClick={handleReset}>
          Reset to Defaults
        </Button>,
        <Button key="cancel" onClick={onClose}>
          Cancel
        </Button>,
        <Button key="save" type="primary" onClick={handleSave}>
          Save Settings
        </Button>,
      ]}
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={settings}
      >
        <Tabs defaultActiveKey="tm">
          {/* Translation Memory Tab */}
          <TabPane
            tab={
              <span>
                <DatabaseOutlined />
                Translation Memory
              </span>
            }
            key="tm"
          >
            <Form.Item
              name={['tm', 'enabled']}
              label="Enable Translation Memory"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>

            <Form.Item
              name={['tm', 'database']}
              label="TM Database"
              help="Select which Translation Memory database to use"
            >
              <Select>
                <Select.Option value="default">Default TM</Select.Option>
                <Select.Option value="project">Project TM</Select.Option>
                <Select.Option value="client">Client TM</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item
              name={['tm', 'minMatchThreshold']}
              label="Minimum Match Threshold (%)"
              help="Only show TM matches above this percentage"
            >
              <Select>
                <Select.Option value={100}>100% (Exact match only)</Select.Option>
                <Select.Option value={95}>95%</Select.Option>
                <Select.Option value={85}>85%</Select.Option>
                <Select.Option value={75}>75%</Select.Option>
                <Select.Option value={70}>70%</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item
              name={['tm', 'fuzzyMatching']}
              label="Enable Fuzzy Matching"
              valuePropName="checked"
              help="Allow partial matches below 100%"
            >
              <Switch />
            </Form.Item>
          </TabPane>

          {/* Machine Translation Tab */}
          <TabPane
            tab={
              <span>
                <ThunderboltOutlined />
                Machine Translation
              </span>
            }
            key="mt"
          >
            <Form.Item
              name={['mt', 'enabled']}
              label="Enable Machine Translation"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>

            <Form.Item
              name={['mt', 'provider']}
              label="MT Provider"
            >
              <Select>
                <Select.Option value="ollama">Ollama (Local)</Select.Option>
                <Select.Option value="openai">OpenAI</Select.Option>
                <Select.Option value="google">Google Translate</Select.Option>
                <Select.Option value="deepl">DeepL</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item
              noStyle
              shouldUpdate={(prevValues, currentValues) =>
                prevValues.mt?.provider !== currentValues.mt?.provider
              }
            >
              {({ getFieldValue }) =>
                getFieldValue(['mt', 'provider']) === 'ollama' ? (
                  <>
                    <Form.Item
                      name={['mt', 'model']}
                      label="Ollama Model"
                      help="Select the LLM model for translation"
                    >
                      <Select>
                        <Select.Option value="qwen2.5:14b">Qwen 2.5 (14B)</Select.Option>
                        <Select.Option value="llama3.1:8b">Llama 3.1 (8B)</Select.Option>
                        <Select.Option value="mistral:7b">Mistral (7B)</Select.Option>
                        <Select.Option value="gemma2:9b">Gemma 2 (9B)</Select.Option>
                      </Select>
                    </Form.Item>

                    <Form.Item
                      name={['mt', 'apiUrl']}
                      label="Ollama API URL"
                    >
                      <Input placeholder="http://localhost:11434" />
                    </Form.Item>
                  </>
                ) : null
              }
            </Form.Item>
          </TabPane>

          {/* Quality Assurance Tab */}
          <TabPane
            tab={
              <span>
                <GlobalOutlined />
                Quality Checks
              </span>
            }
            key="qa"
          >
            <Form.Item
              name={['qa', 'checkNumbers']}
              label="Check Number Consistency"
              valuePropName="checked"
              help="Verify that numbers in source and target match"
            >
              <Switch />
            </Form.Item>

            <Form.Item
              name={['qa', 'checkPlaceholders']}
              label="Check Placeholder Consistency"
              valuePropName="checked"
              help="Verify that placeholders like {username} are present in target"
            >
              <Switch />
            </Form.Item>

            <Form.Item
              name={['qa', 'checkLength']}
              label="Check Length Ratio"
              valuePropName="checked"
              help="Warn if target is significantly longer than source"
            >
              <Switch />
            </Form.Item>

            <Form.Item
              name={['qa', 'checkTags']}
              label="Check Tag Consistency"
              valuePropName="checked"
              help="Verify that XML/HTML tags match between source and target"
            >
              <Switch />
            </Form.Item>
          </TabPane>

          {/* UI Settings Tab */}
          <TabPane
            tab={
              <span>
                <SettingOutlined />
                Interface
              </span>
            }
            key="ui"
          >
            <Form.Item
              name={['ui', 'autoSave']}
              label="Enable Auto-Save"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>

            <Form.Item
              name={['ui', 'autoSaveInterval']}
              label="Auto-Save Interval (seconds)"
              help="How often to automatically save changes"
            >
              <Select>
                <Select.Option value={15}>Every 15 seconds</Select.Option>
                <Select.Option value={30}>Every 30 seconds</Select.Option>
                <Select.Option value={60}>Every minute</Select.Option>
                <Select.Option value={120}>Every 2 minutes</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item
              name={['ui', 'showWarnings']}
              label="Show QA Warnings"
              valuePropName="checked"
              help="Display quality check warnings in the editor"
            >
              <Switch />
            </Form.Item>
          </TabPane>
        </Tabs>
      </Form>
    </Modal>
  );
};

export default Settings;
