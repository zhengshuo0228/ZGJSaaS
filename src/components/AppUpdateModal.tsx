import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { RefreshCw, Sparkles, X } from 'lucide-react-native';
import type { AppUpdateState } from '@/hooks/useAppUpdate';

interface Props {
  updateState: AppUpdateState;
}

export function AppUpdateModal({ updateState }: Props) {
  const { updateAvailable, downloading, readyToReload, error, applyUpdate, dismiss } = updateState;

  if (!updateAvailable) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28 }}>
        <View style={{
          backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%',
          boxShadow: [{ offsetX: 0, offsetY: 8, blurRadius: 32, color: 'rgba(0,0,0,0.18)' }],
        } as object}>

          {/* 关闭按钮（下载中禁用） */}
          {!downloading && !readyToReload && (
            <Pressable
              onPress={dismiss}
              style={{ position: 'absolute', top: 14, right: 14, width: 28, height: 28, borderRadius: 14, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={14} color="#9ca3af" />
            </Pressable>
          )}

          {/* 图标 + 标题 */}
          <View style={{ alignItems: 'center', marginBottom: 16, marginTop: 4 }}>
            <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: '#e8f7f1', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Sparkles size={28} color="#2E9D6A" />
            </View>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827', textAlign: 'center' }}>
              发现新版本
            </Text>
            <Text style={{ fontSize: 13, color: '#6b7280', marginTop: 6, textAlign: 'center', lineHeight: 20 }}>
              新版本已准备好，立即更新可获得{'\n'}最新功能与体验改进
            </Text>
          </View>

          {/* 错误提示 */}
          {error ? (
            <View style={{ backgroundColor: '#fff1f1', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12 }}>
              <Text style={{ fontSize: 12, color: '#E64340', textAlign: 'center' }}>{error}</Text>
            </View>
          ) : null}

          {/* 下载进度提示 */}
          {(downloading || readyToReload) && (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 14 }}>
              <ActivityIndicator size="small" color="#2E9D6A" />
              <Text style={{ fontSize: 13, color: '#2E9D6A', fontWeight: '500' }}>
                {readyToReload ? '即将重启...' : '正在下载更新...'}
              </Text>
            </View>
          )}

          {/* 立即更新按钮 */}
          <Pressable
            onPress={applyUpdate}
            disabled={downloading || readyToReload}
            className="active:opacity-80"
            style={{
              height: 48, borderRadius: 10,
              backgroundColor: (downloading || readyToReload) ? '#a7f3d0' : '#2E9D6A',
              alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8,
            }}
          >
            {downloading || readyToReload
              ? <ActivityIndicator size="small" color="#fff" />
              : <RefreshCw size={18} color="#fff" />
            }
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
              {downloading ? '下载中...' : readyToReload ? '即将重启...' : '立即更新'}
            </Text>
          </Pressable>

          {/* 稍后更新 */}
          {!downloading && !readyToReload && (
            <Pressable
              onPress={dismiss}
              style={{ height: 40, alignItems: 'center', justifyContent: 'center', marginTop: 8 }}
            >
              <Text style={{ fontSize: 14, color: '#9ca3af' }}>稍后再说</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}
