import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  List,
  ListItem,
  IconButton,
  Typography,
  Box,
  Divider,
  Tooltip,
  Switch,
  FormControlLabel,
  Grid,
  Paper,
  Dialog as ConfirmDialog,
  DialogTitle as ConfirmDialogTitle,
  DialogContent as ConfirmDialogContent,
  DialogContentText,
  DialogActions as ConfirmDialogActions
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import CloseIcon from '@mui/icons-material/Close';
import IndexIcon from '@mui/icons-material/Storage';
import MonitorIcon from '@mui/icons-material/Visibility';
import FolderIcon from '@mui/icons-material/Folder';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CleaningServicesIcon from '@mui/icons-material/CleaningServices';

// 导入IndexedDirectory接口或在这里定义它
interface IndexedDirectory {
  path: string;
  indexed: boolean;
  lastIndexed?: number;
  monitoring?: boolean; // 是否在监控中
}

interface DirectoryManagerProps {
  open: boolean;
  onClose: () => void;
  directories: string[];
  directoriesStatus: Record<string, IndexedDirectory>;
  onAddDirectory: (directory: string) => void;
  onRemoveDirectory: (directory: string) => void;
  onStartIndexing: (directory: string) => void;
  onToggleMonitoring: (directory: string) => void; // 切换文件监控状态
  onCleanAllIndexes: () => void; // 清理所有索引数据
  isIndexing: boolean;
  getDirectoryIndexInfo: (directory: string) => { indexed: boolean; status: string; date?: string };
}

