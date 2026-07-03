/**
 * ApplyModal — 绩效申请弹窗
 * 选择事项（预设模板 or 手动输入）、填写说明、上传图片
 */
import React, { useState } from 'react';
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
import { Camera, ChevronDown, X, ImageIcon } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { fetch as expoFetch } from 'expo/fetch';
import { supabase } from '@/client/supabase';
import { PerfTemplate } from './types';

interface Props {
  visible: boolean;
  onClose: () => void;
  addItemTpls: PerfTemplate[];
  deductItemTpls: PerfTemplate[];
  onSubmit: (params: { description: string; note: string; image_url: string | null }) => Promise<void>;
}

export default function ApplyModal({ visible, onClose, addItemTpls, deductItemTpls, onSubmit }: Props) {
  const { height } = useWindowDimensions();
  const [type, setType] = useState<'add' | 'deduct'>('add');
  const [description, setDescription] = useState('');
  const [selectedTpl, setSelectedTpl] = useState<PerfTemplate | null>(null);
  const [customDesc, setCustomDesc] = useState('');
  const [note, setNote] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showPicker, setShowPicker] = useState(false);

  const templates = type === 'add' ? addItemTpls : deductItemTpls;
  const finalDesc = description === '__other__' ? customDesc : description;

  const reset = () => {
    setType('add'); setDescription(''); setSelectedTpl(null); setCustomDesc(''); setNote('');
    setImageUri(null); setError(''); setShowPicker(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const pickImage = async (fromCamera: boolean) => {
    setShowPicker(false);
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.8 });
    if (result.canceled) return;
    setImageUri(result.assets[0].uri);
  };

  const uploadImage = async (uri: string): Promise<string | null> => {
    try {
      setUploading(true);
      const compressed = await manipulateAsync(uri, [{ resize: { width: 1080 } }], { compress: 0.7, format: SaveFormat.JPEG });
      const response = await expoFetch(compressed.uri);
      const arrayBuffer = await response.arrayBuffer();
      // Supabase Storage in RN needs Uint8Array, not plain ArrayBuffer
      const buffer = new Uint8Array(arrayBuffer);
      const path = `apply/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
      const { data, error } = await supabase.storage.from('performance-images').upload(path, buffer, { contentType: 'image/jpeg' });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('performance-images').getPublicUrl(data.path);
      return urlData.publicUrl;
    } catch (err: unknown) {
      // eslint-disable-next-line no-console
      console.error('图片上传失败:', err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleSelectTemplate = (tpl: PerfTemplate) => {
    setDescription(tpl.content);
    setSelectedTpl(tpl);
  };

  const handleSelectOther = () => {
    setDescription('__other__');
    setSelectedTpl(null);
  };

  const handleTypeChange = (t: 'add' | 'deduct') => {
    setType(t);
    setDescription('');
    setSelectedTpl(null);
    setCustomDesc('');
  };

  const handleSubmit = async () => {
    if (!finalDesc.trim()) { setError('请选择或填写申请事项'); return; }
    setError(''); setSubmitting(true);
    let uploadedUrl: string | null = null;
    if (imageUri) {
      uploadedUrl = await uploadImage(imageUri);
      if (!uploadedUrl) { setError('图片上传失败，请重试'); setSubmitting(false); return; }
    }
    try {
      await onSubmit({ description: finalDesc.trim(), note: note.trim(), image_url: uploadedUrl });
      reset(); onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '提交失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView className="flex-1" behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}>
        <Pressable className="flex-1 bg-black/40 justify-end" onPress={handleClose}>
          <Pressable onPress={() => {}} style={{ maxHeight: height * 0.8 }} className="bg-background rounded-t-3xl overflow-hidden flex-col">

            {/* 头部 */}
            <View className="flex-row items-center justify-between px-5 pt-5 pb-3 border-b border-border">
              <Text className="text-base font-bold text-foreground">申请加分/扣分</Text>
              <Pressable onPress={handleClose} className="w-8 h-8 rounded-full bg-muted items-center justify-center">
                <X size={16} color="#6b7280" />
              </Pressable>
            </View>

            {/* 内容滚动区 */}
            <ScrollView className="px-5 py-4" keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 16, paddingBottom: 16 }}>

              {/* 加分/扣分切换 */}
              <View className="flex-row gap-2">
                {(['add', 'deduct'] as const).map((t) => (
                  <Pressable key={t} onPress={() => handleTypeChange(t)}
                    className={`flex-1 py-2.5 rounded-xl items-center border ${type === t ? 'bg-primary border-primary' : 'bg-card border-border'}`}>
                    <Text className={`text-sm font-semibold ${type === t ? 'text-white' : 'text-foreground'}`}>
                      {t === 'add' ? '加分申请' : '扣分申请'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* 选择事项 */}
              <View className="gap-2">
                <Text className="text-sm font-medium text-foreground">选择事项 <Text className="text-destructive">*</Text></Text>
                <View className="flex-row flex-wrap gap-2">
                  {templates.map((t) => (
                    <Pressable key={t.id} onPress={() => handleSelectTemplate(t)}
                      className={`px-3 py-2 rounded-xl border ${description === t.content ? 'bg-primary border-primary' : 'bg-card border-border'}`}>
                      <Text className={`text-sm ${description === t.content ? 'text-white font-semibold' : 'text-foreground'}`}>{t.content}</Text>
                    </Pressable>
                  ))}
                  <Pressable onPress={handleSelectOther}
                    className={`px-3 py-2 rounded-xl border ${description === '__other__' ? 'bg-primary border-primary' : 'bg-card border-border'}`}>
                    <Text className={`text-sm ${description === '__other__' ? 'text-white font-semibold' : 'text-foreground'}`}>其他</Text>
                  </Pressable>
                </View>
                {/* 事项说明 */}
                {selectedTpl?.description ? (
                  <Text className="text-xs text-muted-foreground mt-0.5 pl-0.5">{selectedTpl.description}</Text>
                ) : null}
                {description === '__other__' ? (
                  <TextInput value={customDesc} onChangeText={setCustomDesc}
                    placeholder="请手动输入事项..." placeholderTextColor="#9ca3af"
                    className="border border-border rounded-xl px-3 py-2.5 text-sm text-foreground bg-card" />
                ) : null}
              </View>

              {/* 填写说明 */}
              <View className="gap-2">
                <Text className="text-sm font-medium text-foreground">填写说明</Text>
                <TextInput value={note} onChangeText={setNote} multiline numberOfLines={3}
                  placeholder="补充说明（可选）..." placeholderTextColor="#9ca3af"
                  className="border border-border rounded-xl px-3 py-2.5 text-sm text-foreground bg-card min-h-[72px]"
                  style={{ textAlignVertical: 'top' }} />
              </View>

              {/* 上传图片 */}
              <View className="gap-2">
                <Text className="text-sm font-medium text-foreground">上传证据图片</Text>
                {imageUri ? (
                  <View className="relative">
                    <Image source={{ uri: imageUri }} style={{ width: '100%', height: 160, borderRadius: 12 }} contentFit="cover" />
                    <Pressable onPress={() => setImageUri(null)}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 items-center justify-center">
                      <X size={14} color="white" />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable onPress={() => setShowPicker(true)}
                    className="border-2 border-dashed border-border rounded-xl h-24 items-center justify-center gap-1 bg-card">
                    {uploading ? <ActivityIndicator size="small" color="#008060" /> : (
                      <>
                        <ImageIcon size={24} color="#9ca3af" />
                        <Text className="text-xs text-muted-foreground">点击选择图片</Text>
                      </>
                    )}
                  </Pressable>
                )}
              </View>

              {error ? <Text className="text-destructive text-sm text-center">{error}</Text> : null}
            </ScrollView>

            {/* 底部操作 */}
            <View className="flex-row gap-3 px-5 py-4 border-t border-border bg-background">
              <Pressable onPress={handleClose} className="flex-1 py-3 rounded-xl bg-muted items-center">
                <Text className="text-sm font-semibold text-foreground">取消</Text>
              </Pressable>
              <Pressable onPress={handleSubmit} disabled={submitting}
                className={`flex-1 py-3 rounded-xl bg-primary items-center ${submitting ? 'opacity-60' : ''}`}>
                {submitting ? <ActivityIndicator size="small" color="white" />
                  : <Text className="text-sm font-semibold text-white">提交申请</Text>}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>

      {/* 图片来源选择弹窗 */}
      <Modal visible={showPicker} transparent animationType="fade" onRequestClose={() => setShowPicker(false)}>
        <Pressable className="flex-1 bg-black/40 justify-end" onPress={() => setShowPicker(false)}>
          <View className="bg-background rounded-t-3xl px-5 pt-5 pb-8 gap-3">
            <Text className="text-base font-bold text-foreground text-center mb-1">选择图片来源</Text>
            <Pressable onPress={() => pickImage(true)} className="py-4 rounded-xl bg-card border border-border items-center">
              <Text className="text-sm font-semibold text-foreground">拍照</Text>
            </Pressable>
            <Pressable onPress={() => pickImage(false)} className="py-4 rounded-xl bg-card border border-border items-center">
              <Text className="text-sm font-semibold text-foreground">从相册选择</Text>
            </Pressable>
            <Pressable onPress={() => setShowPicker(false)} className="py-4 rounded-xl bg-muted items-center">
              <Text className="text-sm font-semibold text-muted-foreground">取消</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </Modal>
  );
}
