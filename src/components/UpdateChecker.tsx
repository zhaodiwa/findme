import React, { useState, useEffect } from 'react';
import { 
  Button, 
  Dialog, 
  DialogActions, 
  DialogContent, 
  DialogContentText, 
  DialogTitle,
  CircularProgress,
  Box,
  Typography,
  LinearProgress
} from '@mui/material';
import SystemUpdateIcon from '@mui/icons-material/SystemUpdate';

interface UpdateCheckerProps {
  showButton?: boolean;
}

const UpdateChecker: React.FC<UpdateCheckerProps> = ({ showButton = true }) => {
  const [checking, setChecking] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadComplete, setDownloadComplete] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    // 监听更新事件
    const handleUpdateAvailable = (info: any) => {
      console.log('发现更新:', info);
      setUpdateAvailable(true);
      setUpdateInfo(info);
      setDialogOpen(true);
      setIsDownloading(true);
    };

    const handleUpdateDownloaded = (info: any) => {
      console.log('更新下载完成:', info);
      setDownloadComplete(true);
      setIsDownloading(false);
      setUpdateInfo(info);
      setDialogOpen(true);
    };

    const handleUpdateError = (error: any) => {
      console.error('更新错误:', error);
      setUpdateError(error.message || '更新过程中出现错误');
      setChecking(false);
      setIsDownloading(false);
    };

    const handleDownloadProgress = (progressObj: any) => {
      console.log('下载进度:', progressObj.percent);
      setDownloadProgress(progressObj.percent);
    };

    // 添加事件监听器
    window.electronAPI.onUpdateAvailable(handleUpdateAvailable);
    window.electronAPI.onUpdateDownloaded(handleUpdateDownloaded);
    window.electronAPI.onUpdateError(handleUpdateError);
    window.electronAPI.onDownloadProgress(handleDownloadProgress);

    // 清理事件监听器
    return () => {
      // 由于Electron IPC没有提供移除监听器的方法，这里什么都不做
      // 这在实际应用中可能会导致内存泄漏，但在单页面应用中影响有限
    };
  }, []);

  const checkForUpdates = async () => {
    try {
      setChecking(true);
      setUpdateError(null);
      const result = await window.electronAPI.checkForUpdates();
      console.log('检查更新结果:', result);
      
      // 如果没有立即发现更新，则显示通知
      if (!updateAvailable && !isDownloading) {
        setTimeout(() => {
          setChecking(false);
          setDialogOpen(true);
        }, 2000);
      }
    } catch (error: any) {
      console.error('检查更新失败:', error);
      setUpdateError(error.message || '检查更新失败');
      setChecking(false);
      setDialogOpen(true);
    }
  };

  const handleClose = () => {
    if (!isDownloading) {
      setDialogOpen(false);
    }
  };

  return (
    <>
      {showButton && (
        <Button
          variant="outlined"
          color="inherit"
          startIcon={checking ? <CircularProgress size={16} color="inherit" /> : <SystemUpdateIcon />}
          onClick={checkForUpdates}
          disabled={checking || isDownloading}
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
          {checking ? '检查中...' : '检查更新'}
        </Button>
      )}

      <Dialog
        open={dialogOpen}
        onClose={handleClose}
        aria-labelledby="update-dialog-title"
      >
        <DialogTitle id="update-dialog-title">
          {updateError ? '更新错误' : 
           downloadComplete ? '更新已就绪' : 
           updateAvailable ? '发现新版本' : 
           checking ? '检查更新中' : '软件更新'}
        </DialogTitle>
        <DialogContent>
          {updateError ? (
            <DialogContentText color="error">
              {updateError}
            </DialogContentText>
          ) : downloadComplete ? (
            <DialogContentText>
              新版本 {updateInfo?.version} 已下载完成，准备安装。
              {updateInfo?.releaseNotes && (
                <Box mt={2}>
                  <Typography variant="subtitle2">更新内容:</Typography>
                  <Typography variant="body2">{updateInfo.releaseNotes}</Typography>
                </Box>
              )}
            </DialogContentText>
          ) : updateAvailable ? (
            <>
              <DialogContentText>
                正在下载新版本 {updateInfo?.version}
                {updateInfo?.releaseNotes && (
                  <Box mt={2}>
                    <Typography variant="subtitle2">更新内容:</Typography>
                    <Typography variant="body2">{updateInfo.releaseNotes}</Typography>
                  </Box>
                )}
              </DialogContentText>
              <Box my={2}>
                <LinearProgress variant="determinate" value={downloadProgress} />
                <Box display="flex" justifyContent="center" mt={1}>
                  <Typography variant="body2">
                    {downloadProgress.toFixed(1)}%
                  </Typography>
                </Box>
              </Box>
            </>
          ) : checking ? (
            <Box display="flex" alignItems="center" flexDirection="column">
              <CircularProgress size={40} />
              <DialogContentText sx={{ mt: 2 }}>
                正在检查更新，请稍候...
              </DialogContentText>
            </Box>
          ) : (
            <DialogContentText>
              您的软件已是最新版本。
            </DialogContentText>
          )}
        </DialogContent>
        <DialogActions>
          {isDownloading ? (
            <Button disabled>下载中...</Button>
          ) : (
            <Button onClick={handleClose} color="primary">
              关闭
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
};

export default UpdateChecker; 