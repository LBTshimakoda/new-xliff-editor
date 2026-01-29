/**
 * XLIFF Editor API Client
 * Handles all communication with backend API
 */

import axios from 'axios';

const API_BASE_URL = '/api/editor';

export interface Segment {
  id: string;
  source: string;
  target: string | null;
  state: 'new' | 'translated' | 'reviewed' | 'locked';
  tm_match?: number;
  notes: string[];
  tags: string[];
  warnings: string[];
}

export interface Session {
  session_id: string;
  filename: string;
  is_xlz: boolean;
  total_segments: number;
  translated_count: number;
  progress: number;
  current_segment: number;
  created_at: string;
  last_modified: string;
  source_language: string;
  target_language: string;
}

export interface UploadResponse {
  session_id: string;
  filename: string;
  is_xlz: boolean;
  total_segments: number;
  translated_count: number;
  progress: number;
  segments: Segment[];
  file_info: {
    file_id: string;
    size: number;
    uploaded_at: string;
  };
  source_language: string;
  target_language: string;
}

export interface SegmentListResponse {
  segments: Segment[];
  total: number;
  offset: number;
  limit: number;
  has_more: boolean;
}

export interface UpdateSegmentRequest {
  target: string;
  state?: 'new' | 'translated' | 'reviewed' | 'locked';
}

class EditorAPI {
  /**
   * Upload XLIFF/XLZ file and create editing session
   */
  async uploadFile(file: File): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await axios.post<UploadResponse>(
      `${API_BASE_URL}/upload`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );

    return response.data;
  }

  /**
   * Get session details
   */
  async getSession(sessionId: string): Promise<Session> {
    const response = await axios.get<Session>(
      `${API_BASE_URL}/sessions/${sessionId}`
    );
    return response.data;
  }

  /**
   * Get segments with optional filtering and pagination
   */
  async getSegments(
    sessionId: string,
    options?: {
      offset?: number;
      limit?: number;
      filter?: 'all' | 'untranslated' | 'translated' | 'warnings';
    }
  ): Promise<SegmentListResponse> {
    const params = new URLSearchParams();
    if (options?.offset !== undefined) params.append('offset', String(options.offset));
    if (options?.limit !== undefined) params.append('limit', String(options.limit));
    if (options?.filter) params.append('filter', options.filter);

    const response = await axios.get<SegmentListResponse>(
      `${API_BASE_URL}/sessions/${sessionId}/segments?${params.toString()}`
    );

    return response.data;
  }

  /**
   * Get a specific segment
   */
  async getSegment(sessionId: string, segmentId: string): Promise<Segment> {
    const response = await axios.get<Segment>(
      `${API_BASE_URL}/sessions/${sessionId}/segments/${segmentId}`
    );
    return response.data;
  }

  /**
   * Update segment translation
   */
  async updateSegment(
    sessionId: string,
    segmentId: string,
    update: UpdateSegmentRequest
  ): Promise<{
    success: boolean;
    segment: Segment;
    warnings: string[];
    progress: number;
  }> {
    const response = await axios.put(
      `${API_BASE_URL}/sessions/${sessionId}/segments/${segmentId}`,
      update
    );
    return response.data;
  }

  /**
   * Download translated file
   */
  async downloadFile(sessionId: string, filename: string): Promise<void> {
    const response = await axios.get(
      `${API_BASE_URL}/sessions/${sessionId}/download`,
      {
        responseType: 'blob',
      }
    );

    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  }

  /**
   * Close editing session
   */
  async closeSession(sessionId: string): Promise<void> {
    await axios.delete(`${API_BASE_URL}/sessions/${sessionId}`);
  }

  /**
   * Translate text using Machine Translation (Ollama)
   */
  async translateSegment(
    sourceText: string,
    sourceLang: string,
    targetLang: string,
    model: string = 'qwen2.5:14b',
    ollamaUrl: string = 'http://localhost:11434'
  ): Promise<{
    success: boolean;
    translation: string;
    model: string;
    source_lang: string;
    target_lang: string;
  }> {
    const response = await axios.post(
      `${API_BASE_URL}/translate`,
      {
        source_text: sourceText,
        source_lang: sourceLang,
        target_lang: targetLang,
        model: model,
        ollama_url: ollamaUrl,
      }
    );
    return response.data;
  }
}

export const editorAPI = new EditorAPI();