import React, { useState, useEffect } from 'react';
import { FileText, ChevronRight, ChevronDown, Lock } from 'lucide-react';

interface XliffTag {
  tag_type: string;
  id?: string;
  content?: string;
  attributes: Record<string, string>;
  position: number;
  ctype?: string;
  paired_with?: string;
}

interface SegmentContent {
  text: string;
  tags: XliffTag[];
}

interface TransUnit {
  id: string;
  source: SegmentContent;
  target?: SegmentContent;
  state?: string;
  notes: string[];
  attributes: Record<string, any>;
}

interface XliffFile {
  original: string;
  source_language: string;
  target_language?: string;
  datatype?: string;
  trans_units: TransUnit[];
}

interface XliffDocument {
  version: string;
  files: XliffFile[];
}

const API_BASE = 'http://localhost:8000';

const LANGUAGE_PAIRS = [
  { code: 'en-US', name: 'English (US)' },
  { code: 'en-GB', name: 'English (UK)' },
  { code: 'fr-FR', name: 'French (France)' },
  { code: 'fr-CA', name: 'French (Canada)' },
  { code: 'de-DE', name: 'German (Germany)' },
  { code: 'de-AT', name: 'German (Austria)' },
  { code: 'de-CH', name: 'German (Switzerland)' },
  { code: 'es-ES', name: 'Spanish (Spain)' },
  { code: 'es-MX', name: 'Spanish (Mexico)' },
  { code: 'it-IT', name: 'Italian (Italy)' },
  { code: 'pt-BR', name: 'Portuguese (Brazil)' },
  { code: 'pt-PT', name: 'Portuguese (Portugal)' },
  { code: 'ja-JP', name: 'Japanese (Japan)' },
  { code: 'zh-CN', name: 'Chinese (Simplified)' },
  { code: 'zh-TW', name: 'Chinese (Traditional)' },
  { code: 'ko-KR', name: 'Korean (Korea)' },
  { code: 'ru-RU', name: 'Russian (Russia)' },
  { code: 'ar-SA', name: 'Arabic (Saudi Arabia)' },
  { code: 'nl-NL', name: 'Dutch (Netherlands)' },
  { code: 'pl-PL', name: 'Polish (Poland)' },
  { code: 'tr-TR', name: 'Turkish (Turkey)' },
  { code: 'sv-SE', name: 'Swedish (Sweden)' },
  { code: 'da-DK', name: 'Danish (Denmark)' },
  { code: 'fi-FI', name: 'Finnish (Finland)' },
  { code: 'no-NO', name: 'Norwegian (Norway)' },
];

