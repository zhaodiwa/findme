import React, { useState } from 'react';
import { 
  Paper, 
  TextField, 
  Button, 
  Box, 
  CircularProgress,
  Typography,
  InputAdornment 
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { SearchResult } from '../types';

interface SearchPanelProps {
  disabled: boolean;
  indexedDirectories: string[];
  apiBaseUrl: string;
  onSearchResults?: (results: SearchResult[]) => void;
}

const SearchPanel: React.FC<SearchPanelProps> = ({ 
  disabled, 
  indexedDirectories,
  apiBaseUrl,
  onSearchResults 
}) => {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // 匹配度阈值 - 低于这个匹配度的结果将被过滤掉
  const MATCH_THRESHOLD = 30;
  
  // 计算匹配度百分比，与ResultsList.tsx中保持一致
  const calculateMatchPercentage = (score: number): number => {
    const percentage = Math.max(0, Math.min(100, (1 - score/2) * 100));
    return Math.round(percentage);
  };

  const handleSearch = async () => {
    if (!query.trim() || disabled) return;

    try {
      setSearching(true);
      setError(null);
      
      // 触发搜索开始事件
      window.dispatchEvent(new CustomEvent('searchStart'));

      // 搜索所有已索引的目录
      let allResults: SearchResult[] = [];
      
      for (const directory of indexedDirectories) {
        try {
          // 发送搜索请求
          const response = await fetch(`${apiBaseUrl}/search`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query, folder: directory })
          });
          
          const data = await response.json();
          
          if (data.success && data.results) {
            allResults = allResults.concat(data.results);
          }
        } catch (dirError) {
          console.error(`搜索目录 "${directory}" 失败:`, dirError);
        }
      }
      
      // 按文件源去重，保留每个文件最相似的结果
      const uniqueResults: Record<string, SearchResult> = {};
      for (const result of allResults) {
        const source = result.source;
        if (!uniqueResults[source] || result.score < uniqueResults[source].score) {
          uniqueResults[source] = result;
        }
      }
      
      // 将去重后的结果转换回数组
      let results = Object.values(uniqueResults);
      
      // 过滤低匹配度的结果
      const filteredResults = results.filter(result => 
        calculateMatchPercentage(result.score) >= MATCH_THRESHOLD
      );
      
      console.log(`过滤前: ${results.length}个结果, 过滤后: ${filteredResults.length}个结果 (匹配度>=${MATCH_THRESHOLD}%)`);
      
      // 根据分数排序结果（分数越低越相关）
      filteredResults.sort((a, b) => a.score - b.score);
      
      // 限制结果数量
      const limitedResults = filteredResults.slice(0, 10);
      
      // 传递结果
      if (onSearchResults) {
        onSearchResults(limitedResults);
      }

      // 发布全局事件以便其他组件可以响应
      const searchResultsEvent = new CustomEvent('searchResults', { 
        detail: { results: limitedResults } 
      });
      window.dispatchEvent(searchResultsEvent);
      
    } catch (error) {
      console.error('搜索失败:', error);
      setError(`搜索失败: ${error}`);
      
      // 发送空结果，清空结果列表
      window.dispatchEvent(new CustomEvent('searchResults', { 
        detail: { results: [] } 
      }));
    } finally {
      setSearching(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && !disabled && !searching) {
      handleSearch();
    }
  };

  const getHelperText = () => {
    if (error) {
      return error;
    }
    if (disabled) {
      return "请先添加并索引目录，然后再进行搜索";
    }
    return "支持自然语言搜索，试试用问题形式查询";
  };

  return (
    <Paper sx={{ 
      p: { xs: 1.5, md: 2 }, 
      mb: 1,
      borderRadius: 2,
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
    }}>
      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center',
          mb: 0.5
        }}>
          <Box sx={{ flexGrow: 1, mr: 1.5 }}>
            <TextField
              fullWidth
              variant="outlined"
              placeholder="请输入搜索内容，例如：'一份大模型的技术原理介绍文档，张三写的'"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={disabled || searching}
              error={!!error}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon color={disabled ? "disabled" : "primary"} />
                  </InputAdornment>
                ),
              }}
              sx={{ 
                '& .MuiInputBase-root': {
                  height: '46px'
                }
              }}
            />
          </Box>
          <Button
            variant="contained"
            color="primary"
            size="medium"
            startIcon={searching ? <CircularProgress size={16} color="inherit" /> : null}
            onClick={handleSearch}
            disabled={disabled || searching || !query.trim()}
            sx={{ 
              minWidth: '100px', 
              height: '46px',
              px: 2
            }}
          >
            {searching ? '搜索中' : '搜索'}
          </Button>
        </Box>
        
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'space-between',
          alignItems: 'center',
          mt: 0.5
        }}>
          <Typography 
            variant="caption" 
            color={error ? "error" : "text.secondary"}
            sx={{ 
              fontSize: '0.7rem',
              ml: 1
            }}
          >
            {getHelperText()}
          </Typography>
          
          <Typography 
            variant="caption" 
            color="text.secondary" 
            sx={{ 
              display: 'flex', 
              alignItems: 'center',
              fontSize: '0.7rem'
            }}
          >
            <HelpOutlineIcon fontSize="small" sx={{ mr: 0.5, fontSize: '0.9rem' }} />
            目前已索引 {indexedDirectories.length} 个目录 (仅显示匹配度≥{MATCH_THRESHOLD}%的结果)
          </Typography>
        </Box>
      </Box>
    </Paper>
  );
};

export default SearchPanel; 