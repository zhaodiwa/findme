import React, { useState, useEffect, useCallback } from 'react';
import { 
  CssBaseline, 
  ThemeProvider, 
  createTheme,
  Container,
  Box,
  AppBar,
  Toolbar,
  Typography,
  Chip,
  Button,
  CircularProgress,
  Badge,
  Tooltip,
  Alert,
  Snackbar,
  Drawer,
  IconButton
} from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import SearchIcon from '@mui/icons-material/Search';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import StorageIcon from '@mui/icons-material/Storage';
import FeedbackIcon from '@mui/icons-material/Feedback';
import CloseIcon from '@mui/icons-material/Close';
import SearchPanel from './components/SearchPanel';
import ResultsList from './components/ResultsList';
import DirectoryManager from './components/DirectoryManager';
import IndexProgress from './components/IndexProgress';
import FeedbackForm from './components/FeedbackForm';
import Announcement from './components/Announcement';
import UpdateChecker from './components/UpdateChecker';
import { apiBaseUrl } from './services/config';

// 索引状态接口
interface IndexedDirectory {
  path: string;
  indexed: boolean;
  lastIndexed?: number; // 时间戳
  monitoring?: boolean; // 是否监控中
}

const theme = createTheme({
  palette: {
    primary: {
      main: '#1976d2',
      light: '#42a5f5',
      dark: '#1565c0'
    },
    secondary: {
      main: '#2e7d32',
      light: '#4caf50',
      dark: '#1b5e20'
    },
    error: {
      main: '#d32f2f'
    },
    background: {
      default: '#f5f5f5',
      paper: '#ffffff'
    },
  },
  typography: {
    fontFamily: '"PingFang SC", "Microsoft YaHei", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 500
        }
      }
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.05)'
        }
      }
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.12)'
        }
      }
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 500
        }
      }
    }
  }
});

