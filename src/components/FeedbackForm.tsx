import React, { useState } from 'react';
import { 
  Box, 
  TextField, 
  Button, 
  Typography, 
  Paper, 
  Snackbar, 
  Alert, 
  CircularProgress 
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';

interface FeedbackFormProps {
  onSubmit: (email: string, content: string) => Promise<{ success: boolean, message: string }>;
}

const FeedbackForm: React.FC<FeedbackFormProps> = ({ onSubmit }) => {
  const [email, setEmail] = useState('');
  const [content, setContent] = useState('');
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: 'success' | 'error';
  }>({
    open: false,
    message: '',
    severity: 'success'
  });
  const [loading, setLoading] = useState(false);

  const isValidEmail = (email: string) => {
    return !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 验证邮箱格式（如果提供了邮箱）
    if (!isValidEmail(email)) {
      setSnackbar({
        open: true,
        message: '请输入有效的邮箱地址',
        severity: 'error'
      });
      return;
    }

    // 验证内容不为空
    if (!content.trim()) {
      setSnackbar({
        open: true,
        message: '反馈内容不能为空',
        severity: 'error'
      });
      return;
    }

    setLoading(true);
    try {
      const result = await onSubmit(email, content);
      setSnackbar({
        open: true,
        message: result.message,
        severity: result.success ? 'success' : 'error'
      });

      if (result.success) {
        // 提交成功后清空表单
        setEmail('');
        setContent('');
      }
    } catch (error) {
      setSnackbar({
        open: true,
        message: '提交反馈时发生错误，请稍后再试',
        severity: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper elevation={3} sx={{ p: 3, my: 2 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        意见反馈
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        您的反馈对我们非常重要，帮助我们不断改进产品，加入钉钉群群号：132320001572
      </Typography>
      
      <Box component="form" onSubmit={handleSubmit} noValidate>
        <TextField
          margin="normal"
          fullWidth
          id="email"
          label="联系邮箱（选填）"
          name="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={!!email && !isValidEmail(email)}
          helperText={email && !isValidEmail(email) ? '请输入有效的邮箱地址' : ''}
          sx={{ mb: 2 }}
        />
        
        <TextField
          margin="normal"
          required
          fullWidth
          name="content"
          label="意见或建议"
          id="content"
          multiline
          rows={4}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          sx={{ mb: 2 }}
        />
        
        <Button
          type="submit"
          fullWidth
          variant="contained"
          disabled={loading}
          startIcon={loading ? <CircularProgress size={20} /> : <SendIcon />}
          sx={{ mt: 1 }}
        >
          {loading ? '提交中...' : '提交反馈'}
        </Button>
      </Box>
      
      <Snackbar 
        open={snackbar.open} 
        autoHideDuration={6000} 
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert 
          onClose={() => setSnackbar({ ...snackbar, open: false })} 
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Paper>
  );
};

export default FeedbackForm; 