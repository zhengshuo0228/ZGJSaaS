/**
 * 菜品编辑页（新增 / 编辑）
 * 管理员 / 厨师长权限
 * 字段：菜品名称、分类、图片、食材清单、制作步骤、摆盘要求、备注
 */
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { ArrowLeft, Camera, ImageIcon, ChefHat, X, CheckCircle } from 'lucide-react-native';
import { supabase } from '@/client/supabase';
import { getDishWithSop, upsertDishAndSop, getDishCategories } from '@/db/sopApi';
import type { DishWithSop, DishCategory } from '@/types/types';

const BUCKET = 'dish-images';

// 图片压缩（使用 manipulateAsync）
async function compressImage(
  uri: string,
  mimeType?: string,
  width?: number,
): Promise<{ uri: string; format: SaveFormat }> {
  const isPng = mimeType === 'image/png';
  const format = isPng ? SaveFormat.PNG : SaveFormat.JPEG;
  const actions = (width && width > 1080) ? [{ resize: { width: 1080 } }] : [];
  const result = await manipulateAsync(uri, actions, {
    compress: isPng ? 1 : 0.8,
    format,
  });
  return { uri: result.uri, format };
}

// 上传到 Supabase Storage
async function uploadDishImage(
  localUri: string,
  mimeType?: string,
  width?: number,
  file?: File,
): Promise<string> {
  const isPng = mimeType === 'image/png';
  const ext = isPng ? 'png' : 'jpg';
  const mime = isPng ? 'image/png' : 'image/jpeg';
  const path = `images/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  let buffer: ArrayBuffer;

  if (process.env.EXPO_OS === 'web') {
    // Web 环境：优先使用 ImagePickerAsset 内的原始 File 对象，避免被拦截
    if (file) {
      buffer = await file.arrayBuffer();
    } else {
      const resp = await fetch(localUri);
      buffer = await resp.arrayBuffer();
    }
  } else {
    // Native 环境：先压缩再读 base64
    const { uri: cUri } = await compressImage(localUri, mimeType, width);
    const base64 = await FileSystem.readAsStringAsync(cUri, { encoding: FileSystem.EncodingType.Base64 });
    buffer = decode(base64);
  }

  const { data, error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: mime,
    upsert: false,
  });
  if (error) throw error;
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path);
  return urlData.publicUrl;
}

export default function SopEditScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const isEdit = !!id;

  // 表单状态
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [localImageUri, setLocalImageUri] = useState<string | null>(null);
  const [localImageAsset, setLocalImageAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [ingredients, setIngredients] = useState('');
  const [steps, setSteps] = useState('');
  const [plating, setPlating] = useState('');
  const [notes, setNotes] = useState('');
  const [dbCategories, setDbCategories] = useState<DishCategory[]>([]);
  // UI状态
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [permDenied, setPermDenied] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errMsg, setErrMsg] = useState('');

  // 加载现有数据（编辑模式）+ 加载分类列表
  const hasLoadedRef = useRef(false);
  useFocusEffect(useCallback(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    (async () => {
      const cats = await getDishCategories();
      setDbCategories(cats);

      if (!isEdit) {
        // 新增时默认选第一个分类
        if (cats.length > 0) setCategory(cats[0].name);
        return;
      }

      // 编辑模式：加载菜品数据
      setLoading(true);
      const data: DishWithSop | null = await getDishWithSop(id);
      if (data) {
        setName(data.name);
        setCategory(data.category);
        setImageUrl(data.image_url);
        setIngredients(data.sop?.ingredients ?? '');
        setSteps(data.sop?.steps ?? '');
        setPlating(data.sop?.plating ?? '');
        setNotes(data.sop?.notes ?? '');
      }
      setLoading(false);
    })();
  }, [id, isEdit]));

  const showMsg = (msg: string, isErr = false) => {
    if (isErr) setErrMsg(msg);
    else setSuccessMsg(msg);
    setTimeout(() => { setErrMsg(''); setSuccessMsg(''); }, 3000);
  };

  // 拍照
  const handleCamera = async () => {
    setShowImagePicker(false);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { setPermDenied(true); return; }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 1 });
    if (!result.canceled) {
      setLocalImageUri(result.assets[0].uri);
      setLocalImageAsset(result.assets[0]);
    }
  };

  // 相册选择
  const handleGallery = async () => {
    setShowImagePicker(false);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { setPermDenied(true); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 1,
    });
    if (!result.canceled) {
      setLocalImageUri(result.assets[0].uri);
      setLocalImageAsset(result.assets[0]);
    }
  };

  // 保存
  const handleSave = async () => {
    if (!name.trim()) { showMsg('请填写菜品名称', true); return; }
    if (!category) { showMsg('请选择菜品分类', true); return; }
    setSaving(true);
    setErrMsg('');
    try {
      let finalImageUrl = imageUrl;

      // 如有本地图片，先上传
      if (localImageUri && localImageAsset) {
        setUploading(true);
        try {
          finalImageUrl = await uploadDishImage(
            localImageUri,
            localImageAsset.mimeType ?? undefined,
            localImageAsset.width ?? undefined,
            (localImageAsset as ImagePicker.ImagePickerAsset & { file?: File }).file,
          );
        } catch {
          showMsg('图片上传失败，请重试', true);
          setUploading(false);
          setSaving(false);
          return;
        }
        setUploading(false);
      }

      const err = await upsertDishAndSop({
        dishId: id,
        name: name.trim(),
        category,
        imageUrl: finalImageUrl,
        ingredients: ingredients.trim(),
        steps: steps.trim(),
        plating: plating.trim(),
        notes: notes.trim(),
      });

      if (err) {
        showMsg(err, true);
      } else {
        showMsg(isEdit ? '保存成功' : '菜品已新增');
        setTimeout(() => router.back(), 1200);
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-background items-center justify-center" edges={['top']}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color="#FFB88C" />
      </SafeAreaView>
    );
  }

  const displayImageUri = localImageUri ?? imageUrl;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <StatusBar style="dark" />

      {/* 顶部导航 */}
      <View className="flex-row items-center px-4 py-3 gap-3">
        <Pressable
          className="w-9 h-9 rounded-xl bg-muted items-center justify-center active:opacity-60"
          onPress={() => router.back()}
        >
          <ArrowLeft size={20} color="#374151" />
        </Pressable>
        <Text className="flex-1 text-xl font-bold text-foreground">
          {isEdit ? '编辑菜品' : '新增菜品'}
        </Text>
      </View>

      <KeyboardAvoidingView
        behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="px-4 pb-10 gap-4"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* 状态反馈 */}
          {successMsg ? (
            <View className="flex-row items-center gap-2 p-3 bg-green-50 rounded-xl">
              <CheckCircle size={16} color="#16A34A" />
              <Text className="text-sm text-green-700 font-medium">{successMsg}</Text>
            </View>
          ) : null}
          {errMsg ? (
            <View className="p-3 bg-red-50 rounded-xl">
              <Text className="text-sm text-red-600">{errMsg}</Text>
            </View>
          ) : null}

          {/* 菜品图片 */}
          <View>
            <Text className="text-sm font-semibold text-foreground mb-2">菜品图片</Text>
            <Pressable
              className="w-full rounded-2xl overflow-hidden bg-muted items-center justify-center active:opacity-80"
              style={{ height: 180 }}
              onPress={() => setShowImagePicker(true)}
            >
              {displayImageUri ? (
                <>
                  <Image
                    source={{ uri: displayImageUri }}
                    style={{ width: '100%', height: 180 }}
                    contentFit="cover"
                  />
                  <View
                    className="absolute bottom-2 right-2 px-2.5 py-1 rounded-xl"
                    style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
                  >
                    <Text className="text-xs text-white font-medium">更换图片</Text>
                  </View>
                </>
              ) : (
                <View className="items-center gap-2">
                  <ChefHat size={36} color="#9CA3AF" />
                  <Text className="text-sm text-muted-foreground">点击上传菜品图片</Text>
                </View>
              )}
              {uploading && (
                <View
                  className="absolute inset-0 items-center justify-center"
                  style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
                >
                  <ActivityIndicator size="large" color="#fff" />
                  <Text className="text-white text-sm mt-2">上传中…</Text>
                </View>
              )}
            </Pressable>
            {permDenied && (
              <Text className="text-xs text-destructive mt-1">
                需要相机/相册权限，请在系统设置中开启
              </Text>
            )}
          </View>

          {/* 菜品名称 */}
          <View>
            <Text className="text-sm font-semibold text-foreground mb-2">菜品名称 *</Text>
            <TextInput
              className="border border-border rounded-2xl px-4 py-3.5 text-base text-foreground bg-muted/40"
              placeholder="请输入菜品名称"
              placeholderTextColor="#9CA3AF"
              value={name}
              onChangeText={(v) => { setName(v); setErrMsg(''); }}
            />
          </View>

          {/* 菜品分类 */}
          <View>
            <Text className="text-sm font-semibold text-foreground mb-2">菜品分类 *</Text>
            <View className="flex-row flex-wrap gap-2">
              {dbCategories.map((cat) => (
                <Pressable
                  key={cat.id}
                  className="px-4 py-2 rounded-full active:opacity-70"
                  style={{
                    backgroundColor: category === cat.name ? '#FFB88C' : '#F3F4F6',
                    borderWidth: 1.5,
                    borderColor: category === cat.name ? '#FFB88C' : 'transparent',
                  }}
                  onPress={() => setCategory(cat.name)}
                >
                  <Text
                    className="text-sm font-semibold"
                    style={{ color: category === cat.name ? '#1A1A2E' : '#6B7280' }}
                  >
                    {cat.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* 分割线 */}
          <View className="border-t border-border" />
          <Text className="text-base font-bold text-foreground -mt-1">SOP制作指南</Text>

          {/* 食材清单 */}
          <View>
            <Text className="text-sm font-semibold text-foreground mb-2">食材清单</Text>
            <TextInput
              className="border border-border rounded-2xl px-4 py-3.5 text-base text-foreground bg-muted/40"
              placeholder={`例如：\n五花肉 500g\n葱段 适量\n姜片 适量`}
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={5}
              textAlignVertical="top"
              value={ingredients}
              onChangeText={setIngredients}
              style={{ minHeight: 120 }}
            />
          </View>

          {/* 制作步骤 */}
          <View>
            <Text className="text-sm font-semibold text-foreground mb-2">制作步骤</Text>
            <TextInput
              className="border border-border rounded-2xl px-4 py-3.5 text-base text-foreground bg-muted/40"
              placeholder={`例如：\n1. 五花肉切块，冷水下锅焯水\n2. 热锅下油，放入冰糖炒糖色\n3. 放入肉块翻炒上色…`}
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={8}
              textAlignVertical="top"
              value={steps}
              onChangeText={setSteps}
              style={{ minHeight: 180 }}
            />
          </View>

          {/* 摆盘要求 */}
          <View>
            <Text className="text-sm font-semibold text-foreground mb-2">摆盘要求</Text>
            <TextInput
              className="border border-border rounded-2xl px-4 py-3.5 text-base text-foreground bg-muted/40"
              placeholder="例如：装入深圆盘，撒葱花点缀，旁边可放焯水西兰花…"
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              value={plating}
              onChangeText={setPlating}
              style={{ minHeight: 100 }}
            />
          </View>

          {/* 备注 */}
          <View>
            <Text className="text-sm font-semibold text-foreground mb-2">备注</Text>
            <TextInput
              className="border border-border rounded-2xl px-4 py-3.5 text-base text-foreground bg-muted/40"
              placeholder="其他注意事项或说明…"
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              value={notes}
              onChangeText={setNotes}
              style={{ minHeight: 80 }}
            />
          </View>

          {/* 保存按钮 */}
          <Pressable
            className="py-4 rounded-2xl items-center active:opacity-80"
            style={{ backgroundColor: saving ? '#FDD5B0' : '#FFB88C' }}
            disabled={saving}
            onPress={handleSave}
          >
            {saving ? (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator size="small" color="#1A1A2E" />
                <Text style={{ color: '#1A1A2E', fontWeight: '700', fontSize: 16 }}>
                  {uploading ? '图片上传中…' : '保存中…'}
                </Text>
              </View>
            ) : (
              <Text style={{ color: '#1A1A2E', fontWeight: '700', fontSize: 16 }}>
                {isEdit ? '保存修改' : '新增菜品'}
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* 图片选择弹窗 */}
      {showImagePicker && (
        <View className="absolute inset-0" style={{ zIndex: 100 }}>
          <Pressable
            className="flex-1 bg-black/40 justify-end"
            onPress={() => setShowImagePicker(false)}
          >
            <Pressable onPress={(e) => e.stopPropagation()}>
              <View className="bg-card rounded-t-3xl px-4 pt-4 pb-8 gap-3">
                <View className="flex-row items-center justify-between mb-1">
                  <Text className="text-base font-bold text-foreground">选择图片来源</Text>
                  <Pressable onPress={() => setShowImagePicker(false)} className="active:opacity-60">
                    <X size={20} color="#6B7280" />
                  </Pressable>
                </View>
                <Pressable
                  className="flex-row items-center gap-3 p-4 bg-muted rounded-2xl active:opacity-70"
                  onPress={handleCamera}
                >
                  <Camera size={22} color="#FFB88C" />
                  <Text className="text-base font-medium text-foreground">拍照</Text>
                </Pressable>
                <Pressable
                  className="flex-row items-center gap-3 p-4 bg-muted rounded-2xl active:opacity-70"
                  onPress={handleGallery}
                >
                  <ImageIcon size={22} color="#FFB88C" />
                  <Text className="text-base font-medium text-foreground">从相册选择</Text>
                </Pressable>
                <Pressable
                  className="py-3.5 rounded-2xl bg-muted items-center active:opacity-70"
                  onPress={() => setShowImagePicker(false)}
                >
                  <Text className="text-base font-medium text-muted-foreground">取消</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}
