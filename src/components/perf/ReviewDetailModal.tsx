/**
 * ReviewDetailModal — 待审核详情弹窗
 * 显示申请人信息、证据图片，底部固定审核操作区（分值调整+备注+通过/驳回）
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Minus, Plus, X } from 'lucide-react-native';
import { PerfRecord, PerfTemplate, formatDateTime, getDisplayName } from './types';
import RemarkSelector from './RemarkSelector';

interface Props {
  record: PerfRecord | null;
  canReview: boolean;
  remarkTpls: PerfTemplate[];
  onClose: () => void;
  onApprove: (id: string, score: number, remark: string) => Promise<void>;
  onReject: (id: string, remark: string) => Promise<void>;
  imageZoom: (uri: string) => void;
}

export default function ReviewDetailModal({ record, canReview, remarkTpls, onClose, onApprove, onReject, imageZoom }: Props) {
  const { height } = useWindowDimensions();
  const [score, setScore] = useState(1);
  const [remark, setRemark] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [rejectRemark, setRejectRemark] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  const presets = remarkTpls.length > 0
    ? remarkTpls.map(t => t.content)
    : ['很棒继续加油！', '继续保持', '再接再厉', '辛苦了', '表现优秀', '下次注意', '需改进', '确认属实', '情况属实', '注意安全'];

  useEffect(() => {
    if (record) { setScore(1); setRemark(''); setError(''); setShowRejectInput(false); setRejectRemark(''); }
  }, [record?.id]);

  if (!record) return null;

  const name = getDisplayName(record);
  const position = record.user?.position || '';

  const handleApprove = async () => {
    setError(''); setProcessing(true);
    try { await onApprove(record.id, score, remark); onClose(); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : '操作失败'); }
    finally { setProcessing(false); }
  };

  const handleReject = async () => {
    if (!rejectRemark.trim()) { setError('请填写驳回原因'); return; }
    setError(''); setProcessing(true);
    try { await onReject(record.id, rejectRemark); onClose(); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : '操作失败'); }
    finally { setProcessing(false); }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView className="flex-1" behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}>
        <Pressable className="flex-1 bg-black/40 justify-end" onPress={onClose}>
          <Pressable onPress={() => {}} style={{ maxHeight: height * 0.82 }}
            className="bg-background rounded-t-3xl overflow-hidden flex-col">

            {/* 头部 */}
            <View className="flex-row items-center justify-between px-5 pt-5 pb-3 border-b border-border">
              <Text className="text-base font-bold text-foreground">审核申请</Text>
              <Pressable onPress={onClose} className="w-8 h-8 rounded-full bg-muted items-center justify-center">
                <X size={16} color="#6b7280" />
              </Pressable>
            </View>

            {/* 内容区 */}
            <ScrollView className="px-5 py-4 flex-1" keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingBottom: 16 }}>
              {/* 申请人 */}
              <View className="flex-row items-center gap-2">
                <View className="w-10 h-10 rounded-full bg-primary items-center justify-center">
                  <Text className="text-white font-bold text-base">{name.charAt(0)}</Text>
                </View>
                <View>
                  <Text className="text-sm font-semibold text-foreground">{name}</Text>
                  {position ? <Text className="text-xs text-muted-foreground">{position}</Text> : null}
                </View>
              </View>

              {/* 申请时间 */}
              <View className="flex-row gap-4">
                <View className="gap-1">
                  <Text className="text-xs text-muted-foreground">申请时间</Text>
                  <Text className="text-sm text-foreground">{formatDateTime(record.created_at)}</Text>
                </View>
              </View>

              {/* 申请事项 */}
              <View className="gap-1">
                <Text className="text-xs text-muted-foreground">申请事项</Text>
                <Text className="text-sm font-semibold text-foreground">{record.item_name || record.description}</Text>
                {record.note ? <Text className="text-xs text-muted-foreground mt-0.5">{record.note}</Text> : null}
              </View>

              {/* 证据图片 */}
              {record.image_url ? (
                <View className="gap-1">
                  <Text className="text-xs text-muted-foreground">证据图片</Text>
                  <Pressable onPress={() => record.image_url && imageZoom(record.image_url)}>
                    <Image source={{ uri: record.image_url }}
                      style={{ width: '100%', height: 160, borderRadius: 12 }} contentFit="cover" />
                    <Text className="text-xs text-muted-foreground mt-1 text-center">点击查看大图</Text>
                  </Pressable>
                </View>
              ) : null}

              <View className="h-px bg-border" />

              {/* 审核区：分值调整 */}
              {canReview ? (
                <>
                  <View className="gap-2">
                    <Text className="text-sm font-medium text-foreground">设置分值</Text>
                    <View className="flex-row items-center gap-4">
                      <Pressable onPress={() => setScore(s => s - 1)}
                        className="w-10 h-10 rounded-full bg-muted items-center justify-center border border-border">
                        <Minus size={18} color="#374151" />
                      </Pressable>
                      <Text className="text-2xl font-bold text-foreground min-w-[48px] text-center"
                        style={{ color: score >= 0 ? '#008060' : '#D9381E' }}>
                        {score >= 0 ? `+${score}` : `${score}`}
                      </Text>
                      <Pressable onPress={() => setScore(s => s + 1)}
                        className="w-10 h-10 rounded-full bg-muted items-center justify-center border border-border">
                        <Plus size={18} color="#374151" />
                      </Pressable>
                    </View>
                  </View>

                  {/* 通过备注 */}
                  {!showRejectInput ? (
                    <RemarkSelector value={remark} onChange={setRemark} presets={presets} label="审核备注" placeholder="填写备注（可选）..." />
                  ) : null}

                  {/* 驳回原因输入框 */}
                  {showRejectInput ? (
                    <View className="gap-2">
                      <Text className="text-sm font-medium text-foreground">驳回原因 <Text className="text-destructive">*</Text></Text>
                      <TextInput value={rejectRemark} onChangeText={setRejectRemark} multiline numberOfLines={3}
                        placeholder="请填写驳回原因..." placeholderTextColor="#9ca3af"
                        className="border border-border rounded-xl px-3 py-2.5 text-sm text-foreground bg-card min-h-[72px]"
                        style={{ textAlignVertical: 'top' }} autoFocus />
                    </View>
                  ) : null}
                </>
              ) : (
                <View className="bg-muted rounded-xl p-4">
                  <Text className="text-sm text-muted-foreground text-center">您仅有查看权限，无法审核此申请</Text>
                </View>
              )}

              {error ? <Text className="text-destructive text-sm text-center">{error}</Text> : null}
            </ScrollView>

            {/* 底部按钮 */}
            {canReview ? (
              <View className="px-5 py-4 border-t border-border bg-background gap-3">
                {!showRejectInput ? (
                  <View className="flex-row gap-3">
                    <Pressable onPress={() => { setShowRejectInput(true); setError(''); }}
                      className="flex-1 py-3 rounded-xl border border-destructive items-center"
                      style={{ backgroundColor: '#fff5f5' }}>
                      <Text className="text-sm font-semibold text-destructive">驳回</Text>
                    </Pressable>
                    <Pressable onPress={handleApprove} disabled={processing}
                      className={`flex-1 py-3 rounded-xl bg-primary items-center ${processing ? 'opacity-60' : ''}`}>
                      {processing ? <ActivityIndicator size="small" color="white" />
                        : <Text className="text-sm font-semibold text-white">通过</Text>}
                    </Pressable>
                  </View>
                ) : (
                  <View className="flex-row gap-3">
                    <Pressable onPress={() => { setShowRejectInput(false); setRejectRemark(''); setError(''); }}
                      className="flex-1 py-3 rounded-xl bg-muted items-center">
                      <Text className="text-sm font-semibold text-foreground">返回</Text>
                    </Pressable>
                    <Pressable onPress={handleReject} disabled={processing}
                      className={`flex-1 py-3 rounded-xl items-center ${processing ? 'opacity-60' : ''}`}
                      style={{ backgroundColor: '#D9381E' }}>
                      {processing ? <ActivityIndicator size="small" color="white" />
                        : <Text className="text-sm font-semibold text-white">确认驳回</Text>}
                    </Pressable>
                  </View>
                )}
              </View>
            ) : (
              <View className="px-5 py-4 border-t border-border bg-background">
                <Pressable onPress={onClose} className="py-3 rounded-xl bg-muted items-center">
                  <Text className="text-sm font-semibold text-foreground">关闭</Text>
                </Pressable>
              </View>
            )}
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
