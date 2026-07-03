import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Clock, User, Package } from 'lucide-react-native';
import { getCategoryOrderItems } from '@/db/api';
import type { CategoryOrderItem } from '@/db/api';

export default function CategoryDetailScreen() {
  const router = useRouter();
  const { supplier, start, end } = useLocalSearchParams<{
    supplier: string;
    start?: string;
    end?: string;
  }>();

  const [items, setItems] = useState<CategoryOrderItem[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      if (!supplier) return;
      setLoading(true);
      getCategoryOrderItems(supplier, start, end).then((data) => {
        setItems(data);
        setLoading(false);
      });
    }, [supplier, start, end]),
  );

  /** 格式化时间：M/D HH:mm */
  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  // 按食材名称分组聚合（同一食材多次申购合并显示）
  const grouped = items.reduce<Record<string, CategoryOrderItem[]>>((acc, item) => {
    if (!acc[item.ingredient_name]) acc[item.ingredient_name] = [];
    acc[item.ingredient_name].push(item);
    return acc;
  }, {});

  const groupedList = Object.entries(grouped).map(([name, records]) => ({
    name,
    unit: records[0].unit,
    category: records[0].category,
    totalQty: records.reduce((s, r) => s + r.quantity, 0),
    records,
  }));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <StatusBar style="dark" />

      {/* 顶部导航栏 */}
      <View
        style={{
          backgroundColor: '#fff',
          flexDirection: 'row', alignItems: 'center', gap: 10,
          paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12,
          boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(0,0,0,0.06)' }],
        } as object}
      >
        <Pressable
          onPress={() => router.back()}
          className="active:opacity-70"
          style={{
            width: 36, height: 36, borderRadius: 18,
            backgroundColor: '#f1f5f9',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <ArrowLeft size={20} color="#374151" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }} numberOfLines={1}>
            {supplier}详情
          </Text>
          {(start || end) && (
            <Text style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>
              {start ? formatTime(start) : '—'} 至 {end ? formatTime(end) : '—'}
            </Text>
          )}
        </View>
        <View style={{ backgroundColor: '#f0fdf4', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
          <Text style={{ fontSize: 12, color: '#059669', fontWeight: '600' }}>
            {items.length} 条记录
          </Text>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#059669" />
        </View>
      ) : groupedList.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Package size={48} color="#d1d5db" />
          <Text style={{ color: '#9ca3af', fontSize: 14 }}>暂无申购记录</Text>
        </View>
      ) : (
        <FlatList
          data={groupedList}
          keyExtractor={(item) => item.name}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32, gap: 12 }}
          renderItem={({ item: group }) => (
            <View
              style={{
                backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden',
                boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(0,0,0,0.06)' }],
              } as object}
            >
              {/* 食材名称 + 汇总数量 */}
              <View
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  paddingHorizontal: 16, paddingVertical: 12,
                  backgroundColor: '#f9fafb', borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
                }}
              >
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#059669' }} />
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#111827', flex: 1 }}>
                  {group.name}
                </Text>
                {/* 合计数量徽章 */}
                <View style={{ backgroundColor: '#dcfce7', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#059669', fontVariant: ['tabular-nums'] }}>
                    合计 {group.totalQty} {group.unit}
                  </Text>
                </View>
              </View>

              {/* 每条申购记录 */}
              {group.records.map((record, idx) => (
                <View
                  key={record.item_id}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                    paddingHorizontal: 16, paddingVertical: 11,
                    borderBottomWidth: idx < group.records.length - 1 ? 1 : 0,
                    borderBottomColor: '#f1f5f9',
                  }}
                >
                  {/* 申购人 */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 72 }}>
                    <User size={13} color="#9ca3af" />
                    <Text
                      style={{ fontSize: 13, color: '#374151', fontWeight: '500' }}
                      numberOfLines={1}
                    >
                      {record.submitter_name}
                    </Text>
                  </View>

                  {/* 时间 */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, flex: 1 }}>
                    <Clock size={12} color="#9ca3af" />
                    <Text style={{ fontSize: 12, color: '#9ca3af' }}>
                      {formatTime(record.ordered_at)}
                    </Text>
                  </View>

                  {/* 数量 */}
                  <View
                    style={{
                      backgroundColor: '#f3f4f6', borderRadius: 20,
                      paddingHorizontal: 10, paddingVertical: 4,
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827', fontVariant: ['tabular-nums'] }}>
                      {record.quantity} <Text style={{ fontSize: 11, color: '#6b7280', fontWeight: '400' }}>{record.unit}</Text>
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
