// 搜索结果类型
export interface SearchResult {
  content: string;
  highlighted_content?: string;
  source: string;
  score: number;
}

// 索引状态类型
export interface IndexStatus {
  in_progress: boolean;
  progress: number;
  status: string;
  error: string | null;
  completed: boolean;
}

// 索引目录配置类型
export interface IndexConfig {
  indexedDirectories: string[];
} 