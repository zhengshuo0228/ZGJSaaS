import { useEffect, useState } from 'react';
import * as Updates from 'expo-updates';

export interface AppUpdateState {
  /** 有可用更新 */
  updateAvailable: boolean;
  /** 正在下载 */
  downloading: boolean;
  /** 下载完成，等待重启 */
  readyToReload: boolean;
  /** 错误信息 */
  error: string | null;
  /** 触发下载并重启 */
  applyUpdate: () => Promise<void>;
  /** 关闭提示 */
  dismiss: () => void;
}

export function useAppUpdate(): AppUpdateState {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [readyToReload, setReadyToReload] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 开发环境 / Expo Go 中 checkForUpdateAsync 会报错，跳过
    if (__DEV__) return;
    checkForUpdate();
  }, []);

  const checkForUpdate = async () => {
    try {
      const result = await Updates.checkForUpdateAsync();
      if (result.isAvailable) {
        setUpdateAvailable(true);
      }
    } catch {
      // 网络不可用或非 EAS 构建时静默忽略
    }
  };

  const applyUpdate = async () => {
    setDownloading(true);
    setError(null);
    try {
      await Updates.fetchUpdateAsync();
      setReadyToReload(true);
      await Updates.reloadAsync();
    } catch {
      setError('下载失败，请检查网络后重试');
      setDownloading(false);
    }
  };

  const dismiss = () => {
    setUpdateAvailable(false);
    setError(null);
  };

  return { updateAvailable, downloading, readyToReload, error, applyUpdate, dismiss };
}
