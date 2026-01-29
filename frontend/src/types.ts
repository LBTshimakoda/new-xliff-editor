export interface XliffTag {
  tag_type: string;
  id?: string;
  content?: string;
  attributes: Record<string, string>;
  position: number;
  ctype?: string;
  paired_with?: string;
}

export interface SegmentContent {
  text: string;
  tags: XliffTag[];
}

export interface TransUnit {
  id: string;
  source: SegmentContent;
  target?: SegmentContent;
  state?: string;
  notes: string[];
  attributes: Record<string, any>;
}

export interface XliffFile {
  original: string;
  source_language: string;
  target_language?: string;
  datatype?: string;
  trans_units: TransUnit[];
}

export interface XliffDocument {
  version: string;
  files: XliffFile[];
}

export interface TransUnitUpdate {
  file_index: number;
  trans_unit_id: string;
  target_text: string;
  target_tags: XliffTag[];
}