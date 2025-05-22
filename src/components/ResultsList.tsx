import React, { useState, useEffect } from 'react';
import { 
  Paper, 
  Typography, 
  List, 
  ListItem, 
  Divider, 
  Box,
  Chip,
  Tooltip,
  IconButton,
  LinearProgress
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import { SearchResult } from '../types';

const ResultsList: React.FC = () => {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // 监听搜索结果事件
    const handleSearchResults = (event: Event) => {
      setLoading(false);
      const customEvent = event as CustomEvent<{ results: SearchResult[] }>;
      setResults(customEvent.detail.results);
    };

    // 监听搜索开始事件
    const handleSearchStart = () => {
      setLoading(true);
    };

    window.addEventListener('searchResults', handleSearchResults);
    window.addEventListener('searchStart', handleSearchStart);

    return () => {
      window.removeEventListener('searchResults', handleSearchResults);
      window.removeEventListener('searchStart', handleSearchStart);
    };
  }, []);

  const handleResultClick = async (filePath: string) => {
    try {
      // 调用API打开文件
      const response = await fetch('http://localhost:8000/open-file', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ file_path: filePath })
      });
      
      const data = await response.json();
      if (!data.success) {
        console.error('打开文件失败:', data.message);
      }
    } catch (error) {
      console.error('打开文件请求失败:', error);
    }
  };

  // 获取文件图标
  const getFileIcon = (filePath: string) => {
    const extension = filePath.split('.').pop()?.toLowerCase();
    
    switch(extension) {
      case 'pdf':
        return <InsertDriveFileIcon color="error" />;
      case 'doc':
      case 'docx':
        return <InsertDriveFileIcon color="primary" />;
      case 'xls':
      case 'xlsx':
        return <InsertDriveFileIcon color="success" />;
      case 'txt':
        return <InsertDriveFileIcon />;
      default:
        return <FolderOpenIcon color="action" />;
    }
  };

  // 将相似度分数转换为匹配度百分比
  const getMatchPercentage = (score: number): number => {
    // 将分数从[0,2]范围转换为匹配度百分比[0,100]
    // 分数越低表示越相似，所以使用(1-score/2)*100来转换
    // 限制最小值为0，最大值为100
    const percentage = Math.max(0, Math.min(100, (1 - score/2) * 100));
    return Math.round(percentage); // 四舍五入到整数
  };

  // 根据匹配度百分比获取颜色
  const getMatchColor = (percentage: number): string => {
    if (percentage >= 90) return 'rgba(76, 175, 80, 0.15)'; // 绿色，很高匹配度
    if (percentage >= 75) return 'rgba(76, 175, 80, 0.1)';  // 浅绿色，高匹配度
    if (percentage >= 60) return 'rgba(255, 193, 7, 0.1)';  // 黄色，中等匹配度
    return 'rgba(0, 0, 0, 0.05)';                           // 灰色，低匹配度
  };

  return (
    <Paper 
      elevation={0} 
      sx={{ 
        p: { xs: 1.5, md: 2 }, 
        height: '100%', 
        display: 'flex', 
        flexDirection: 'column', 
        overflow: 'hidden',
        borderRadius: 2,
        width: '100%',
        border: '1px solid rgba(0, 0, 0, 0.06)'
      }}
    >
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        mb: 1,
        borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
        pb: 0.75
      }}>
        <Typography variant="h6" sx={{ fontWeight: 500, fontSize: '1rem' }}>
          搜索结果
          {results.length > 0 && <Typography component="span" variant="subtitle1" sx={{ ml: 1, color: 'text.secondary', fontSize: '0.85rem' }}>
            (共 {results.length} 条)
          </Typography>}
        </Typography>
      </Box>
      
      {loading && <LinearProgress sx={{ mb: 1, borderRadius: 1 }} />}
      
      <Box sx={{ 
        flexGrow: 1, 
        overflowY: 'auto',
        minHeight: 0,
        height: '100%',
        pr: 1
      }}>
        {!loading && results.length === 0 ? (
          <Box sx={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center',
            height: '100%',
            color: 'text.secondary'
          }}>
            <FolderOpenIcon sx={{ fontSize: 50, mb: 1.5, opacity: 0.3 }} />
            <Typography color="text.secondary" align="center" variant="h6" sx={{ fontSize: '1rem' }}>
              暂无搜索结果
            </Typography>
            <Typography variant="caption" color="text.secondary" align="center" sx={{ mt: 0.5, fontSize: '0.75rem' }}>
              请尝试更改搜索关键词或搜索更多目录
            </Typography>
          </Box>
        ) : (
          <List sx={{ p: 0 }}>
            {results.map((result, index) => {
              const matchPercentage = getMatchPercentage(result.score);
              const matchColor = getMatchColor(matchPercentage);
              
              return (
                <React.Fragment key={`${result.source}-${index}`}>
                  {index > 0 && <Divider />}
                  <ListItem 
                    alignItems="flex-start" 
                    sx={{ 
                      py: 2,
                      cursor: 'pointer',
                      '&:hover': {
                        bgcolor: 'rgba(0, 0, 0, 0.04)'
                      },
                      transition: 'all 0.2s ease-in-out',
                      position: 'relative',
                      pl: 2,
                      pr: 2,
                      borderRadius: 1
                    }}
                    onClick={() => handleResultClick(result.source)}
                  >
                    <Box sx={{ width: '100%' }}>
                      <Box sx={{ 
                        display: 'flex', 
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        mb: 1
                      }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', maxWidth: '80%' }}>
                          {getFileIcon(result.source)}
                          <Typography 
                            variant="subtitle1" 
                            color="primary"
                            sx={{ 
                              fontWeight: 500,
                              wordBreak: 'break-all',
                              ml: 1,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {result.source.split('/').pop()}
                          </Typography>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <Chip 
                            label={`匹配度: ${matchPercentage}%`}
                            size="small"
                            sx={{ 
                              mr: 1,
                              fontWeight: 500,
                              bgcolor: matchColor
                            }}
                          />
                          <Tooltip title="打开文件">
                            <IconButton 
                              size="small" 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleResultClick(result.source);
                              }}
                              color="primary"
                              sx={{ 
                                '&:hover': { bgcolor: 'rgba(25, 118, 210, 0.1)' }
                              }}
                            >
                              <OpenInNewIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </Box>
                      <Typography 
                        variant="caption" 
                        color="text.secondary"
                        sx={{ 
                          mb: 1,
                          display: 'block',
                          fontSize: '0.75rem'
                        }}
                      >
                        {result.source}
                      </Typography>
                      <Typography 
                        variant="body2" 
                        color="text.secondary"
                        sx={{
                          display: '-webkit-box',
                          WebkitLineClamp: 3,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'pre-line',
                          lineHeight: 1.5,
                          mt: 1
                        }}
                      >
                        {/* 使用高亮版本的内容，如果存在的话 */}
                        {result.highlighted_content ? (
                          <div 
                            dangerouslySetInnerHTML={{ 
                              __html: result.highlighted_content
                                .replace(/<mark>/g, '<mark style="background-color: #fff9c4; padding: 0 2px; border-radius: 2px;">')
                            }} 
                          />
                        ) : (
                          result.content
                        )}
                      </Typography>
                    </Box>
                  </ListItem>
                </React.Fragment>
              );
            })}
          </List>
        )}
      </Box>
    </Paper>
  );
};

export default ResultsList; 