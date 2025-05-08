document.addEventListener('DOMContentLoaded', function() {
    // 获取DOM元素
    const detectedOsElement = document.getElementById('detected-os');
    const recommendedDownloadButton = document.getElementById('recommended-download');
    
    // 定义下载链接
    const downloadLinks = {
        windows: 'https://mp-f71314a3-8e1f-4006-a851-35291a8ced09.cdn.bspapp.com/findme/win/x64/找我呀-1.0.0-win.exe',
        macIntel: 'https://mp-f71314a3-8e1f-4006-a851-35291a8ced09.cdn.bspapp.com/findme/mac/x64/找我呀-1.0.0-x64.dmg',
        macArm: 'https://mp-f71314a3-8e1f-4006-a851-35291a8ced09.cdn.bspapp.com/findme/mac/arm64/找我呀-1.0.0-arm64.dmg'
    };
    
    // 检测用户操作系统
    function detectOS() {
        const userAgent = window.navigator.userAgent;
        const platform = window.navigator.platform;
        const macosPlatforms = ['Macintosh', 'MacIntel', 'MacPPC', 'Mac68K'];
        const windowsPlatforms = ['Win32', 'Win64', 'Windows', 'WinCE'];
        
        let os = null;
        let arch = null;
        let osName = '';
        let downloadLink = '';
        
        // 检测操作系统类型
        if (macosPlatforms.indexOf(platform) !== -1) {
            os = 'mac';
            
            // 检测 Mac 是否为 Apple Silicon
            const isMacArm = /Mac/.test(platform) && /ARM/.test(userAgent);
            arch = isMacArm ? 'arm' : 'intel';
            
            if (arch === 'arm') {
                osName = 'macOS (Apple Silicon)';
                downloadLink = downloadLinks.macArm;
            } else {
                osName = 'macOS (Intel)';
                downloadLink = downloadLinks.macIntel;
            }
        } else if (windowsPlatforms.indexOf(platform) !== -1) {
            os = 'windows';
            osName = 'Windows';
            downloadLink = downloadLinks.windows;
        } else {
            os = 'other';
            osName = '未识别的操作系统';
            downloadLink = '#';
        }
        
        return {
            os: os,
            arch: arch,
            name: osName,
            link: downloadLink
        };
    }
    
    // 获取操作系统信息
    const osInfo = detectOS();
    
    // 更新UI
    detectedOsElement.textContent = osInfo.name;
    
    // 更新推荐下载按钮
    if (osInfo.os === 'other') {
        recommendedDownloadButton.textContent = '请选择一个下载版本';
        recommendedDownloadButton.classList.remove('highlight');
    } else {
        recommendedDownloadButton.textContent = `下载 ${osInfo.name} 版本`;
        recommendedDownloadButton.href = osInfo.link;
    }
    
    // 添加按钮点击事件
    recommendedDownloadButton.addEventListener('click', function(e) {
        if (osInfo.os === 'other') {
            e.preventDefault();
            alert('无法自动识别您的操作系统，请手动选择一个下载版本。');
        }
    });
}); 