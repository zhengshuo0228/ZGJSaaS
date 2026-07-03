/**
 * Excel批量导入菜品 + SOP
 * 仅管理员/厨师长（sop_manage权限）可访问
 * 流程：选文件 → 解析预览 → 数据校验 → 批量导入 → 结果展示
 * 分类校验从 dish_categories 表动态读取
 */
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { read as xlsxRead, utils as xlsxUtils } from 'xlsx';
import { decode } from 'base64-arraybuffer';
import {
  ArrowLeft,
  FileSpreadsheet,
  Upload,
  CheckCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react-native';
import { batchImportDishes, getDishCategories } from '@/db/sopApi';

interface ParsedRow {
  name: string;
  category: string;
  ingredients?: string;
  steps?: string;
  plating?: string;
  notes?: string;
}

interface ValidationError {
  row: number;
  reason: string;
}

function validateRows(rows: ParsedRow[], validCategories: string[]): ValidationError[] {
  const errors: ValidationError[] = [];
  rows.forEach((r, i) => {
    const rowNum = i + 2; // Excel行号（第1行为表头）
    if (!r.name?.trim()) {
      errors.push({ row: rowNum, reason: '菜品名称不能为空' });
    }
    if (!r.category?.trim()) {
      errors.push({ row: rowNum, reason: '菜品分类不能为空' });
    } else if (validCategories.length > 0 && !validCategories.includes(r.category.trim())) {
      errors.push({
        row: rowNum,
        reason: `分类"${r.category}"不在已有分类中（${validCategories.join('/')}）`,
      });
    }
  });
  return errors;
}

export default function SopImportScreen() {
  const router = useRouter();
  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [validCategories, setValidCategories] = useState<string[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    success: number;
    failed: { row: number; reason: string }[];
  } | null>(null);
  const [errMsg, setErrMsg] = useState('');
  const [showPreview, setShowPreview] = useState(true);

  // 加载数据库分类列表
  useEffect(() => {
    (async () => {
      const cats = await getDishCategories();
      setValidCategories(cats.map((c) => c.name));
    })();
  }, []);

  const handlePickFile = async () => {
    setErrMsg('');
    setImportResult(null);
    setParsedRows([]);
    setValidationErrors([]);

    const result = await DocumentPicker.getDocumentAsync({
      type: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'application/octet-stream',
      ],
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setFileName(asset.name);
    setParsing(true);

    try {
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const buffer = decode(base64);
      const workbook = xlsxRead(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rawData = xlsxUtils.sheet_to_json<Record<string, string>>(sheet, { defval: '' });

      // 字段映射（支持中英文列名）
      const rows: ParsedRow[] = rawData.map((row) => ({
        name: String(row['菜品名称'] ?? row['name'] ?? row['名称'] ?? '').trim(),
        category: String(row['菜品分类'] ?? row['category'] ?? row['分类'] ?? '').trim(),
        ingredients: String(row['食材清单'] ?? row['ingredients'] ?? '').trim() || undefined,
        steps: String(row['制作步骤'] ?? row['steps'] ?? '').trim() || undefined,
        plating: String(row['摆盘要求'] ?? row['plating'] ?? '').trim() || undefined,
        notes: String(row['备注'] ?? row['notes'] ?? '').trim() || undefined,
      }));

      if (rows.length === 0) {
        setErrMsg('Excel文件为空或格式不正确，请检查文件内容');
        setParsing(false);
        return;
      }

      setParsedRows(rows);
      setValidationErrors(validateRows(rows, validCategories));
    } catch {
      setErrMsg('文件解析失败，请确保上传的是有效的Excel文件（.xlsx/.xls）');
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (parsedRows.length === 0) return;
    const validRows = parsedRows.filter((_, i) => {
      const rowNum = i + 2;
      return !validationErrors.some((e) => e.row === rowNum);
    });
    if (validRows.length === 0) {
      setErrMsg('所有行均存在错误，请修正后重新上传');
      return;
    }
    setImporting(true);
    setErrMsg('');
    const result = await batchImportDishes(validRows);
    setImportResult(result);
    setImporting(false);
  };

  const validCount = parsedRows.length - validationErrors.filter(
    (e, i, arr) => arr.findIndex((a) => a.row === e.row) === i
  ).length;

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
        <View className="flex-1 flex-row items-center gap-2">
          <FileSpreadsheet size={20} color="#FFB88C" />
          <Text className="text-xl font-bold text-foreground">Excel批量导入</Text>
        </View>
      </View>

      <ScrollView
        contentContainerClassName="px-4 pb-10 gap-4"
        showsVerticalScrollIndicator={false}
      >
        {/* Excel格式说明 */}
        <View
          className="bg-card rounded-2xl p-4"
          style={{ boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(0,0,0,0.06)' }] } as object}
        >
          <Text className="text-sm font-bold text-foreground mb-2">📋 Excel格式要求</Text>
          <Text className="text-xs text-muted-foreground leading-5">
            第一行为表头，支持以下列名（中文优先）：{'\n'}
            • <Text className="font-semibold text-foreground">菜品名称</Text>（必填）{'\n'}
            • <Text className="font-semibold text-foreground">菜品分类</Text>（必填，须为：热菜/凉菜/汤品/主食/点心/饮品/其它）{'\n'}
            • 食材清单（选填）{'\n'}
            • 制作步骤（选填）{'\n'}
            • 摆盘要求（选填）{'\n'}
            • 备注（选填）
          </Text>
        </View>

        {/* 选择文件 */}
        <Pressable
          className="bg-card rounded-2xl p-5 items-center gap-3 border-2 border-dashed active:opacity-80"
          style={{ borderColor: '#FFB88C' }}
          onPress={handlePickFile}
          disabled={parsing || importing}
        >
          {parsing ? (
            <ActivityIndicator size="large" color="#FFB88C" />
          ) : (
            <View className="w-14 h-14 rounded-2xl items-center justify-center" style={{ backgroundColor: '#FFF3E0' }}>
              <FileSpreadsheet size={28} color="#FFB88C" />
            </View>
          )}
          <View className="items-center gap-1">
            <Text className="text-base font-bold text-foreground">
              {parsing ? '解析中…' : fileName ? '重新选择文件' : '点击选择Excel文件'}
            </Text>
            {fileName ? (
              <Text className="text-sm text-muted-foreground" numberOfLines={1}>{fileName}</Text>
            ) : (
              <Text className="text-xs text-muted-foreground">支持 .xlsx / .xls 格式</Text>
            )}
          </View>
        </Pressable>

        {/* 错误提示 */}
        {errMsg ? (
          <View className="flex-row items-start gap-2 p-3 bg-red-50 rounded-xl">
            <AlertCircle size={16} color="#EF4444" />
            <Text className="flex-1 text-sm text-red-600">{errMsg}</Text>
          </View>
        ) : null}

        {/* 数据预览 */}
        {parsedRows.length > 0 && (
          <View
            className="bg-card rounded-2xl overflow-hidden"
            style={{ boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(0,0,0,0.06)' }] } as object}
          >
            <Pressable
              className="flex-row items-center justify-between px-4 py-3.5 active:opacity-70"
              onPress={() => setShowPreview((v) => !v)}
            >
              <View className="flex-row items-center gap-2">
                <Text className="text-sm font-bold text-foreground">数据预览</Text>
                <View className="px-2 py-0.5 rounded-full bg-muted">
                  <Text className="text-xs text-muted-foreground">{parsedRows.length} 行</Text>
                </View>
                {validationErrors.length > 0 && (
                  <View className="px-2 py-0.5 rounded-full bg-red-100">
                    <Text style={{ color: '#EF4444', fontSize: 11, fontWeight: '600' }}>
                      {validationErrors.length} 处错误
                    </Text>
                  </View>
                )}
              </View>
              {showPreview ? <ChevronUp size={18} color="#9CA3AF" /> : <ChevronDown size={18} color="#9CA3AF" />}
            </Pressable>

            {showPreview && (
              <View className="border-t border-border">
                {/* 表头 */}
                <View className="flex-row bg-muted/50 px-3 py-2 gap-1">
                  <Text className="w-8 text-xs font-bold text-muted-foreground">#</Text>
                  <Text className="flex-1 text-xs font-bold text-muted-foreground">菜品名称</Text>
                  <Text style={{ width: 52 }} className="text-xs font-bold text-muted-foreground">分类</Text>
                  <Text className="w-14 text-xs font-bold text-muted-foreground">状态</Text>
                </View>

                {parsedRows.slice(0, 20).map((row, i) => {
                  const rowNum = i + 2;
                  const rowErrors = validationErrors.filter((e) => e.row === rowNum);
                  const hasError = rowErrors.length > 0;
                  return (
                    <View key={i}>
                      <View
                        className="flex-row px-3 py-2.5 gap-1 items-center border-t border-border"
                        style={{ backgroundColor: hasError ? '#FFF1F2' : 'transparent' }}
                      >
                        <Text className="w-8 text-xs text-muted-foreground">{rowNum}</Text>
                        <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
                          {row.name || <Text className="text-muted-foreground italic">（空）</Text>}
                        </Text>
                        <Text style={{ width: 52 }} className="text-xs text-muted-foreground" numberOfLines={1}>
                          {row.category || '—'}
                        </Text>
                        <View className="w-14 items-center">
                          {hasError ? (
                            <AlertCircle size={14} color="#EF4444" />
                          ) : (
                            <CheckCircle size={14} color="#16A34A" />
                          )}
                        </View>
                      </View>
                      {hasError && rowErrors.map((e, j) => (
                        <View key={j} className="px-3 pb-2 bg-red-50">
                          <Text className="text-xs text-red-500">第{e.row}行：{e.reason}</Text>
                        </View>
                      ))}
                    </View>
                  );
                })}

                {parsedRows.length > 20 && (
                  <View className="px-3 py-2.5 border-t border-border">
                    <Text className="text-xs text-muted-foreground text-center">
                      …还有 {parsedRows.length - 20} 行（将全部导入）
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* 校验错误汇总 */}
        {validationErrors.length > 0 && (
          <View className="p-4 bg-red-50 rounded-2xl gap-2">
            <View className="flex-row items-center gap-2">
              <AlertCircle size={16} color="#EF4444" />
              <Text className="text-sm font-bold text-red-700">
                发现 {validationErrors.length} 处数据错误（错误行将跳过，{validCount} 行将正常导入）
              </Text>
            </View>
            {validationErrors.slice(0, 5).map((e, i) => (
              <Text key={i} className="text-xs text-red-600 pl-6">
                第{e.row}行：{e.reason}
              </Text>
            ))}
            {validationErrors.length > 5 && (
              <Text className="text-xs text-red-500 pl-6">…共 {validationErrors.length} 处错误</Text>
            )}
          </View>
        )}

        {/* 导入结果 */}
        {importResult && (
          <View
            className="bg-card rounded-2xl p-4 gap-3"
            style={{ boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(0,0,0,0.06)' }] } as object}
          >
            <Text className="text-base font-bold text-foreground">导入结果</Text>
            <View className="flex-row gap-3">
              <View className="flex-1 bg-green-50 rounded-xl p-3 items-center gap-1">
                <CheckCircle size={24} color="#16A34A" />
                <Text className="text-xl font-bold" style={{ color: '#16A34A' }}>
                  {importResult.success}
                </Text>
                <Text className="text-xs text-muted-foreground">成功</Text>
              </View>
              <View className="flex-1 bg-red-50 rounded-xl p-3 items-center gap-1">
                <AlertCircle size={24} color="#EF4444" />
                <Text className="text-xl font-bold text-red-500">{importResult.failed.length}</Text>
                <Text className="text-xs text-muted-foreground">失败</Text>
              </View>
            </View>
            {importResult.failed.length > 0 && (
              <View className="gap-1">
                <Text className="text-xs font-bold text-red-700 mb-1">失败原因：</Text>
                {importResult.failed.map((f, i) => (
                  <Text key={i} className="text-xs text-red-600">
                    第{f.row}行：{f.reason}
                  </Text>
                ))}
              </View>
            )}
            {importResult.success > 0 && (
              <Pressable
                className="py-3 rounded-xl bg-muted items-center active:opacity-70"
                onPress={() => router.back()}
              >
                <Text className="text-sm font-semibold text-foreground">返回菜品库</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* 导入按钮 */}
        {parsedRows.length > 0 && !importResult && (
          <Pressable
            className="py-4 rounded-2xl items-center active:opacity-80"
            style={{ backgroundColor: importing ? '#FDD5B0' : '#FFB88C' }}
            disabled={importing || parsing}
            onPress={handleImport}
          >
            {importing ? (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator size="small" color="#1A1A2E" />
                <Text style={{ color: '#1A1A2E', fontWeight: '700', fontSize: 16 }}>导入中…</Text>
              </View>
            ) : (
              <View className="flex-row items-center gap-2">
                <Upload size={18} color="#1A1A2E" />
                <Text style={{ color: '#1A1A2E', fontWeight: '700', fontSize: 16 }}>
                  开始导入（{validCount} 条有效数据）
                </Text>
              </View>
            )}
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
