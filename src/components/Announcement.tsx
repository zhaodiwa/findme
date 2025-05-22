import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Typography, 
  Alert, 
  AlertTitle, 
  IconButton, 
  Collapse,
  Paper,
  Divider,
  Chip,
  CircularProgress
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import InfoIcon from '@mui/icons-material/Info';
import WarningIcon from '@mui/icons-material/Warning';
import NotificationsIcon from '@mui/icons-material/Notifications';

// 声明公告接口
export interface Announcement {
  _id: string;
  title: string;
  content: string;
  type: 'info' | 'warning' | 'error';
  targetPlatform: string;
  targetVersion?: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

interface AnnouncementProps {
  getAnnouncements: () => Promise<{
    success: boolean;
    data: Announcement[];
    message: string;
  }>;
}

const Announcement: React.FC<AnnouncementProps> = ({ getAnnouncements }) => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 获取公告 - 仅在组件加载时获取一次
  useEffect(() => {
    const fetchAnnouncements = async () => {
      try {
        setLoading(true);
        const result = await getAnnouncements();
        if (result.success && result.data) {
          setAnnouncements(result.data);
          
          // 初始化打开状态，高优先级公告默认打开
          const openState: Record<string, boolean> = {};
          result.data.forEach((announcement, index) => {
            // 第一个公告默认展开，其他公告根据优先级决定
            openState[announcement._id] = index === 0 || announcement.priority >= 8;
          });
          setOpen(openState);
          
          // 不再从localStorage加载已关闭的公告ID
          // 根据需求：公告关了本次就不管了，直到下一次重新加载打开软件
        } else {
          setError(result.message || '获取公告失败');
        }
      } catch (err) {
        console.error('获取公告出错:', err);
        setError('获取公告时出现错误');
      } finally {
        setLoading(false);
      }
    };

    // 只在组件挂载时获取一次公告
    fetchAnnouncements();
    
    // 移除30分钟自动刷新的定时器
    // 根据需求：软件使用过程中不会主动加载公告
  }, [getAnnouncements]);

  // 关闭公告 - 仅在当前会话中关闭，不存入localStorage
  const handleClose = (id: string) => {
    const newDismissed = { ...dismissed, [id]: true };
    setDismissed(newDismissed);
    
    // 移除localStorage存储逻辑
    // 根据需求：公告关了本次就不管了，直到下一次重新加载打开软件
  };

  // 切换展开/折叠状态
  const toggleOpen = (id: string) => {
    setOpen(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // 根据公告类型获取图标和颜色
  const getAnnouncementProps = (type: string) => {
    switch (type) {
      case 'warning':
        return { 
          icon: <WarningIcon />, 
          severity: 'warning' as const,
          color: '#ed6c02'
        };
      case 'error':
        return { 
          icon: <ErrorOutlineIcon />, 
          severity: 'error' as const,
          color: '#d32f2f'
        };
      case 'info':
      default:
        return { 
          icon: <InfoIcon />, 
          severity: 'info' as const,
          color: '#0288d1'
        };
    }
  };

  // 有效的公告（过滤掉已关闭的）
  const activeAnnouncements = announcements.filter(a => !dismissed[a._id]);

  if (loading) {
    return (
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center',
        py: 1
      }}>
        <CircularProgress size={20} sx={{ mr: 1 }} />
        <Typography variant="body2" color="text.secondary">
          加载公告中...
        </Typography>
      </Box>
    );
  }

  if (error) {
    console.error(error); // 只在控制台记录错误，不向用户展示
    return null; // 出错时不显示任何内容
  }

  if (activeAnnouncements.length === 0) {
    return null; // 没有公告时不显示任何内容
  }

  return (
    <Box sx={{ mb: 2 }}>
      {activeAnnouncements.map((announcement) => {
        const { icon, severity, color } = getAnnouncementProps(announcement.type);
        
        return (
          <Paper 
            key={announcement._id}
            elevation={1}
            sx={{ 
              mb: 1.5,
              overflow: 'hidden',
              border: `1px solid ${severity === 'info' ? 'rgba(0, 0, 0, 0.1)' : color}`
            }}
          >
            <Alert
              severity={severity}
              icon={icon}
              sx={{
                borderRadius: 0,
                py: 0.5,
                '& .MuiAlert-message': {
                  width: '100%'
                }
              }}
              action={
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Chip 
                    label={`有效期至: ${announcement.endDate}`}
                    size="small"
                    variant="outlined"
                    sx={{ 
                      mr: 1,
                      fontSize: '0.7rem',
                      height: 20,
                      display: { xs: 'none', sm: 'flex' }
                    }}
                  />
                  <IconButton
                    size="small"
                    onClick={() => handleClose(announcement._id)}
                    color="inherit"
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Box>
              }
            >
              <Box 
                sx={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  cursor: 'pointer'
                }}
                onClick={() => toggleOpen(announcement._id)}
              >
                <AlertTitle sx={{ mb: 0, fontWeight: 500 }}>
                  {announcement.title}
                </AlertTitle>
              </Box>
              
              <Collapse in={open[announcement._id]} timeout="auto">
                <Divider sx={{ my: 1 }} />
                <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
                  {announcement.content}
                </Typography>
              </Collapse>
            </Alert>
          </Paper>
        );
      })}
    </Box>
  );
};

export default Announcement; 