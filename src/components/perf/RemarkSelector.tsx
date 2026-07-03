/**
 * RemarkSelector — 备注预设选择器
 * 支持多选预设标签，选中后追加到备注文本，超出宽度自动换行
 */
import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

interface Props {
  value: string;
  onChange: (v: string) => void;
  presets: string[];
  placeholder?: string;
  label?: string;
}

export default function RemarkSelector({ value, onChange, presets, placeholder = '填写备注...', label }: Props) {
  const togglePreset = (p: string) => {
    if (value.includes(p)) {
      onChange(value.replace(p, '').replace(/[，,]\s*$/, '').replace(/^\s*[，,]/, '').trim());
    } else {
      onChange(value ? `${value}，${p}` : p);
    }
  };

  return (
    <View className="gap-2">
      {label ? <Text className="text-xs font-medium text-foreground/70">{label}</Text> : null}
      <View className="flex-row flex-wrap gap-1.5">
        {presets.map((p) => {
          const selected = value.includes(p);
          return (
            <Pressable
              key={p}
              onPress={() => togglePreset(p)}
              className={`px-2.5 py-1 rounded-full border ${selected ? 'bg-primary border-primary' : 'bg-card border-border'}`}
            >
              <Text className={`text-xs ${selected ? 'text-white font-medium' : 'text-foreground'}`}>{p}</Text>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        multiline
        numberOfLines={3}
        className="border border-border rounded-xl px-3 py-2.5 text-sm text-foreground bg-card min-h-[72px]"
        style={{ textAlignVertical: 'top' }}
      />
    </View>
  );
}
