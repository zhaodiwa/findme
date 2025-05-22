import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  LinearProgress,
  Typography,
  Box,
  IconButton,
  Grid,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Collapse,
  Paper
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';

interface FileInfo {
  name: string;
  path: string;
  reason?: string;
}

interface IndexProgressProps {
  open: boolean;
  onClose: () => void;
  progress: number;
  status: string;
  isIndexing: boolean;
  successCount?: number;
  failureCount?: number;
  skippedCount?: number;
  totalCount?: number;
  successFiles?: FileInfo[];
  failedFiles?: FileInfo[];
  skippedFiles?: FileInfo[];
}

const IndexProgress: React.FC<IndexProgressProps> = ({
  open,
  onClose,
  progress,
  status,
  isIndexing,
  successCount = 0,
  failureCount = 0,
  skippedCount = 0,
  totalCount = 0,
  successFiles = [],
  failedFiles = [],
  skippedFiles = []
}) => {
  // 定义当前显示的文件列表类型，null表示都不显示
  const [activeFileList, setActiveFileList] = useState<'success' | 'failed' | 'skipped' | null>(null);

  // 新的切换函数，确保一次只展开一个列表
  const toggleFileList = (listType: 'success' | 'failed' | 'skipped') => {
    if (activeFileList === listType) {
      // 如果当前已经是激活状态，则关闭
      setActiveFileList(null);
    } else {
      // 否则切换到新的列表
      setActiveFileList(listType);
    }
  };

  // 判断各列表是否显示
  const showSuccessFiles = activeFileList === 'success';
  const showFailedFiles = activeFileList === 'failed';
  const showSkippedFiles = activeFileList === 'skipped';

  return (
    <Dialog 
      open={open} 
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
        mb: 1,
        pb: 1
      }}>
        <Typography variant="h6">正在索引文件</Typography>
        {!isIndexing && (
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
        )}
      </DialogTitle>
      
      <DialogContent>
        <Box sx={{ mb: 3, mt: 1 }}>
          <LinearProgress 
            variant="determinate" 
            value={progress} 
            sx={{ 
              height: 10, 
              borderRadius: 5,
              mb: 2
            }} 
          />
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mt: 1 }}>
            <Typography 
              variant="body2" 
              color="text.secondary" 
              align="center"
            >
              {status || '准备索引...'}
            </Typography>
            <Typography variant="body2" color="primary" sx={{ ml: 1 }}>
              {progress}%
            </Typography>
          </Box>
        </Box>

        {/* 文件处理统计信息 */}
        {(successCount > 0 || failureCount > 0 || skippedCount > 0 || totalCount > 0) && (
          <Box sx={{ mt: 2, border: '1px solid rgba(0, 0, 0, 0.12)', borderRadius: 1, p: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>文件处理统计：</Typography>
            
            <Grid container spacing={1}>
              {totalCount > 0 && (
                <Grid item xs={12}>
                  <Typography variant="body2" color="text.secondary">
                    总计: <strong>{totalCount}</strong> 个文件
                  </Typography>
                </Grid>
              )}
              
              <Grid item xs={4} sm={4}>
                <Chip
                  icon={<CheckCircleIcon />}
                  label={`成功: ${successCount}`}
                  color="success"
                  size="small"
                  variant={showSuccessFiles ? "filled" : "outlined"}
                  sx={{ width: '100%', cursor: successCount > 0 ? 'pointer' : 'default' }}
                  onClick={successCount > 0 ? () => toggleFileList('success') : undefined}
                  deleteIcon={showSuccessFiles ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  onDelete={successCount > 0 ? () => toggleFileList('success') : undefined}
                />
              </Grid>
              
              <Grid item xs={4} sm={4}>
                <Chip
                  icon={<ErrorIcon />}
                  label={`失败: ${failureCount}`}
                  color="error"
                  size="small"
                  variant={showFailedFiles ? "filled" : "outlined"}
                  sx={{ width: '100%', cursor: failureCount > 0 ? 'pointer' : 'default' }}
                  onClick={failureCount > 0 ? () => toggleFileList('failed') : undefined}
                  deleteIcon={showFailedFiles ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  onDelete={failureCount > 0 ? () => toggleFileList('failed') : undefined}
                />
              </Grid>
              
              <Grid item xs={4} sm={4}>
                <Chip
                  icon={<SkipNextIcon />}
                  label={`跳过: ${skippedCount}`}
                  color="warning"
                  size="small"
                  variant={showSkippedFiles ? "filled" : "outlined"}
                  sx={{ width: '100%', cursor: skippedCount > 0 ? 'pointer' : 'default' }}
                  onClick={skippedCount > 0 ? () => toggleFileList('skipped') : undefined}
                  deleteIcon={showSkippedFiles ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  onDelete={skippedCount > 0 ? () => toggleFileList('skipped') : undefined}
                />
              </Grid>
            </Grid>
            
            {/* 成功文件列表 */}
            <Collapse in={showSuccessFiles} timeout="auto" unmountOnExit>
              <Paper variant="outlined" sx={{ mt: 2, maxHeight: 200, overflow: 'auto' }}>
                <List dense>
                  {successFiles.length > 0 ? (
                    successFiles.map((file, index) => (
                      <ListItem key={index}>
                        <ListItemIcon sx={{ minWidth: 36 }}>
                          <InsertDriveFileIcon color="success" fontSize="small" />
                        </ListItemIcon>
                        <ListItemText 
                          primary={file.name}
                          secondary={file.path}
                          primaryTypographyProps={{ variant: 'body2' }}
                          secondaryTypographyProps={{ variant: 'caption', noWrap: true }}
                        />
                      </ListItem>
                    ))
                  ) : (
                    <ListItem>
                      <ListItemText primary="没有成功处理的文件" />
                    </ListItem>
                  )}
                </List>
              </Paper>
            </Collapse>
            
            {/* 失败文件列表 */}
            <Collapse in={showFailedFiles} timeout="auto" unmountOnExit>
              <Paper variant="outlined" sx={{ mt: 2, maxHeight: 200, overflow: 'auto' }}>
                <List dense>
                  {failedFiles.length > 0 ? (
                    failedFiles.map((file, index) => (
                      <ListItem key={index}>
                        <ListItemIcon sx={{ minWidth: 36 }}>
                          <InsertDriveFileIcon color="error" fontSize="small" />
                        </ListItemIcon>
                        <ListItemText 
                          primary={file.name}
                          secondary={`${file.path} (${file.reason || '未知原因'})`}
                          primaryTypographyProps={{ variant: 'body2' }}
                          secondaryTypographyProps={{ variant: 'caption', noWrap: true }}
                        />
                      </ListItem>
                    ))
                  ) : (
                    <ListItem>
                      <ListItemText primary="没有处理失败的文件" />
                    </ListItem>
                  )}
                </List>
              </Paper>
            </Collapse>
            
            {/* 跳过文件列表 */}
            <Collapse in={showSkippedFiles} timeout="auto" unmountOnExit>
              <Paper variant="outlined" sx={{ mt: 2, maxHeight: 200, overflow: 'auto' }}>
                <List dense>
                  {skippedFiles.length > 0 ? (
                    skippedFiles.map((file, index) => (
                      <ListItem key={index}>
                        <ListItemIcon sx={{ minWidth: 36 }}>
                          <InsertDriveFileIcon color="warning" fontSize="small" />
                        </ListItemIcon>
                        <ListItemText 
                          primary={file.name}
                          secondary={`${file.path} (${file.reason || '未知原因'})`}
                          primaryTypographyProps={{ variant: 'body2' }}
                          secondaryTypographyProps={{ variant: 'caption', noWrap: true }}
                        />
                      </ListItem>
                    ))
                  ) : (
                    <ListItem>
                      <ListItemText primary="没有跳过的文件" />
                    </ListItem>
                  )}
                </List>
              </Paper>
            </Collapse>
            
            {(
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                * 跳过的文件可能是因为文件过大（超过100MB）
              </Typography>
            )}
            
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              * 失败的文件可能是因为格式不支持（系统支持.txt、.pdf、.docx、.pptx、.xlsx、.xls、.csv），或解析过程中出错
            </Typography>
          </Box>
        )}
      </DialogContent>
      
      <DialogActions sx={{ p: 2, borderTop: '1px solid rgba(0, 0, 0, 0.12)' }}>
        <Button 
          variant="outlined"
          color="primary"
          onClick={onClose} 
          disabled={isIndexing}
          startIcon={isIndexing ? null : <TaskAltIcon color="success" />}
        >
          {progress === 100 ? '完成' : '关闭'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default IndexProgress; 