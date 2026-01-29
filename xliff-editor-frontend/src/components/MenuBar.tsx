import React, { useRef } from 'react';
import { Menu, Modal, App } from 'antd';
import type { MenuProps } from 'antd';
import {
  FileOutlined,
  FolderOpenOutlined,
  SaveOutlined,
  SettingOutlined,
  QuestionCircleOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { editorAPI } from '../services/api';

interface MenuBarProps {
  onFileOpen: (sessionId: string) => void;
  onSettingsClick: () => void;
  onSave?: () => void;
  onSaveAs?: () => void;
  onClose?: () => void;
  hasActiveSession?: boolean;
}

const MenuBar: React.FC<MenuBarProps> = ({ 
  onFileOpen, 
  onSettingsClick,
  onSave,
  onSaveAs,
  onClose,
  hasActiveSession = false
}) => {
  const { message, modal } = App.useApp();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileMenuClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validExtensions = ['.xliff', '.xlf', '.xlz'];
    const fileExtension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    
    if (!validExtensions.includes(fileExtension)) {
      message.error('Please select a valid XLIFF or XLZ file');
      return;
    }

    try {
      message.loading({ content: 'Opening file...', key: 'open' });

      // Upload file
      const response = await editorAPI.uploadFile(file);

      message.success({
        content: `File opened! Found ${response.total_segments} segments.`,
        key: 'open',
        duration: 2,
      });

      // Notify parent to navigate to editor
      onFileOpen(response.session_id);

      // Reset input so same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

    } catch (error: any) {
      console.error('Open file error:', error);
      message.error({
        content: `Failed to open file: ${error.response?.data?.detail || error.message}`,
        key: 'open',
        duration: 5,
      });
    }
  };

  const handleAboutClick = () => {
    modal.info({
      title: 'XLIFF Editor',
      content: (
        <div>
          <p><strong>Version:</strong> 1.0.0</p>
          <p><strong>Description:</strong> Professional translation editor for XLIFF and XLZ files</p>
          <br />
          <p><strong>Features:</strong></p>
          <ul>
            <li>Segment-by-segment editing</li>
            <li>Translation Memory integration</li>
            <li>Machine Translation (Ollama)</li>
            <li>Quality assurance checks</li>
            <li>XLIFF 1.2, 2.0, and XLZ support</li>
          </ul>
          <br />
          <p><strong>Keyboard Shortcuts:</strong></p>
          <ul>
            <li><code>Ctrl+O</code> - Open file</li>
            <li><code>Alt+↓</code> - Next segment</li>
            <li><code>Alt+↑</code> - Previous segment</li>
            <li><code>Ctrl+Enter</code> - Confirm & Next</li>
            <li><code>Ctrl+S</code> - Save segment</li>
          </ul>
        </div>
      ),
      width: 600,
    });
  };

  const items: MenuProps['items'] = [
    {
      key: 'file',
      label: 'File',
      icon: <FileOutlined />,
      children: [
        {
          key: 'open',
          label: 'Open...',
          icon: <FolderOpenOutlined />,
          onClick: handleFileMenuClick,
        },
        {
          type: 'divider',
        },
        {
          key: 'save',
          label: 'Save',
          icon: <SaveOutlined />,
          disabled: !hasActiveSession || !onSave,
          onClick: onSave,
        },
        {
          key: 'saveas',
          label: 'Save As...',
          icon: <SaveOutlined />,
          disabled: !hasActiveSession || !onSaveAs,
          onClick: onSaveAs,
        },
        {
          type: 'divider',
        },
        {
          key: 'close',
          label: 'Close',
          icon: <CloseOutlined />,
          disabled: !hasActiveSession || !onClose,
          onClick: onClose,
        },
        {
          type: 'divider',
        },
        {
          key: 'settings',
          label: 'Settings',
          icon: <SettingOutlined />,
          onClick: onSettingsClick,
        },
      ],
    },
    {
      key: 'help',
      label: 'Help',
      icon: <QuestionCircleOutlined />,
      children: [
        {
          key: 'about',
          label: 'About',
          onClick: handleAboutClick,
        },
      ],
    },
  ];

  // Keyboard shortcut: Ctrl+O
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'o') {
        e.preventDefault();
        handleFileMenuClick();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      <Menu
        mode="horizontal"
        items={items}
        style={{
          borderBottom: '1px solid #f0f0f0',
          background: '#fafafa',
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".xliff,.xlf,.xlz"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />
    </>
  );
};

export default MenuBar;