const App: React.FC = () => {
  // 状态
  const [status, setStatus] = useState<'ready' | 'error' | 'loading'>('loading');
  const [statusMessage, setStatusMessage] = useState('正在初始化...');
  const [indexedDirectories, setIndexedDirectories] = useState<string[]>([]);
  const [directoryStatusMap, setDirectoryStatusMap] = useState<Record<string, IndexedDirectory>>({});
  const [isIndexing, setIsIndexing] = useState(false);
  const [showDirectoryManager, setShowDirectoryManager] = useState(false);
  const [showIndexProgress, setShowIndexProgress] = useState(false);
  const [indexProgress, setIndexProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState('');
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [notification, setNotification] = useState<{show: boolean, message: string, type: 'success' | 'error' | 'info'}>({
    show: false,
    message: '',
    type: 'info'
  });
  const [showFeedbackDrawer, setShowFeedbackDrawer] = useState(false);
  const [successCount, setSuccessCount] = useState(0);
  const [failureCount, setFailureCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [totalProcessedCount, setTotalProcessedCount] = useState(0);
  const [successFiles, setSuccessFiles] = useState<any[]>([]);
  const [failedFiles, setFailedFiles] = useState<any[]>([]);
  const [skippedFiles, setSkippedFiles] = useState<any[]>([]);

  // 初始化应用
  useEffect(() => {
    // 监听Python服务准备就绪
    window.electronAPI.onPythonReady((url) => {
      console.log('Python服务已准备就绪:', url);
      setStatus('ready');
      setStatusMessage('后台服务就绪，系统功能已可使用');  // 改为更明确的状态信息，不再清空
      loadConfig();
    });

    // 监听Python服务错误
    window.electronAPI.onPythonError((message) => {
      console.error('Python服务错误:', message);
      setStatus('error');
      setStatusMessage(`后端错误: ${message}`);
    });
  }, []);

  // 加载配置
  const loadConfig = async () => {
    try {
      const config = await window.electronAPI.getConfig();
      console.log('加载配置:', config);

      if (config) {
        let dirs: string[] = [];
        let statusMap: Record<string, IndexedDirectory> = {};

        // 加载索引目录列表
        if (config.indexedDirectories && Array.isArray(config.indexedDirectories)) {
          dirs = config.indexedDirectories;
        } else if (config.indexedFolder) {
          // 兼容旧版配置
          dirs = [config.indexedFolder];
        }

        // 加载索引状态
        if (config.directoryStatusMap && typeof config.directoryStatusMap === 'object') {
          statusMap = config.directoryStatusMap;
        } else {
          // 如果没有保存状态，初始化每个目录的状态
          dirs.forEach(dir => {
            statusMap[dir] = {
              path: dir,
              indexed: false
            };
          });
        }

        setIndexedDirectories(dirs);
        setDirectoryStatusMap(statusMap);

        // 检查是否有可用的索引
        if (dirs.length > 0) {
          // 添加延迟，确保Python API已经准备好
          setTimeout(async () => {
            try {
              await checkIndexStatus(dirs, statusMap);
            } catch (error) {
              console.error('初次检查索引状态失败，将在5秒后重试:', error);
              // 如果首次检查失败，5秒后重试一次
              setTimeout(async () => {
                try {
                  await checkIndexStatus(dirs, statusMap);
                } catch (retryError) {
                  console.error('重试检查索引状态也失败:', retryError);
                  // 即使API检查失败，也尝试使用保存的状态恢复搜索功能
                  const hasValidIndex = Object.values(statusMap).some(dir => dir.indexed);
                  setSearchEnabled(hasValidIndex);
                  if (hasValidIndex) {
                    showNotification('已从本地配置恢复索引状态', 'info');
                  }
                }
              }, 5000);
            }
          }, 1000);
        }
      }
    } catch (error) {
      console.error('加载配置失败:', error);
      showNotification('加载配置失败', 'error');
    }
  };

  // 显示通知
  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setNotification({
      show: true,
      message,
      type
    });
  };

  // 关闭通知
  const closeNotification = () => {
    setNotification(prev => ({...prev, show: false}));
  };

  // 检查索引状态
  const checkIndexStatus = async (
    directories: string[] = indexedDirectories, 
    statusMap: Record<string, IndexedDirectory> = directoryStatusMap
  ) => {
    console.log('检查索引状态:', directories);
    if (!directories || directories.length === 0) return;
    
    let hasValidIndex = false;
    const updatedStatusMap = {...statusMap};
    
    for (const dir of directories) {
      try {
        // 检查索引是否存在
        const response = await fetch(`${apiBaseUrl}/check-db?folder=${encodeURIComponent(dir)}`);
        const data = await response.json();
        
        // 检查监控状态
        const monResponse = await fetch(`${apiBaseUrl}/monitoring-status?folder=${encodeURIComponent(dir)}`);
        const monData = await monResponse.json();
        
        // 更新目录状态
        updatedStatusMap[dir] = {
          ...updatedStatusMap[dir],
          path: dir,
          indexed: data.exists,
          monitoring: monData.success ? monData.is_monitoring : false
        };
        
        if (data.exists) hasValidIndex = true;
      } catch (error) {
        console.error(`检查目录 ${dir} 索引状态时出错:`, error);
        // 保持现有状态不变，或标记为出错
        updatedStatusMap[dir] = {
          ...updatedStatusMap[dir],
          path: dir
        };
      }
    }
    
    // 更新状态
    setDirectoryStatusMap(updatedStatusMap);
    setSearchEnabled(hasValidIndex);
    
    // 保存更新后的配置
    await saveConfig({
      indexedDirectories: directories,
      directoryStatusMap: updatedStatusMap
    });
    
    return hasValidIndex;
  };

  // 保存配置
  const saveConfig = async (config?: any) => {
    try {
      const configToSave = config || {
        indexedDirectories,
        directoryStatusMap
      };
      
      await window.electronAPI.saveConfig(configToSave);
      console.log('配置已保存:', configToSave);
    } catch (error) {
      console.error('保存配置失败:', error);
      showNotification('保存配置失败', 'error');
    }
  };

  // 添加目录
  const addDirectory = async (directory: string) => {
    if (!indexedDirectories.includes(directory)) {
      const newDirectories = [...indexedDirectories, directory];
      const newStatusMap = {...directoryStatusMap};
      
      // 初始化新目录的状态
      newStatusMap[directory] = {
        path: directory,
        indexed: false
      };
      
      setIndexedDirectories(newDirectories);
      setDirectoryStatusMap(newStatusMap);
      
      // 保存更新后的配置
      await saveConfig({
        indexedDirectories: newDirectories,
        directoryStatusMap: newStatusMap
      });
      
      showNotification(`已添加目录: ${directory}`, 'success');
    } else {
      showNotification('该目录已存在', 'info');
    }
  };

  // 删除目录
  const removeDirectory = async (directory: string) => {
    const newDirectories = indexedDirectories.filter(dir => dir !== directory);
    const newStatusMap = {...directoryStatusMap};
    
    // 删除目录状态
    delete newStatusMap[directory];
    
    setIndexedDirectories(newDirectories);
    setDirectoryStatusMap(newStatusMap);
    
    // 保存更新后的配置
    await saveConfig({
      indexedDirectories: newDirectories,
      directoryStatusMap: newStatusMap
    });
    
    // 检查是否还有可用索引
    const hasValidIndex = Object.values(newStatusMap).some(dir => dir.indexed);
    setSearchEnabled(hasValidIndex);
    
    showNotification(`已删除目录: ${directory}`, 'success');
  };

  // 管理目录
  const handleManageDirectories = () => {
    setShowDirectoryManager(true);
  };

  // 开始索引
  const startIndexing = async (directory: string) => {
    try {
      setIsIndexing(true);
      setShowIndexProgress(true);
      setIndexProgress(0);
      setProgressStatus('准备索引...');

      const response = await fetch(`${apiBaseUrl}/index`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ folder: directory })
      });

      const data = await response.json();
      
      if (data.success) {
        // 更新当前索引的目录
        const updatedStatusMap = {...directoryStatusMap};
        updatedStatusMap[directory] = {
          ...updatedStatusMap[directory] || { path: directory },
          indexed: false // 正在索引中，暂时标记为false
        };
        setDirectoryStatusMap(updatedStatusMap);
        
        // 开始轮询索引进度
        pollIndexProgress(directory);
      } else {
        throw new Error(data.message || '开始索引失败');
      }
    } catch (error) {
      console.error('开始索引失败:', error);
      setProgressStatus(`索引失败: ${error}`);
      setIsIndexing(false);
      showNotification(`索引失败: ${error}`, 'error');
    }
  };

  // 轮询索引进度
  const pollIndexProgress = (directory: string) => {
    const progressInterval = setInterval(async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/index-progress`);
        const data = await response.json();
        
        // 更新进度
        setIndexProgress(data.progress);
        setProgressStatus(data.status);
        
        // 更新文件处理统计
        if (data.file_stats) {
          setSuccessCount(data.file_stats.success_count || 0);
          setFailureCount(data.file_stats.failure_count || 0);
          setSkippedCount(data.file_stats.skipped_count || 0);
          setTotalProcessedCount(data.file_stats.total_count || 0);
        }
        
        // 更新文件列表
        setSuccessFiles(data.success_files || []);
        setFailedFiles(data.failed_files || []);
        setSkippedFiles(data.skipped_files || []);
        
        // 如果索引完成或出错
        if (data.completed || data.error) {
          clearInterval(progressInterval);
          
          if (data.completed) {
            setIndexProgress(100);
            setProgressStatus('索引完成');
            
            // 更新目录索引状态
            const updatedStatusMap = {...directoryStatusMap};
            updatedStatusMap[directory] = {
              path: directory,
              indexed: true,
              lastIndexed: Date.now()
            };
            setDirectoryStatusMap(updatedStatusMap);
            setSearchEnabled(true);
            
            // 保存更新后的配置
            await saveConfig({
              indexedDirectories,
              directoryStatusMap: updatedStatusMap
            });
            
            // 从状态信息中提取文件处理统计
            const statsMatch = data.status.match(/成功处理\s+(\d+)\s+个文件，失败\s+(\d+)\s+个文件，跳过\s+(\d+)\s+个文件/);
            if (statsMatch && statsMatch.length >= 4) {
              setSuccessCount(parseInt(statsMatch[1]) || 0);
              setFailureCount(parseInt(statsMatch[2]) || 0);
              setSkippedCount(parseInt(statsMatch[3]) || 0);
              setTotalProcessedCount((parseInt(statsMatch[1]) || 0) + (parseInt(statsMatch[2]) || 0) + (parseInt(statsMatch[3]) || 0));
            }
            
            showNotification(`目录索引完成: ${directory}`, 'success');
          } else if (data.error) {
            setProgressStatus(`索引错误: ${data.error}`);
            showNotification(`索引错误: ${data.error}`, 'error');
          }
          
          setIsIndexing(false);
        }
      } catch (error) {
        console.error('获取索引进度失败:', error);
        clearInterval(progressInterval);
        setProgressStatus('获取索引进度失败');
        setIsIndexing(false);
        showNotification('获取索引进度失败', 'error');
      }
    }, 1000);
  };

  // 获取目录索引状态信息
  const getDirectoryIndexInfo = (directory: string) => {
    const dirStatus = directoryStatusMap[directory];
    if (!dirStatus) return { indexed: false, status: '未索引' };
    
    if (dirStatus.indexed) {
      const lastIndexedDate = dirStatus.lastIndexed 
        ? new Date(dirStatus.lastIndexed).toLocaleString() 
        : '未知时间';
      return {
        indexed: true,
        status: `已索引 (${lastIndexedDate})`,
        date: lastIndexedDate
      };
    }
    
    return { indexed: false, status: '未索引' };
  };

  // 渲染状态标签
  const renderStatusChip = () => {
    // 只在错误状态下显示状态信息
    if (status === 'error') {
      return (
        <Chip
          label={statusMessage}
          color="error"
          size="small"
        />
      );
    }
    
    // 其他状态（loading或ready）不显示状态信息
    return null;
  };

  // 启动文件监控
  const startMonitoring = async (directory: string) => {
    try {
      const response = await fetch(`${apiBaseUrl}/start-monitoring`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ folder: directory })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // 更新监控状态
        const updatedStatusMap = {...directoryStatusMap};
        updatedStatusMap[directory] = {
          ...updatedStatusMap[directory],
          monitoring: true
        };
        setDirectoryStatusMap(updatedStatusMap);
        
        // 保存状态
        await saveConfig({
          indexedDirectories,
          directoryStatusMap: updatedStatusMap
        });
        
        showNotification(`已开启对 ${directory} 的文件监控`, 'success');
        return true;
      } else {
        throw new Error(data.message || '启动文件监控失败');
      }
    } catch (error) {
      console.error('启动文件监控失败:', error);
      showNotification(`启动文件监控失败: ${error}`, 'error');
      return false;
    }
  };
  
  // 停止文件监控
  const stopMonitoring = async (directory: string) => {
    try {
      const response = await fetch(`${apiBaseUrl}/stop-monitoring`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ folder: directory })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // 更新监控状态
        const updatedStatusMap = {...directoryStatusMap};
        updatedStatusMap[directory] = {
          ...updatedStatusMap[directory],
          monitoring: false
        };
        setDirectoryStatusMap(updatedStatusMap);
        
        // 保存状态
        await saveConfig({
          indexedDirectories,
          directoryStatusMap: updatedStatusMap
        });
        
        showNotification(`已停止对 ${directory} 的文件监控`, 'info');
        return true;
      } else {
        throw new Error(data.message || '停止文件监控失败');
      }
    } catch (error) {
      console.error('停止文件监控失败:', error);
      showNotification(`停止文件监控失败: ${error}`, 'error');
      return false;
    }
  };
  
  // 切换文件监控状态
  const toggleMonitoring = async (directory: string) => {
    const dirStatus = directoryStatusMap[directory];
    if (dirStatus && dirStatus.monitoring) {
      return stopMonitoring(directory);
    } else {
      return startMonitoring(directory);
    }
  };

  // 清理所有索引数据
  const cleanAllIndexes = async () => {
    try {
      setIsIndexing(true); // 防止用户在清理过程中进行其他操作
      setProgressStatus('正在清理所有索引数据...');

      const response = await fetch(`${apiBaseUrl}/clean-all-indexes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();
      
      if (data.success) {
        // 更新所有目录的状态为未索引
        const updatedStatusMap: Record<string, IndexedDirectory> = {};
        
        indexedDirectories.forEach(dir => {
          updatedStatusMap[dir] = {
            path: dir,
            indexed: false,
            monitoring: false
          };
        });
        
        setDirectoryStatusMap(updatedStatusMap);
        setSearchEnabled(false);
        
        // 保存更新后的配置
        await saveConfig({
          indexedDirectories,
          directoryStatusMap: updatedStatusMap
        });
        
        showNotification('所有索引数据已清理', 'success');
      } else {
        throw new Error(data.message || '清理索引数据失败');
      }
    } catch (error) {
      console.error('清理索引数据失败:', error);
      showNotification(`清理索引数据失败: ${error}`, 'error');
    } finally {
      setIsIndexing(false);
    }
  };

  // 处理反馈提交
  const handleFeedbackSubmit = async (email: string, content: string) => {
    try {
      const result = await window.electronAPI.submitFeedback({ email, content });
      return result;
    } catch (error) {
      console.error('提交反馈失败:', error);
      return {
        success: false,
        message: '提交反馈时发生错误'
      };
    }
  };

  // 获取公告 - 使用useCallback缓存函数引用
  const getAnnouncements = useCallback(async () => {
    try {
      return await window.electronAPI.getAnnouncements();
    } catch (error) {
      console.error('获取公告失败:', error);
      return {
        success: false,
        data: [],
        message: '获取公告失败'
      };
    }
  }, []); // 空依赖数组，表示该函数不依赖于任何状态变量

  // 状态栏内容渲染，包括状态信息和更新检查按钮
  const renderStatusBarContent = () => {
    return (
      <Box display="flex" alignItems="center" gap={1}>
        {/* 状态信息 - 只在错误时显示 */}
        {renderStatusChip()}
        
        {/* 更新检查按钮 - 仅在ready状态下显示 */}
        {status === 'ready' && <UpdateChecker />}
        
        {/* 加载指示器 - 仅在loading状态下显示 */}
        {status === 'loading' && <CircularProgress size={16} sx={{ mr: 1 }} />}
      </Box>
    );
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
        <AppBar position="static" color="primary" elevation={0} sx={{ height: 'auto' }}>
          <Toolbar variant="dense" sx={{ minHeight: '48px', py: 0.5 }}>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 'bold', fontSize: '1.1rem' }}>
              文件语义搜索器
            </Typography>
            
            <Tooltip title="管理索引目录">
              <Badge 
                badgeContent={indexedDirectories.length} 
                color="secondary"
                overlap="circular"
                sx={{ mr: 1.5 }}
              >
                <Button 
                  color="inherit" 
                  startIcon={<FolderIcon />}
                  onClick={handleManageDirectories}
                  variant="outlined"
                  size="small"
                  sx={{ 
                    borderColor: 'rgba(255, 255, 255, 0.5)',
                    '&:hover': {
                      borderColor: 'rgba(255, 255, 255, 0.8)',
                      backgroundColor: 'rgba(255, 255, 255, 0.08)'
                    },
                    py: 0.5
                  }}
                >
                  管理索引目录
                </Button>
              </Badge>
            </Tooltip>
            
            <Tooltip title="意见反馈">
              <Button 
                color="inherit" 
                startIcon={<FeedbackIcon />}
                onClick={() => setShowFeedbackDrawer(true)}
                variant="outlined"
                size="small"
                sx={{ 
                  borderColor: 'rgba(255, 255, 255, 0.5)',
                  '&:hover': {
                    borderColor: 'rgba(255, 255, 255, 0.8)',
                    backgroundColor: 'rgba(255, 255, 255, 0.08)'
                  },
                  py: 0.5,
                  mr: 1.5
                }}
              >
                意见反馈
              </Button>
            </Tooltip>
            
            {renderStatusBarContent()}
          </Toolbar>
        </AppBar>
        
        <Container maxWidth="xl" sx={{ 
          mt: 1, // 减少顶部间距
          mb: 1, // 减少底部间距
          flexGrow: 1, 
          display: 'flex', 
          flexDirection: 'column', 
          overflow: 'hidden',
          px: { xs: 2, sm: 2, md: 3 } // 减少水平内边距
        }}>
          <Announcement getAnnouncements={getAnnouncements} />
          
          <SearchPanel 
            disabled={!searchEnabled} 
            indexedDirectories={indexedDirectories.filter(dir => directoryStatusMap[dir]?.indexed)} 
            apiBaseUrl={apiBaseUrl}
          />
          
          <Box sx={{ 
            flexGrow: 1,
            mt: 1, // 减少搜索面板与结果列表之间的间距
            display: 'flex',
            overflow: 'hidden'
          }}>
            <ResultsList />
          </Box>
        </Container>
      </Box>

      {/* 目录管理对话框 */}
      <DirectoryManager 
        open={showDirectoryManager}
        onClose={() => setShowDirectoryManager(false)}
        directories={indexedDirectories}
        directoriesStatus={directoryStatusMap}
        onAddDirectory={addDirectory}
        onRemoveDirectory={removeDirectory}
        onStartIndexing={startIndexing}
        onToggleMonitoring={toggleMonitoring}
        onCleanAllIndexes={cleanAllIndexes}
        isIndexing={isIndexing}
        getDirectoryIndexInfo={getDirectoryIndexInfo}
      />

      {/* 索引进度对话框 */}
      <IndexProgress
        open={showIndexProgress}
        onClose={() => setShowIndexProgress(false)}
        progress={indexProgress}
        status={progressStatus}
        isIndexing={isIndexing}
        successCount={successCount}
        failureCount={failureCount}
        skippedCount={skippedCount}
        totalCount={totalProcessedCount}
        successFiles={successFiles}
        failedFiles={failedFiles}
        skippedFiles={skippedFiles}
      />

      {/* 通知提示 */}
      <Snackbar 
        open={notification.show} 
        autoHideDuration={5000} 
        onClose={closeNotification}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert 
          onClose={closeNotification} 
          severity={notification.type} 
          variant="filled"
          sx={{ width: '100%' }}
        >
          {notification.message}
        </Alert>
      </Snackbar>

      {/* 反馈抽屉 */}
      <Drawer
        anchor="right"
        open={showFeedbackDrawer}
        onClose={() => setShowFeedbackDrawer(false)}
        sx={{
          '& .MuiDrawer-paper': {
            width: { xs: '100%', sm: 450 },
            boxSizing: 'border-box',
          },
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2, borderBottom: '1px solid rgba(0, 0, 0, 0.1)' }}>
          <Typography variant="h6">意见反馈</Typography>
          <IconButton onClick={() => setShowFeedbackDrawer(false)}>
            <CloseIcon />
          </IconButton>
        </Box>
        <Box sx={{ p: 2 }}>
          <FeedbackForm onSubmit={handleFeedbackSubmit} />
        </Box>
      </Drawer>
    </ThemeProvider>
  );
};

export default App; 