const DirectoryManager: React.FC<DirectoryManagerProps> = ({
  open,
  onClose,
  directories,
  directoriesStatus,
  onAddDirectory,
  onRemoveDirectory,
  onStartIndexing,
  onToggleMonitoring,
  onCleanAllIndexes,
  isIndexing,
  getDirectoryIndexInfo
}) => {
  const [showConfirmDialog, setShowConfirmDialog] = React.useState(false);

  const handleAddDirectory = async () => {
    const directory = await window.electronAPI.selectDirectory();
    if (directory) {
      onAddDirectory(directory);
    }
  };

  const handleIndexAll = () => {
    if (directories.length > 0 && !isIndexing) {
      onStartIndexing(directories[0]);
    }
  };

  const handleCleanAllIndexes = () => {
    setShowConfirmDialog(true);
  };

  const confirmCleanAllIndexes = () => {
    setShowConfirmDialog(false);
    onCleanAllIndexes();
  };

  const cancelCleanAllIndexes = () => {
    setShowConfirmDialog(false);
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth
      PaperProps={{
        sx: { borderRadius: 2 }
      }}
    >
      <DialogTitle sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        borderBottom: '1px solid rgba(0, 0, 0, 0.12)',
        pb: 1
      }}>
        <Typography variant="h6">管理索引目录</Typography>
        <IconButton 
          onClick={onClose}
          size="small"
          aria-label="关闭"
          sx={{ 
            color: 'rgba(0, 0, 0, 0.54)',
            '&:hover': { 
              color: 'rgba(0, 0, 0, 0.87)',
              backgroundColor: 'rgba(0, 0, 0, 0.04)'
            }
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      
      <DialogContent>
        {directories.length === 0 ? (
          <Typography color="text.secondary" align="center" py={4}>
            尚未添加任何目录，请点击下方"添加目录"按钮
          </Typography>
        ) : (
          <List>
            {directories.map((directory, index) => (
              <React.Fragment key={directory}>
                {index > 0 && <Divider sx={{ my: 1 }} />}
                <ListItem
                  sx={{
                    py: 1.5,
                    px: 1,
                    display: 'flex',
                    flexDirection: { xs: 'column', sm: 'row' },
                    alignItems: { xs: 'flex-start', sm: 'center' },
                    justifyContent: 'space-between',
                    bgcolor: index % 2 === 0 ? 'rgba(0, 0, 0, 0.02)' : 'transparent',
                    borderRadius: 1
                  }}
                >
                  {/* 左侧信息区域 */}
                  <Box sx={{ 
                    flex: 1, 
                    minWidth: 0, 
                    mb: { xs: 1, sm: 0 },
                    mr: { xs: 0, sm: 2 } 
                  }}>
                    {/* 目录路径 */}
                    <Box sx={{ 
                      display: 'flex', 
                      alignItems: 'center',
                      mb: 0.5
                    }}>
                      <FolderIcon sx={{ 
                        fontSize: '1rem', 
                        mr: 0.5, 
                        color: 'primary.main', 
                        opacity: 0.8 
                      }} />
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          fontWeight: 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {directory}
                      </Typography>
                    </Box>
                    
                    {/* 索引状态和时间 */}
                    <Box sx={{ 
                      display: 'flex',
                      alignItems: 'center',
                      color: getDirectoryIndexInfo(directory).indexed 
                        ? 'success.main' 
                        : 'text.secondary'
                    }}>
                      {getDirectoryIndexInfo(directory).indexed && (
                        <AccessTimeIcon sx={{ fontSize: '0.875rem', mr: 0.5 }} />
                      )}
                      <Typography 
                        variant="caption" 
                        color="inherit"
                      >
                        {getDirectoryIndexInfo(directory).status}
                      </Typography>
                    </Box>
                  </Box>
                  
                  {/* 右侧操作区域 */}
                  <Box sx={{ 
                    display: 'flex', 
                    alignItems: 'center',
                    gap: 1,
                    minWidth: { xs: '100%', sm: 'auto' },
                    justifyContent: { xs: 'flex-end', sm: 'flex-end' }
                  }}>
                    {/* 文件监控开关 */}
                    {directoriesStatus[directory]?.indexed && (
                      <FormControlLabel
                        control={
                          <Switch
                            checked={!!directoriesStatus[directory]?.monitoring}
                            onChange={() => onToggleMonitoring(directory)}
                            disabled={isIndexing}
                            color="primary"
                            size="small"
                          />
                        }
                        label="文件变化监控"
                        sx={{ mr: 1, '& .MuiFormControlLabel-label': { fontSize: '0.875rem' } }}
                      />
                    )}
                    
                    {/* 创建索引按钮 */}
                    <Button
                      variant="contained"
                      color="primary"
                      size="small"
                      startIcon={<IndexIcon />}
                      onClick={() => onStartIndexing(directory)}
                      disabled={isIndexing}
                      sx={{ minWidth: 'auto', px: 1 }}
                    >
                      创建索引
                    </Button>
                    
                    {/* 删除按钮 */}
                    <Button
                      variant="outlined"
                      color="error"
                      size="small"
                      startIcon={<DeleteIcon />}
                      onClick={() => onRemoveDirectory(directory)}
                      disabled={isIndexing}
                      sx={{ minWidth: 'auto', px: 1 }}
                    >
                      删除
                    </Button>
                  </Box>
                </ListItem>
              </React.Fragment>
            ))}
          </List>
        )}
      </DialogContent>

      <DialogActions sx={{ 
        p: 2,
        justifyContent: 'space-between', 
        borderTop: '1px solid rgba(0, 0, 0, 0.12)'
      }}>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAddDirectory}
            disabled={isIndexing}
          >
            添加目录
          </Button>
          <Button
            variant="outlined"
            color="error"
            startIcon={<CleaningServicesIcon />}
            onClick={handleCleanAllIndexes}
            disabled={isIndexing}
          >
            清理所有索引
          </Button>
        </Box>
        <Button 
          variant="outlined" 
          color="primary" 
          onClick={onClose}
        >
          关闭
        </Button>
      </DialogActions>

      {/* 确认对话框 */}
      <ConfirmDialog
        open={showConfirmDialog}
        onClose={cancelCleanAllIndexes}
      >
        <ConfirmDialogTitle>
          确认清理所有索引数据
        </ConfirmDialogTitle>
        <ConfirmDialogContent>
          <DialogContentText>
            此操作将删除所有目录的索引数据，需要重新创建索引才能继续使用搜索功能。确定要清理所有索引数据吗？
          </DialogContentText>
        </ConfirmDialogContent>
        <ConfirmDialogActions>
          <Button onClick={cancelCleanAllIndexes} color="primary">
            取消
          </Button>
          <Button onClick={confirmCleanAllIndexes} color="error" autoFocus>
            确认清理
          </Button>
        </ConfirmDialogActions>
      </ConfirmDialog>
    </Dialog>
  );
};

export default DirectoryManager; 