export default function XliffEditor() {
  const [xliffDocument, setXliffDocument] = useState<XliffDocument | null>(null);
  const [selectedTransUnit, setSelectedTransUnit] = useState<{fileIndex: number, tuIndex: number} | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Set<number>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [hideEmptySources, setHideEmptySources] = useState(true);
  const [editingTarget, setEditingTarget] = useState<string>('');
  const [currentFilename, setCurrentFilename] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [editMenuOpen, setEditMenuOpen] = useState(false);
  const [translationMenuOpen, setTranslationMenuOpen] = useState(false);
  const [memoryMenuOpen, setMemoryMenuOpen] = useState(false);
  const [helpMenuOpen, setHelpMenuOpen] = useState(false);
  const [showAboutDialog, setShowAboutDialog] = useState(false);
  const [showTmSettingsDialog, setShowTmSettingsDialog] = useState(false);
  const [showTmCreateDialog, setShowTmCreateDialog] = useState(false);
  const [showTmManageDialog, setShowTmManageDialog] = useState(false);
  const [showLanguageDialog, setShowLanguageDialog] = useState(false);
  const [showMtSettingsDialog, setShowMtSettingsDialog] = useState(false);
  const [mtModel, setMtModel] = useState('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [mtTranslating, setMtTranslating] = useState(false);
  const [currentUsername, setCurrentUsername] = useState('admin');
  const [tmConnected, setTmConnected] = useState(false);
  const [tmDatabases, setTmDatabases] = useState<Array<{
    name: string;
    description: string;
    owner: string;
    access_type: string;
    path: string;
  }>>([]);
  const [currentTmDatabase, setCurrentTmDatabase] = useState<string | null>(null);
  const [tmMatches, setTmMatches] = useState<Array<{
    source: string;
    target: string;
    score: number;
    context?: string;
    created_by?: string;
    created_at?: string;
    source_lang?: string;
    target_lang?: string;
  }>>([]);
  const [undoStack, setUndoStack] = useState<Array<{
    fileIndex: number;
    tuIndex: number;
    previousText: string;
    previousTags: XliffTag[];
  }>>([]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        alert(`Error: ${error.detail}`);
        return;
      }

      const data: XliffDocument = await response.json();
      setXliffDocument(data);
      setExpandedFiles(new Set([0]));
      setCurrentFilename(file.name);
      setHasUnsavedChanges(false);
      
      // Check if languages are defined
      if (!data.files[0]?.source_language || !data.files[0]?.target_language) {
        setShowLanguageDialog(true);
      } else {
        // Auto-select first segment
        if (data.files[0]?.trans_units?.length > 0) {
          setSelectedTransUnit({ fileIndex: 0, tuIndex: 0 });
        }
      }
      
      if (file.name.toLowerCase().endsWith('.xlz')) {
        try {
          const xlzInfo = await fetch(`${API_BASE}/xlz/info`);
          if (xlzInfo.ok) {
            const info = await xlzInfo.json();
            console.log('XLZ Info:', info);
          }
        } catch (e) {
          console.log('Could not fetch XLZ info');
        }
      }
    } catch (error) {
      alert('Failed to upload file: ' + error);
    } finally {
      setUploading(false);
    }
  };

  const handleTargetChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditingTarget(e.target.value);
    setHasUnsavedChanges(true);
  };

  const handleSaveTarget = async () => {
    if (!selectedTransUnit || !xliffDocument) return;
    
    const selectedTU = xliffDocument.files[selectedTransUnit.fileIndex].trans_units[selectedTransUnit.tuIndex];
    
    try {
      // Save to file
      const response = await fetch(`${API_BASE}/trans-unit`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_index: selectedTransUnit.fileIndex,
          trans_unit_id: selectedTU.id,
          target_text: editingTarget,
          target_tags: selectedTU.target?.tags || []
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to save changes');
      }
      
      const updatedDoc = { ...xliffDocument };
      const targetTU = updatedDoc.files[selectedTransUnit.fileIndex].trans_units[selectedTransUnit.tuIndex];
      
      if (!targetTU.target) {
        targetTU.target = {
          text: editingTarget,
          tags: []
        };
      } else {
        targetTU.target.text = editingTarget;
      }
      
      setXliffDocument(updatedDoc);
      setHasUnsavedChanges(true);
      
      console.log('✅ Target saved to file');
      
      // Also save to TM if connected
      if (tmConnected && currentTmDatabase) {
        const tmSaved = await saveToTM();
        if (tmSaved) {
          alert('Saved to file and Translation Memory');
        } else {
          alert('Saved to file (TM save failed)');
        }
      } else {
        alert('Saved to file (TM not connected)');
      }
    } catch (error) {
      console.error('Failed to save target:', error);
      alert('Failed to save changes: ' + error);
    }
  };

  // File menu handlers
  const handleOpen = () => {
    // Trigger file input click
    const fileInput = document.getElementById('file-input') as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  };

  const handleSave = async () => {
    if (!xliffDocument || !currentFilename) {
      alert('No file loaded to save');
      return;
    }

    // Confirm before saving
    const confirmed = confirm(`Save changes to "${currentFilename}"?\n\nNote: File will be downloaded to your Downloads folder. You'll need to move it manually to replace the original.`);
    if (!confirmed) return;

    try {
      const response = await fetch(`${API_BASE}/download`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = currentFilename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      setHasUnsavedChanges(false);
      console.log('File saved successfully');
      alert(`File saved as: ${currentFilename}\n\nCheck your Downloads folder.`);
    } catch (error) {
      console.error('Failed to save file:', error);
      alert('Failed to save file: ' + error);
    }
  };

  const handleSaveAs = async () => {
    if (!xliffDocument) {
      alert('No file loaded to save');
      return;
    }

    const newFilename = prompt('Enter filename:', currentFilename || 'translation.xliff');
    if (!newFilename) return;

    try {
      const response = await fetch(`${API_BASE}/download`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = newFilename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      setCurrentFilename(newFilename);
      setHasUnsavedChanges(false);
      console.log('File saved as:', newFilename);
      alert(`File saved as: ${newFilename}\n\nCheck your Downloads folder.`);
    } catch (error) {
      console.error('Failed to save file:', error);
      alert('Failed to save file: ' + error);
    }
  };

  const handleCopySourceToTarget = async () => {
    if (!selectedTransUnit || !xliffDocument) {
      alert('Please select a translation unit first');
      return;
    }

    const selectedTU = xliffDocument.files[selectedTransUnit.fileIndex].trans_units[selectedTransUnit.tuIndex];
    
    if (!selectedTU.source?.text) {
      alert('No source text to copy');
      return;
    }

    // Confirmation dialog
    const confirmed = confirm(
      `Copy source to target?\n\n` +
      `Source: "${selectedTU.source.text}"\n\n` +
      `This will ${selectedTU.target?.text ? 'overwrite' : 'set'} the target text.`
    );
    
    if (!confirmed) return;

    // Save current state for undo
    const previousText = selectedTU.target?.text || '';
    const previousTags = selectedTU.target?.tags || [];
    
    setUndoStack(prev => [...prev, {
      fileIndex: selectedTransUnit.fileIndex,
      tuIndex: selectedTransUnit.tuIndex,
      previousText,
      previousTags
    }]);

    // Copy source text to target
    const sourceText = selectedTU.source.text;
    setEditingTarget(sourceText);
    
    // Save to backend
    try {
      const response = await fetch(`${API_BASE}/trans-unit`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_index: selectedTransUnit.fileIndex,
          trans_unit_id: selectedTU.id,
          target_text: sourceText,
          target_tags: selectedTU.source.tags || []
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to save');
      }
      
      // Update local state
      const updatedDoc = { ...xliffDocument };
      const targetTU = updatedDoc.files[selectedTransUnit.fileIndex].trans_units[selectedTransUnit.tuIndex];
      
      if (!targetTU.target) {
        targetTU.target = {
          text: sourceText,
          tags: selectedTU.source.tags || []
        };
      } else {
        targetTU.target.text = sourceText;
        targetTU.target.tags = selectedTU.source.tags || [];
      }
      
      setXliffDocument(updatedDoc);
      setHasUnsavedChanges(true);
      
      console.log('Source copied to target successfully');
    } catch (error) {
      // Remove from undo stack on error
      setUndoStack(prev => prev.slice(0, -1));
      console.error('Failed to copy source to target:', error);
      alert('Failed to copy: ' + error);
    }
  };

  const handleUndo = async () => {
    if (undoStack.length === 0) {
      alert('Nothing to undo');
      return;
    }

    const lastAction = undoStack[undoStack.length - 1];
    
    if (!xliffDocument) return;

    try {
      const selectedTU = xliffDocument.files[lastAction.fileIndex].trans_units[lastAction.tuIndex];
      
      // Restore previous text via API
      const response = await fetch(`${API_BASE}/trans-unit`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_index: lastAction.fileIndex,
          trans_unit_id: selectedTU.id,
          target_text: lastAction.previousText,
          target_tags: lastAction.previousTags
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to undo');
      }
      
      // Update local state
      const updatedDoc = { ...xliffDocument };
      const targetTU = updatedDoc.files[lastAction.fileIndex].trans_units[lastAction.tuIndex];
      
      if (!targetTU.target) {
        targetTU.target = {
          text: lastAction.previousText,
          tags: lastAction.previousTags
        };
      } else {
        targetTU.target.text = lastAction.previousText;
        targetTU.target.tags = lastAction.previousTags;
      }
      
      setXliffDocument(updatedDoc);
      
      // Update editing target if this is the currently selected segment
      if (selectedTransUnit?.fileIndex === lastAction.fileIndex && 
          selectedTransUnit?.tuIndex === lastAction.tuIndex) {
        setEditingTarget(lastAction.previousText);
      }
      
      // Remove from undo stack
      setUndoStack(prev => prev.slice(0, -1));
      
      setHasUnsavedChanges(true);
      console.log('Undo successful');
    } catch (error) {
      console.error('Failed to undo:', error);
      alert('Failed to undo: ' + error);
    }
  };

  // TM Functions
  const loadTmDatabases = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/tm/databases?user=admin`);
      if (response.ok) {
        const data = await response.json();
        setTmDatabases(data.databases || []);
      }
    } catch (error) {
      console.error('Failed to load TM databases:', error);
    }
  };

  const loadOllamaModels = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/ollama/models`);
      if (response.ok) {
        const data = await response.json();
        const modelNames = data.models?.map((m: any) => m.name) || [];
        setAvailableModels(modelNames);
        
        // Set default model if none selected
        if (!mtModel && modelNames.length > 0) {
          setMtModel(modelNames[0]);
        }
      }
    } catch (error) {
      console.error('Failed to load Ollama models:', error);
    }
  };

  const translateWithMT = async () => {
    if (!selectedTransUnit || !xliffDocument || !mtModel) {
      alert('Please select a segment and configure MT model first');
      return;
    }

    const selectedTU = xliffDocument.files[selectedTransUnit.fileIndex].trans_units[selectedTransUnit.tuIndex];
    
    if (!selectedTU.source?.text) {
      alert('No source text to translate');
      return;
    }

    const sourceFile = xliffDocument.files[selectedTransUnit.fileIndex];
    const sourceLang = sourceFile.source_language || 'en';
    const targetLang = sourceFile.target_language || 'es';

    setMtTranslating(true);

    try {
      const response = await fetch(`${API_BASE}/api/translate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: selectedTU.source.text,
          source_lang: sourceLang,
          target_lang: targetLang,
          model: mtModel
        })
      });

      if (response.ok) {
        const data = await response.json();
        setEditingTarget(data.translation || '');
        console.log('✅ MT translation completed');
      } else {
        alert('MT translation failed');
      }
    } catch (error) {
      console.error('Failed to translate:', error);
      alert('MT translation error: ' + error);
    } finally {
      setMtTranslating(false);
    }
  };

  const getModelLanguageInfo = (modelName: string) => {
    const model = modelName.toLowerCase();
    
    // Llama 4 models
    if (model.includes('llama4') || model.includes('llama-4')) {
      return {
        languages: ['Arabic', 'English', 'French', 'German', 'Hindi', 'Indonesian', 'Italian', 'Portuguese', 'Spanish', 'Tagalog', 'Thai', 'Vietnamese'],
        count: 12,
        note: 'Multimodal, MoE architecture'
      };
    }
    
    // Llama 3.x models
    if (model.includes('llama3') || model.includes('llama-3')) {
      return {
        languages: ['English', 'German', 'French', 'Italian', 'Portuguese', 'Hindi', 'Spanish', 'Thai'],
        count: 8,
        note: 'Good multilingual support'
      };
    }
    
    // Aya models
    if (model.includes('aya')) {
      return {
        languages: ['101 languages including all major world languages'],
        count: 101,
        note: 'Specialized for multilingual translation'
      };
    }
    
    // Qwen models
    if (model.includes('qwen')) {
      return {
        languages: ['English', 'Chinese', 'Arabic', 'French', 'German', 'Japanese', 'Korean', 'Russian', 'Spanish', 'Vietnamese', '+ many more'],
        count: 30,
        note: 'Excellent multilingual capabilities'
      };
    }
    
    // Command-R models
    if (model.includes('command-r')) {
      return {
        languages: ['English', 'French', 'Spanish', 'Italian', 'German', 'Portuguese', 'Japanese', 'Korean', 'Chinese', 'Arabic'],
        count: 10,
        note: 'Built for multilingual tasks'
      };
    }
    
    // Mistral models
    if (model.includes('mistral')) {
      return {
        languages: ['English', 'French', 'Italian', 'German', 'Spanish'],
        count: 5,
        note: 'European languages focus'
      };
    }
    
    // Gemma models
    if (model.includes('gemma')) {
      return {
        languages: ['English', 'Limited multilingual'],
        count: 1,
        note: 'Primarily English'
      };
    }
    
    // Default
    return {
      languages: ['English', 'Various languages'],
      count: null,
      note: 'Check model documentation'
    };
  };

  const connectToTmDatabase = async (dbName: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/tm/databases/${dbName}/connect?user=admin`, {
        method: 'POST'
      });
      
      if (response.ok) {
        setTmConnected(true);
        setCurrentTmDatabase(dbName);
        setShowTmSettingsDialog(false);
        alert(`Connected to TM database: ${dbName}`);
        
        // Trigger TM search if segment selected
        if (selectedTransUnit && xliffDocument) {
          const selectedTU = xliffDocument.files[selectedTransUnit.fileIndex].trans_units[selectedTransUnit.tuIndex];
          if (selectedTU?.source?.text) {
            searchTM(selectedTU.source.text);
          }
        }
      } else {
        const error = await response.json();
        alert(`Failed to connect: ${error.detail}`);
      }
    } catch (error) {
      console.error('Connection error:', error);
      alert('Failed to connect to TM database');
    }
  };

  const disconnectFromTmDatabase = async () => {
    if (!currentTmDatabase) return;
    
    try {
      await fetch(`${API_BASE}/api/tm/databases/${currentTmDatabase}/disconnect`, {
        method: 'POST'
      });
      
      setTmConnected(false);
      setCurrentTmDatabase(null);
      setTmMatches([]);
      setShowTmSettingsDialog(false);
      alert('Disconnected from TM database');
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  };

  const createTmDatabase = async (name: string, description: string, accessType: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/tm/databases/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          description,
          owner: 'admin',
          access_type: accessType
        })
      });
      
      if (response.ok) {
        alert(`TM database '${name}' created successfully`);
        loadTmDatabases();
        setShowTmCreateDialog(false);
      } else {
        const error = await response.json();
        alert(`Failed to create database: ${error.detail}`);
      }
    } catch (error) {
      console.error('Create error:', error);
      alert('Failed to create TM database');
    }
  };

  const searchTM = async (sourceText: string) => {
    if (!tmConnected || !sourceText.trim()) {
      setTmMatches([]);
      return;
    }

    try {
      const sourceFile = xliffDocument?.files[0];
      if (!sourceFile) return;

      const searchUrl = `${API_BASE}/api/tm/search?` + 
        `source=${encodeURIComponent(sourceText)}&` +
        `source_lang=${sourceFile.source_language}&` +
        `target_lang=${sourceFile.target_language || 'en'}&` +
        `threshold=0.7&` +
        `limit=5`;
      
      console.log('TM Search:', {
        source: sourceText,
        source_lang: sourceFile.source_language,
        target_lang: sourceFile.target_language,
        url: searchUrl
      });

      const response = await fetch(searchUrl);

      if (response.ok) {
        const data = await response.json();
        console.log('TM Results:', data);
        setTmMatches(data.matches || []);
      } else {
        console.error('TM search failed:', response.status);
        setTmMatches([]);
      }
    } catch (error) {
      console.error('TM search failed:', error);
      setTmMatches([]);
    }
  };

  const saveToTM = async () => {
    if (!selectedTransUnit || !xliffDocument || !tmConnected) {
      alert('Please select a translation unit and connect to TM first');
      return false;
    }

    const selectedTU = xliffDocument.files[selectedTransUnit.fileIndex].trans_units[selectedTransUnit.tuIndex];
    
    if (!selectedTU.source?.text || !selectedTU.target?.text) {
      alert('Both source and target text are required to save to TM');
      return false;
    }

    const sourceFile = xliffDocument.files[selectedTransUnit.fileIndex];

    try {
      console.log('💾 Saving to TM:', {
        source: selectedTU.source.text,
        target: selectedTU.target.text,
        source_lang: sourceFile.source_language,
        target_lang: sourceFile.target_language,
        created_by: currentUsername
      });

      const response = await fetch(`${API_BASE}/api/tm/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source: selectedTU.source.text,
          target: selectedTU.target.text,
          source_lang: sourceFile.source_language,
          target_lang: sourceFile.target_language || 'en',
          context: selectedTU.notes.join('; ') || '',
          created_by: currentUsername
        })
      });

      if (response.ok) {
        console.log('✅ Saved to Translation Memory');
        return true;
      } else {
        console.error('❌ Failed to save to TM');
        alert('Failed to save to TM');
        return false;
      }
    } catch (error) {
      console.error('Failed to save to TM:', error);
      alert('Failed to save to TM: ' + error);
      return false;
    }
  };

  const insertTmMatch = async (matchText: string) => {
    if (!selectedTransUnit || !xliffDocument) return;

    const selectedTU = xliffDocument.files[selectedTransUnit.fileIndex].trans_units[selectedTransUnit.tuIndex];
    
    setEditingTarget(matchText);

    // Save to backend
    try {
      const response = await fetch(`${API_BASE}/trans-unit`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_index: selectedTransUnit.fileIndex,
          trans_unit_id: selectedTU.id,
          target_text: matchText,
          target_tags: selectedTU.target?.tags || []
        })
      });

      if (!response.ok) {
        throw new Error('Failed to save');
      }

      // Update local state
      const updatedDoc = { ...xliffDocument };
      const targetTU = updatedDoc.files[selectedTransUnit.fileIndex].trans_units[selectedTransUnit.tuIndex];
      
      if (!targetTU.target) {
        targetTU.target = {
          text: matchText,
          tags: []
        };
      } else {
        targetTU.target.text = matchText;
      }
      
      setXliffDocument(updatedDoc);
      setHasUnsavedChanges(true);
      
      console.log('TM match inserted successfully');
    } catch (error) {
      console.error('Failed to insert TM match:', error);
      alert('Failed to insert match: ' + error);
    }
  };

  const toggleFile = (index: number) => {
    const newExpanded = new Set(expandedFiles);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedFiles(newExpanded);
  };

  const getFilteredTransUnits = (transUnits: TransUnit[]) => {
    if (!hideEmptySources) return transUnits;
    return transUnits.filter(tu => tu.source?.text && tu.source.text.trim().length > 0);
  };

  useEffect(() => {
    if (selectedTransUnit && xliffDocument) {
      const selectedTU = xliffDocument.files[selectedTransUnit.fileIndex].trans_units[selectedTransUnit.tuIndex];
      const targetText = selectedTU?.target?.text || '';
      
      setEditingTarget(targetText);
      
      // Search TM when segment selected
      if (selectedTU?.source?.text && tmConnected) {
        searchTM(selectedTU.source.text);
      } else {
        setTmMatches([]);
      }
    }
  }, [selectedTransUnit, xliffDocument, tmConnected]);

  // Load TM databases and Ollama models on mount
  useEffect(() => {
    loadTmDatabases();
    loadOllamaModels();
  }, []);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (fileMenuOpen && !target.closest('.file-menu-container')) {
        setFileMenuOpen(false);
      }
      if (editMenuOpen && !target.closest('.edit-menu-container')) {
        setEditMenuOpen(false);
      }
      if (translationMenuOpen && !target.closest('.translation-menu-container')) {
        setTranslationMenuOpen(false);
      }
      if (memoryMenuOpen && !target.closest('.memory-menu-container')) {
        setMemoryMenuOpen(false);
      }
      if (helpMenuOpen && !target.closest('.help-menu-container')) {
        setHelpMenuOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [fileMenuOpen, editMenuOpen, translationMenuOpen, memoryMenuOpen, helpMenuOpen]);

  useEffect(() => {
    const getAllFilteredTransUnits = () => {
      if (!xliffDocument) return [];
      
      const allUnits: Array<{fileIndex: number, tuIndex: number, originalIndex: number}> = [];
      
      xliffDocument.files.forEach((file, fileIndex) => {
        file.trans_units.forEach((tu, originalIndex) => {
          if (!hideEmptySources || (tu.source?.text && tu.source.text.trim().length > 0)) {
            allUnits.push({ fileIndex, tuIndex: allUnits.length, originalIndex });
          }
        });
      });
      
      return allUnits;
    };

    const handleKeyDown = async (e: KeyboardEvent) => {
      // Don't handle arrow keys if user is typing in textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
        // Only handle Ctrl+shortcuts, not plain arrow keys
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          return; // Let user navigate within textarea
        }
      }
      
      // File menu shortcuts
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        handleOpen();
        return;
      }
      
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (e.shiftKey) {
          handleSaveAs();
        } else {
          handleSave();
        }
        return;
      }

      // Edit menu shortcuts
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
        return;
      }

      // Translation menu shortcuts
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        handleCopySourceToTarget();
        return;
      }

      // Memory menu shortcuts
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        saveToTM();
        return;
      }

      if (!xliffDocument || !selectedTransUnit) return;
      
      const allUnits = getAllFilteredTransUnits();
      if (allUnits.length === 0) return;
      
      const currentIndex = allUnits.findIndex(
        u => u.fileIndex === selectedTransUnit.fileIndex && 
             u.originalIndex === selectedTransUnit.tuIndex
      );
      
      if (currentIndex === -1) return;
      
      let newIndex = currentIndex;
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        newIndex = Math.min(currentIndex + 1, allUnits.length - 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        newIndex = Math.max(currentIndex - 1, 0);
      } else {
        return;
      }
      
      // Navigate directly (no auto-save)
      const newUnit = allUnits[newIndex];
      setSelectedTransUnit({ 
        fileIndex: newUnit.fileIndex, 
        tuIndex: newUnit.originalIndex 
      });
      
      setTimeout(() => {
        const element = document.getElementById(`tu-${newUnit.fileIndex}-${newUnit.originalIndex}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 50);
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [xliffDocument, selectedTransUnit, hideEmptySources]);

  const selectedTU = selectedTransUnit 
    ? xliffDocument?.files[selectedTransUnit.fileIndex]?.trans_units[selectedTransUnit.tuIndex]
    : null;

  const renderTag = (tag: XliffTag) => {
    const getTagDisplay = () => {
      if (tag.tag_type === 'bpt') {
        return `<bpt>${tag.content || ''}`;
      } else if (tag.tag_type === 'ept') {
        return `</${tag.content || 'ept'}>`;
      } else if (tag.tag_type === 'ph') {
        return tag.content || `{${tag.id}}`;
      } else if (tag.content) {
        return `<${tag.tag_type}>${tag.content}</${tag.tag_type}>`;
      } else {
        return `<${tag.tag_type}/>`;
      }
    };

    const getTagColor = () => {
      if (tag.tag_type === 'bpt' || tag.tag_type === 'ept') {
        return 'bg-purple-100 text-purple-800 border-purple-300';
      } else if (tag.tag_type === 'ph') {
        return 'bg-green-100 text-green-800 border-green-300';
      } else {
        return 'bg-blue-100 text-blue-800 border-blue-300';
      }
    };

    const tagTitle = [
      `Type: ${tag.tag_type}`,
      tag.id ? `ID: ${tag.id}` : '',
      tag.ctype ? `Content Type: ${tag.ctype}` : '',
      tag.content ? `Content: ${tag.content}` : ''
    ].filter(Boolean).join('\n');

    return (
      <span
        key={`${tag.tag_type}-${tag.position}`}
        className={`inline-flex items-center px-2 py-0.5 mx-0.5 rounded text-xs font-mono border ${getTagColor()}`}
        title={tagTitle}
      >
        <Lock size={10} className="mr-1" />
        {getTagDisplay()}
        {tag.ctype && (
          <span className="ml-1 opacity-60 text-[10px]">
            [{tag.ctype}]
          </span>
        )}
      </span>
    );
  };

  // Render tags in SOURCE with red locked boxes showing actual content
  const renderSourceTag = (tag: XliffTag) => {
    const getTagContent = () => {
      if (tag.tag_type === 'bpt') {
        return tag.content || 'bpt';
      } else if (tag.tag_type === 'ept') {
        return tag.content || 'ept';
      } else if (tag.tag_type === 'ph') {
        return tag.content || 'ph';
      } else if (tag.tag_type === 'it') {
        return tag.content || 'it';
      } else if (tag.tag_type === 'g') {
        return tag.content || 'g';
      } else {
        return tag.content || tag.tag_type;
      }
    };

    const tagTitle = [
      `Type: ${tag.tag_type}`,
      tag.id ? `ID: ${tag.id}` : '',
      tag.ctype ? `Content Type: ${tag.ctype}` : '',
      tag.content ? `Content: ${tag.content}` : ''
    ].filter(Boolean).join('\n');

    return (
      <span
        key={`${tag.tag_type}-${tag.position}`}
        className="inline-flex items-center px-2 py-0.5 mx-0.5 rounded text-xs font-mono border bg-red-50 text-red-700 border-red-300"
        title={tagTitle}
      >
        <Lock size={10} className="mr-1" />
        {getTagContent()}
      </span>
    );
  };

  const renderSegmentWithTags = (segment: SegmentContent | undefined, isSource: boolean = false) => {
    if (!segment) return <span className="text-gray-400 italic">No translation</span>;
    
    const parts = [];
    let lastPos = 0;
    
    const sortedTags = [...segment.tags].sort((a, b) => a.position - b.position);
    
    sortedTags.forEach((tag, idx) => {
      const textBefore = segment.text.slice(lastPos, tag.position);
      if (textBefore) {
        parts.push(<span key={`text-${idx}`}>{textBefore}</span>);
      }
      
      // Use different rendering for source vs target
      parts.push(isSource ? renderSourceTag(tag) : renderTag(tag));
      
      const tagMarker = `⟨${tag.tag_type}⟩`;
      lastPos = tag.position + tagMarker.length;
    });
    
    const remainingText = segment.text.slice(lastPos);
    if (remainingText) {
      parts.push(<span key="text-end">{remainingText}</span>);
    }
    
    return <div className="flex flex-wrap items-center gap-1">{parts}</div>;
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Menu Bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-6">
        <div className="relative file-menu-container">
          <button 
            onClick={() => setFileMenuOpen(!fileMenuOpen)}
            className="px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded"
          >
            File
          </button>
          {fileMenuOpen && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded shadow-lg min-w-[200px] z-50">
              <button
                onClick={() => {
                  handleOpen();
                  setFileMenuOpen(false);
                }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center justify-between"
              >
                <span>Open...</span>
                <span className="text-xs text-gray-400">Ctrl+O</span>
              </button>
              <button
                onClick={() => {
                  handleSave();
                  setFileMenuOpen(false);
                }}
                disabled={!xliffDocument}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center justify-between disabled:text-gray-400 disabled:cursor-not-allowed disabled:hover:bg-white"
              >
                <span>Save</span>
                <span className="text-xs text-gray-400">Ctrl+S</span>
              </button>
              <button
                onClick={() => {
                  handleSaveAs();
                  setFileMenuOpen(false);
                }}
                disabled={!xliffDocument}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center justify-between disabled:text-gray-400 disabled:cursor-not-allowed disabled:hover:bg-white"
              >
                <span>Save As...</span>
                <span className="text-xs text-gray-400">Ctrl+Shift+S</span>
              </button>
            </div>
          )}
        </div>

        {/* Edit Menu */}
        <div className="relative edit-menu-container">
          <button 
            onClick={() => setEditMenuOpen(!editMenuOpen)}
            className="px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded"
          >
            Edit
          </button>
          {editMenuOpen && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded shadow-lg min-w-[180px] z-50">
              <button
                onClick={() => {
                  handleUndo();
                  setEditMenuOpen(false);
                }}
                disabled={undoStack.length === 0}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center justify-between disabled:text-gray-400 disabled:cursor-not-allowed disabled:hover:bg-white"
              >
                <span>Undo</span>
                <span className="text-xs text-gray-400">Ctrl+Z</span>
              </button>
            </div>
          )}
        </div>

        {/* Translation Menu */}
        <div className="relative translation-menu-container">
          <button 
            onClick={() => setTranslationMenuOpen(!translationMenuOpen)}
            className="px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded"
          >
            Translation
          </button>
          {translationMenuOpen && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded shadow-lg min-w-[240px] z-50">
              <button
                onClick={() => {
                  handleCopySourceToTarget();
                  setTranslationMenuOpen(false);
                }}
                disabled={!selectedTransUnit}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center justify-between disabled:text-gray-400 disabled:cursor-not-allowed disabled:hover:bg-white"
              >
                <span>Copy Source to Target</span>
                <span className="text-xs text-gray-400">Ctrl+Shift+C</span>
              </button>
            </div>
          )}
        </div>

        {/* Memory Menu */}
        <div className="relative memory-menu-container">
          <button 
            onClick={() => setMemoryMenuOpen(!memoryMenuOpen)}
            className="px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded"
          >
            Memory {tmConnected && <span className="text-green-600">●</span>}
          </button>
          {memoryMenuOpen && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded shadow-lg min-w-[240px] z-50">
              <button
                onClick={() => {
                  setShowTmSettingsDialog(true);
                  setMemoryMenuOpen(false);
                }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                <span>{tmConnected ? `✓ Connected: ${currentTmDatabase}` : 'Connect to TM...'}</span>
              </button>
              <button
                onClick={() => {
                  setShowTmManageDialog(true);
                  setMemoryMenuOpen(false);
                }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                <span>Manage Databases...</span>
              </button>
              <div className="border-t border-gray-200 my-1"></div>
              <button
                onClick={() => {
                  saveToTM();
                  setMemoryMenuOpen(false);
                }}
                disabled={!tmConnected || !selectedTransUnit}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center justify-between disabled:text-gray-400 disabled:cursor-not-allowed disabled:hover:bg-white"
              >
                <span>Save to TM</span>
                <span className="text-xs text-gray-400">Ctrl+Enter</span>
              </button>
              <div className="border-t border-gray-200 my-1"></div>
              <button
                onClick={() => {
                  setShowMtSettingsDialog(true);
                  setMemoryMenuOpen(false);
                }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                <span>{mtModel ? `🤖 MT Model: ${mtModel}` : '🤖 Configure MT...'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Help Menu */}
        <div className="relative help-menu-container">
          <button 
            onClick={() => setHelpMenuOpen(!helpMenuOpen)}
            className="px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded"
          >
            Help
          </button>
          {helpMenuOpen && (
            <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded shadow-lg min-w-[160px] z-50">
              <button
                onClick={() => {
                  setShowAboutDialog(true);
                  setHelpMenuOpen(false);
                }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                <span>About</span>
              </button>
            </div>
          )}
        </div>

        {currentFilename && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <FileText size={16} />
            <span>{currentFilename}</span>
            {hasUnsavedChanges && <span className="text-orange-600">●</span>}
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        id="file-input"
        type="file"
        accept=".xliff,.xlf,.xlz,.sdlxliff"
        onChange={handleFileUpload}
        className="hidden"
        disabled={uploading}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel removed - file tree navigation disabled */}
        
      <div className="flex-1 flex flex-col">
        {!selectedTU ? (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            <div className="text-center">
              <FileText size={64} className="mx-auto mb-4 opacity-30" />
              <p className="text-lg">Select a translation unit to edit</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-8">
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-semibold text-gray-800">Translation Unit: {selectedTU.id}</h3>
                  {selectedTU.state && (
                    <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm">
                      {selectedTU.state}
                    </span>
                  )}
                </div>
                
                {selectedTU.notes.length > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
                    <strong>Notes:</strong> {selectedTU.notes.join(', ')}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Source ({xliffDocument?.files[selectedTransUnit.fileIndex].source_language})
                </label>
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 min-h-[80px]">
                  {renderSegmentWithTags(selectedTU.source, true)}
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-gray-700">
                    Target ({xliffDocument?.files[selectedTransUnit.fileIndex].target_language || 'Not specified'})
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={translateWithMT}
                      disabled={!mtModel || mtTranslating}
                      className="px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                      title={mtModel ? `Translate with ${mtModel}` : "Configure MT model first (Translation menu)"}
                    >
                      {mtTranslating ? '⏳ Translating...' : '🤖 MT Translate'}
                    </button>
                    <button
                      onClick={handleSaveTarget}
                      className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                      title={tmConnected ? "Save to file and Translation Memory" : "Save to file only (TM not connected)"}
                    >
                    {tmConnected ? '💾 Save to File & TM' : '💾 Save to File'}
                  </button>
                </div>
                </div>
                
                {selectedTU.target && selectedTU.target.tags.length > 0 && (
                  <div className="mb-3 p-3 bg-gray-50 rounded border border-gray-200">
                    <div className="text-xs font-medium text-gray-600 mb-2">Available tags (click to copy):</div>
                    <div className="flex flex-wrap gap-2">
                      {selectedTU.target.tags.map((tag, idx) => (
                        <code 
                          key={idx}
                          className="px-2 py-1 bg-white border border-gray-300 rounded text-xs font-mono cursor-pointer hover:bg-gray-100"
                          onClick={() => {
                            const tagMarker = `⟨${tag.tag_type}⟩`;
                            navigator.clipboard.writeText(tagMarker);
                          }}
                          title="Click to copy"
                        >
                          ⟨{tag.tag_type}⟩
                        </code>
                      ))}
                    </div>
                  </div>
                )}
                
                <textarea
                  value={editingTarget}
                  onChange={handleTargetChange}
                  className="w-full min-h-[120px] p-4 border-2 border-blue-300 rounded-lg focus:border-blue-500 focus:outline-none font-sans resize-y"
                  placeholder="Enter translation here..."
                />
                
                <div className="mt-3 p-3 bg-gray-50 rounded border border-gray-200">
                  <div className="text-xs font-medium text-gray-600 mb-2">Preview:</div>
                  <div className="text-sm">
                    {renderSegmentWithTags({
                      text: editingTarget,
                      tags: selectedTU?.target?.tags || []
                    })}
                  </div>
                </div>
                
                <p className="mt-2 text-xs text-gray-500 flex items-center">
                  <Lock size={12} className="mr-1" />
                  Tags are locked - use the tag markers (⟨tag⟩) in your text
                </p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
                <strong>Keyboard shortcuts:</strong> Use <kbd className="px-2 py-1 bg-white border border-blue-300 rounded">↑</kbd> and <kbd className="px-2 py-1 bg-white border border-blue-300 rounded">↓</kbd> arrow keys to navigate between translation units.
              </div>

              {/* Status Bar - moved here under translation entries */}
              <div className="mt-4 bg-gray-100 border border-gray-300 rounded-lg px-4 py-2 flex items-center justify-between text-sm text-gray-700">
                <div className="flex items-center gap-4">
                  <span className="font-mono text-xs bg-white px-2 py-1 rounded border border-gray-300">
                    ID: {selectedTU?.id || 'N/A'}
                  </span>
                  <span>
                    Segment {(() => {
                      if (!xliffDocument) return '0/0';
                      let currentPos = 0;
                      let total = 0;
                      xliffDocument.files.forEach((file, fIdx) => {
                        file.trans_units.forEach((tu, tIdx) => {
                          total++;
                          if (fIdx === selectedTransUnit.fileIndex && tIdx === selectedTransUnit.tuIndex) {
                            currentPos = total;
                          }
                        });
                      });
                      return `${currentPos}/${total}`;
                    })()}
                  </span>
                  <span className="text-gray-500">•</span>
                  <span className="truncate max-w-md">
                    {xliffDocument.files[selectedTransUnit.fileIndex]?.original || 'Unknown file'}
                  </span>
                </div>
                <div className="text-xs text-gray-500">
                  Auto-saves on navigation
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* TM Match Panel */}
      {tmConnected && xliffDocument && (
        <div className="w-80 bg-white border-l border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center justify-between">
              <span className="flex items-center">
                <span className="mr-2">TM Matches</span>
                <span className="text-green-600 text-sm">●</span>
              </span>
            </h2>
            {currentTmDatabase && (
              <p className="text-xs text-gray-500 mt-1">
                Database: {currentTmDatabase}
              </p>
            )}
            {selectedTransUnit && xliffDocument && (
              <p className="text-xs text-gray-500 mt-1">
                Language: {xliffDocument.files[selectedTransUnit.fileIndex]?.source_language || 'N/A'} → {xliffDocument.files[selectedTransUnit.fileIndex]?.target_language || 'N/A'}
              </p>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {tmMatches.length === 0 ? (
              <div className="text-center text-gray-500 mt-8">
                <p className="text-sm">No matches found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {tmMatches.map((match, idx) => {
                  const percentage = Math.round(match.score * 100);
                  const getMatchColor = () => {
                    if (percentage === 100) return 'bg-green-100 border-green-300 text-green-800';
                    if (percentage >= 95) return 'bg-blue-100 border-blue-300 text-blue-800';
                    if (percentage >= 85) return 'bg-yellow-100 border-yellow-300 text-yellow-800';
                    return 'bg-orange-100 border-orange-300 text-orange-800';
                  };

                  return (
                    <div
                      key={idx}
                      className="border border-gray-200 rounded-lg p-3 hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => insertTmMatch(match.target)}
                    >
                      <div className={`inline-block px-2 py-1 rounded text-xs font-bold mb-2 ${getMatchColor()}`}>
                        {percentage}%
                      </div>
                      <div className="text-sm mb-2">
                        <div className="text-gray-500 text-xs mb-1">Source:</div>
                        <div className="text-gray-700">{match.source}</div>
                      </div>
                      <div className="text-sm">
                        <div className="text-gray-500 text-xs mb-1">Target:</div>
                        <div className="font-medium text-gray-900">{match.target}</div>
                      </div>
                      {match.context && (
                        <div className="text-xs text-gray-400 mt-2 italic">
                          {match.context}
                        </div>
                      )}
                      {(match.created_by || match.created_at || match.source_lang || match.target_lang) && (
                        <div className="text-xs text-gray-400 mt-2 flex items-center gap-2 flex-wrap">
                          {match.created_by && <span>By: {match.created_by}</span>}
                          {match.created_at && (
                            <>
                              {match.created_by && <span>•</span>}
                              <span>{new Date(match.created_at).toLocaleDateString()}</span>
                            </>
                          )}
                          {(match.source_lang && match.target_lang) && (
                            <>
                              <span>•</span>
                              <span className="font-mono">{match.source_lang} → {match.target_lang}</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
      </div>

      {/* TM Database Selection Dialog */}
      {showTmSettingsDialog && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setShowTmSettingsDialog(false)}
        >
          <div 
            className="bg-white rounded-lg shadow-xl p-8 max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-bold text-gray-800 mb-4">
              {tmConnected ? 'Connected to TM' : 'Select Translation Memory'}
            </h2>
            
            {tmConnected && currentTmDatabase ? (
              <div className="space-y-4 flex-1 overflow-y-auto">
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-green-800 font-medium mb-2">
                    ✓ Connected to: <strong>{currentTmDatabase}</strong>
                  </p>
                  <p className="text-sm text-green-700">
                    TM matches are active and saving translations to this database.
                  </p>
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    onClick={() => setShowTmSettingsDialog(false)}
                    className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                  >
                    Close
                  </button>
                  <button
                    onClick={disconnectFromTmDatabase}
                    className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 flex-1 overflow-y-auto">
                <p className="text-gray-600">
                  Select a TM database to connect:
                </p>

                {tmDatabases.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    <p className="mb-4">No TM databases available</p>
                    <button
                      onClick={() => {
                        setShowTmSettingsDialog(false);
                        setShowTmCreateDialog(true);
                      }}
                      className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Create First Database
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {tmDatabases.map((db) => (
                        <div
                          key={db.name}
                          className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 cursor-pointer transition-colors"
                          onClick={() => connectToTmDatabase(db.name)}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h3 className="font-semibold text-gray-800">{db.name}</h3>
                              <p className="text-sm text-gray-600 mt-1">{db.description || 'No description'}</p>
                              <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                                <span>Owner: {db.owner}</span>
                                <span className={`px-2 py-1 rounded ${
                                  db.access_type === 'public' ? 'bg-green-100 text-green-800' :
                                  db.access_type === 'shared' ? 'bg-blue-100 text-blue-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {db.access_type}
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                connectToTmDatabase(db.name);
                              }}
                              className="ml-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm"
                            >
                              Connect
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-between pt-4 border-t border-gray-200">
                      <button
                        onClick={() => {
                          setShowTmSettingsDialog(false);
                          setShowTmCreateDialog(true);
                        }}
                        className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                      >
                        Create New Database
                      </button>
                      <button
                        onClick={() => setShowTmSettingsDialog(false)}
                        className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TM Create Database Dialog */}
      {showTmCreateDialog && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setShowTmCreateDialog(false)}
        >
          <div 
            className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Create TM Database</h2>
            
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const name = formData.get('name') as string;
              const description = formData.get('description') as string;
              const accessType = formData.get('accessType') as string;
              
              if (name) {
                createTmDatabase(name, description, accessType);
              }
            }}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Database Name *
                  </label>
                  <input
                    type="text"
                    name="name"
                    required
                    pattern="[a-zA-Z0-9_-]+"
                    title="Only letters, numbers, underscores and hyphens"
                    placeholder="e.g., client_acme, medical_terms"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Only letters, numbers, _ and -</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <textarea
                    name="description"
                    rows={3}
                    placeholder="Brief description of this TM database"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Access Type *
                  </label>
                  <select
                    name="accessType"
                    required
                    defaultValue="private"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="private">Private - Only you</option>
                    <option value="shared">Shared - Selected users</option>
                    <option value="public">Public - Everyone</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Private: owner only | Shared: grant access to users | Public: everyone
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowTmCreateDialog(false)}
                  className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  Create Database
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TM Manage Databases Dialog */}
      {showTmManageDialog && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setShowTmManageDialog(false)}
        >
          <div 
            className="bg-white rounded-lg shadow-xl p-8 max-w-3xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Manage TM Databases</h2>
            
            <div className="flex-1 overflow-y-auto">
              {tmDatabases.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <p>No TM databases found</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {tmDatabases.map((db) => (
                    <div key={db.name} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-800">{db.name}</h3>
                          <p className="text-sm text-gray-600 mt-1">{db.description || 'No description'}</p>
                          
                          <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-gray-500">Owner:</span>
                              <span className="ml-2 font-medium text-gray-800">{db.owner}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Access:</span>
                              <span className={`ml-2 px-2 py-1 rounded text-xs font-medium ${
                                db.access_type === 'public' ? 'bg-green-100 text-green-800' :
                                db.access_type === 'shared' ? 'bg-blue-100 text-blue-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {db.access_type}
                              </span>
                            </div>
                            <div className="col-span-2">
                              <span className="text-gray-500">Path:</span>
                              <span className="ml-2 text-xs font-mono text-gray-600">{db.path}</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="ml-4 flex flex-col gap-2">
                          {db.owner === 'admin' && (
                            <>
                              <button
                                onClick={() => {
                                  const user = prompt('Enter username to grant access:');
                                  if (user) {
                                    fetch(`${API_BASE}/api/tm/databases/${db.name}/access/grant`, {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ user, granter: 'admin' })
                                    })
                                    .then(res => res.json())
                                    .then(data => {
                                      alert(data.message);
                                      loadTmDatabases();
                                    })
                                    .catch(err => alert('Failed to grant access'));
                                  }
                                }}
                                className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                              >
                                Grant Access
                              </button>
                              <button
                                onClick={() => {
                                  const user = prompt('Enter username to revoke access:');
                                  if (user) {
                                    fetch(`${API_BASE}/api/tm/databases/${db.name}/access/revoke`, {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ user, revoker: 'admin' })
                                    })
                                    .then(res => res.json())
                                    .then(data => {
                                      alert(data.message);
                                      loadTmDatabases();
                                    })
                                    .catch(err => alert('Failed to revoke access'));
                                  }
                                }}
                                className="px-3 py-1 text-xs bg-orange-100 text-orange-700 rounded hover:bg-orange-200 transition-colors"
                              >
                                Revoke Access
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm(`Delete database "${db.name}"? This cannot be undone!`)) {
                                    fetch(`${API_BASE}/api/tm/databases/${db.name}?deleter=admin`, {
                                      method: 'DELETE'
                                    })
                                    .then(res => res.json())
                                    .then(data => {
                                      alert(data.message);
                                      loadTmDatabases();
                                    })
                                    .catch(err => alert('Failed to delete database'));
                                  }
                                }}
                                className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-4 border-t border-gray-200 mt-4">
              <button
                onClick={() => setShowTmManageDialog(false)}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Language Selection Dialog */}
      {showLanguageDialog && xliffDocument && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
        >
          <div 
            className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Select Languages</h2>
            <p className="text-gray-600 mb-6">
              This file doesn't specify source and target languages. Please select them to enable TM and continue.
            </p>
            
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const sourceLang = formData.get('sourceLang') as string;
              const targetLang = formData.get('targetLang') as string;
              
              // Update document with languages
              const updatedDoc = { ...xliffDocument };
              updatedDoc.files.forEach(file => {
                file.source_language = sourceLang;
                file.target_language = targetLang;
              });
              setXliffDocument(updatedDoc);
              setShowLanguageDialog(false);
              
              // Auto-select first segment
              if (updatedDoc.files[0]?.trans_units?.length > 0) {
                setSelectedTransUnit({ fileIndex: 0, tuIndex: 0 });
              }
            }}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Source Language *
                  </label>
                  <select
                    name="sourceLang"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select source language...</option>
                    {LANGUAGE_PAIRS.map(lang => (
                      <option key={lang.code} value={lang.code}>{lang.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Target Language *
                  </label>
                  <select
                    name="targetLang"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select target language...</option>
                    {LANGUAGE_PAIRS.map(lang => (
                      <option key={lang.code} value={lang.code}>{lang.name}</option>
                    ))}
                  </select>
                </div>

                <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
                  <strong>Note:</strong> Languages are required for Translation Memory matching and saving translations.
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="submit"
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Continue
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* MT Settings Dialog */}
      {showMtSettingsDialog && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setShowMtSettingsDialog(false)}
        >
          <div 
            className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-bold text-gray-800 mb-4">🤖 Machine Translation Settings</h2>
            
            <div className="space-y-4">
              <p className="text-gray-600">
                Select an Ollama model for machine translation:
              </p>

              {availableModels.length === 0 ? (
                <div className="p-6 text-center bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-yellow-800 mb-2">No Ollama models found</p>
                  <p className="text-sm text-yellow-700">
                    Make sure Ollama is running and models are installed.
                  </p>
                  <code className="block mt-3 text-xs bg-white p-2 rounded">
                    ollama pull aya:35b
                  </code>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Model
                    </label>
                    <select
                      value={mtModel}
                      onChange={(e) => setMtModel(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    >
                      {availableModels.map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                  </div>

                  {mtModel && (
                    <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                      <p className="text-sm font-semibold text-purple-900 mb-2">
                        🌍 Supported Languages ({getModelLanguageInfo(mtModel).count || '?'})
                      </p>
                      <div className="text-xs text-purple-800 space-y-1">
                        <p className="font-medium">{getModelLanguageInfo(mtModel).languages.join(', ')}</p>
                        <p className="text-purple-600 italic mt-2">
                          {getModelLanguageInfo(mtModel).note}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-800">
                      <strong>💡 Tip:</strong> Model will be used for all MT translations in this session.
                      You can change it anytime from the Translation menu.
                    </p>
                  </div>

                  {xliffDocument && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <p className="text-xs text-gray-600 mb-1">Translation Direction:</p>
                      <p className="text-sm font-medium text-gray-800">
                        {xliffDocument.files[0]?.source_language || 'Unknown'} → {xliffDocument.files[0]?.target_language || 'Unknown'}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowMtSettingsDialog(false)}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowMtSettingsDialog(false);
                  if (mtModel) {
                    alert(`MT model set to: ${mtModel}`);
                  }
                }}
                disabled={!mtModel}
                className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:bg-gray-400"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* About Dialog */}
      {showAboutDialog && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setShowAboutDialog(false)}
        >
          <div 
            className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-bold text-gray-800 mb-4">XLIFF Editor</h2>
            <div className="space-y-3 text-gray-600">
              <p><strong>Version:</strong> 1.0.0</p>
              <p><strong>Description:</strong> Professional XLIFF/XLZ translation editor with real-time editing capabilities</p>
              <div>
                <p className="font-semibold mb-2">Supported Formats:</p>
                <ul className="list-disc list-inside ml-2 space-y-1">
                  <li>XLIFF 1.2</li>
                  <li>XLZ (XLIFF + skeleton archives)</li>
                  <li>SDL XLIFF</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold mb-2">Features:</p>
                <ul className="list-disc list-inside ml-2 space-y-1">
                  <li>Real-time segment editing</li>
                  <li>Tag preservation</li>
                  <li>Keyboard navigation</li>
                  <li>File structure browser</li>
                </ul>
              </div>
              <div className="pt-4 border-t border-gray-200">
                <p className="text-sm text-gray-500">
                  Built with React + TypeScript + FastAPI
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowAboutDialog(false)}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}