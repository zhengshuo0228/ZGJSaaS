import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { ArrowLeft, FileText, ChevronDown, ChevronUp } from 'lucide-react-native';
import { supabase } from '@/client/supabase';

interface AppVersion {
  version: string;
  description: string;
  release_date: string;
  status: string;
}

export default function ChangelogScreen() {
  const router = useRouter();
  const [versions, setVersions] = useState<AppVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    supabase.functions.invoke('api-versions', { method: 'GET' }).then(({ data, error }) => {
      if (!error && data?.versions) {
        setVersions(data.versions as AppVersion[]);
      }
      setLoading(false);
    });
  }, []);

  const toggleExpand = (version: string) => {
    setExpandedMap((prev) => ({ ...prev, [version]: !prev[version] }));
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <StatusBar style="dark" />

      {/* 标题栏 */}
      <View className="flex-row items-center px-4 py-4 bg-card border-b border-border" style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(0,0,0,0.06)' }] } as object}>
        <Pressable
          onPress={() => router.back()}
          className="w-9 h-9 rounded-full bg-muted items-center justify-center mr-3"
        >
          <ArrowLeft size={18} color="#374151" />
        </Pressable>
        <Text className="text-xl font-bold text-foreground flex-1">更新日志</Text>
        <FileText size={20} color="#9ca3af" />
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#059669" />
        </View>
      ) : (
        <ScrollView contentInsetAdjustmentBehavior="automatic" className="flex-1">
          <View className="px-4 py-4 gap-4">
            {versions.map((entry, idx) => {
              const isExpanded = !!expandedMap[entry.version];
              return (
                <View
                  key={entry.version}
                  className="bg-card rounded-2xl p-4"
                  style={{ boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 4, color: 'rgba(0,0,0,0.07)' }], borderCurve: 'continuous' } as object}
                >
                  {/* 版本标题行 */}
                  <View className="flex-row items-center gap-2 mb-3">
                    <View className={`px-2.5 py-1 rounded-full ${idx === 0 ? 'bg-primary' : 'bg-muted'}`}>
                      <Text className={`text-xs font-bold ${idx === 0 ? 'text-white' : 'text-muted-foreground'}`}>{entry.version}</Text>
                    </View>
                    {idx === 0 && (
                      <View className="px-2 py-0.5 rounded-full bg-green-50">
                        <Text className="text-xs font-medium text-green-600">最新版本</Text>
                      </View>
                    )}
                    <Text className="text-xs text-muted-foreground ml-auto">
                    {(() => {
                      try {
                        const d = new Date(entry.release_date + 'T00:00:00');
                        const pad = (n: number) => String(n).padStart(2, '0');
                        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
                      } catch {
                        return entry.release_date;
                      }
                    })()}
                  </Text>
                  </View>

                  {/* 版本描述（支持换行，默认折叠3行） */}
                  <Text
                    className="text-sm text-foreground leading-5"
                    numberOfLines={isExpanded ? undefined : 3}
                  >
                    {entry.description}
                  </Text>

                  {/* 展开/收起按钮 */}
                  <Pressable
                    onPress={() => toggleExpand(entry.version)}
                    className="flex-row items-center justify-center mt-2 py-1.5"
                  >
                    {isExpanded ? (
                      <>
                        <Text className="text-xs text-primary mr-1">收起</Text>
                        <ChevronUp size={14} color="#2563eb" />
                      </>
                    ) : (
                      <>
                        <Text className="text-xs text-primary mr-1">展开</Text>
                        <ChevronDown size={14} color="#2563eb" />
                      </>
                    )}
                  </Pressable>
                </View>
              );
            })}

            <Text className="text-center text-xs text-muted-foreground py-4">
              感谢您使用灶管家 🎉
            </Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

