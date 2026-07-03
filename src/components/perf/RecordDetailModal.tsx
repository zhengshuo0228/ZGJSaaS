/**
 * RecordDetailModal — 绩效记录详情弹窗
 * 用于「我的绩效」和「全员记录」Tab中点击记录后显示完整信息
 */
import React from 'react';
import { Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { X } from 'lucide-react-native';
import { PerfRecord, STATUS_META, formatDateTime, getDisplayName } from './types';

interface Props {
  record: PerfRecord | null;
  onClose: () => void;
  imageZoom: (uri: string) => void;
}

export default function RecordDetailModal({ record, onClose, imageZoom }: Props) {
  const { height } = useWindowDimensions();
  if (!record) return null;

  const meta = STATUS_META[record.status] ?? STATUS_META.pending;
  const scoreNum = Number(record.score);
  const isAdd = scoreNum >= 0;
  const name = getDisplayName(record);
  const position = record.user?.position || '—';
  const reviewerName = record.operator?.display_name || '—';

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/40 justify-end" onPress={onClose}>
        <Pressable onPress={() => {}} style={{ maxHeight: height * 0.8 }}
          className="bg-background rounded-t-3xl overflow-hidden">
          {/* 头部 */}
          <View className="flex-row items-center justify-between px-5 pt-5 pb-3 border-b border-border">
            <Text className="text-base font-bold text-foreground">绩效记录详情</Text>
            <Pressable onPress={onClose} className="w-8 h-8 rounded-full bg-muted items-center justify-center">
              <X size={16} color="#6b7280" />
            </Pressable>
          </View>

          <ScrollView className="px-5 py-4" showsVerticalScrollIndicator={false}
            contentContainerStyle={{ gap: 12, paddingBottom: 24 }}>

            {/* 状态标签 */}
            <View className="flex-row">
              <View style={{ backgroundColor: meta.bg }} className="px-3 py-1 rounded-full">
                <Text style={{ color: meta.color }} className="text-sm font-semibold">{meta.label}</Text>
              </View>
            </View>

            <Row label="申请时间" value={formatDateTime(record.created_at)} />
            <Row label="申请人" value={`${name}  ${position}`} />

            {/* 申请事项 */}
            <View className="gap-1">
              <Text className="text-xs text-muted-foreground">申请事项</Text>
              <View className="flex-row items-start gap-2">
                <View style={{ backgroundColor: isAdd ? '#ecfdf5' : '#fef2f2' }}
                  className="px-2 py-0.5 rounded-md">
                  <Text style={{ color: isAdd ? '#008060' : '#D9381E' }}
                    className="text-xs font-semibold">{isAdd ? '加分' : '扣分'}</Text>
                </View>
                <Text className="text-sm text-foreground flex-1">{record.item_name || record.description}</Text>
              </View>
              {record.note ? (
                <Text className="text-xs text-muted-foreground pl-1">{record.note}</Text>
              ) : null}
            </View>

            {/* 分值 */}
            <View className="gap-1">
              <Text className="text-xs text-muted-foreground">申请分值</Text>
              <Text style={{ color: isAdd ? '#008060' : '#D9381E' }}
                className="text-xl font-bold">
                {isAdd ? `+${scoreNum}` : `${scoreNum}`} 分
              </Text>
            </View>

            {/* 证据图片 */}
            {record.image_url ? (
              <View className="gap-1">
                <Text className="text-xs text-muted-foreground">证据图片</Text>
                <Pressable onPress={() => record.image_url && imageZoom(record.image_url)}>
                  <Image source={{ uri: record.image_url }}
                    style={{ width: '100%', height: 180, borderRadius: 12 }}
                    contentFit="cover" />
                </Pressable>
              </View>
            ) : null}

            {record.status !== 'pending' ? (
              <>
                <View className="h-px bg-border" />
                <Row label="审核时间" value={formatDateTime(record.reviewed_at)} />
                <Row label="审核人" value={reviewerName} />
                {record.remark ? <Row label="审核备注" value={record.remark} multiline /> : null}
              </>
            ) : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Row({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <View className="gap-1">
      <Text className="text-xs text-muted-foreground">{label}</Text>
      <Text className="text-sm text-foreground" selectable>{value}</Text>
    </View>
  );
}
