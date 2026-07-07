import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { supabase } from '@/client/supabase';
import { isReservedSystemAccount, normalizeAccountInput, RESERVED_ACCOUNT_MESSAGE } from '@/lib/account';

type RegisterResult = {
  success?: boolean;
  error?: string;
  login_account?: string;
  tenant_id?: string;
};

export default function TenantRegister() {
  const router = useRouter();
  const [brandName, setBrandName] = useState('');
  const [storeName, setStoreName] = useState('');
  const [contactName, setContactName] = useState('');
  const [account, setAccount] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    if (!brandName.trim() || !storeName.trim() || !contactName.trim() || !account.trim() || !password.trim()) {
      setError('请填写品牌、门店、联系人、账号和密码');
      return;
    }
    if (password.length < 6) {
      setError('密码至少 6 位');
      return;
    }
    const accountValue = normalizeAccountInput(account);
    if (isReservedSystemAccount(accountValue)) {
      setError(RESERVED_ACCOUNT_MESSAGE);
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    const { data, error: invokeError } = await supabase.functions.invoke<RegisterResult>('tenant-register', {
      body: {
        brand_name: brandName.trim(),
        store_name: storeName.trim(),
        contact_name: contactName.trim(),
        account: accountValue,
        phone: phone.trim() || null,
        password,
      },
    });

    setLoading(false);
    if (invokeError || data?.error) {
      setError(data?.error || invokeError?.message || '品牌开通失败，请稍后重试');
      return;
    }

    setMessage(`品牌已开通，登录账号：${accountValue}`);
  };

  return (
    <KeyboardAvoidingView behavior="padding" className="flex-1 bg-[#F8FBF8]">
      <ScrollView contentContainerClassName="px-6 py-10" keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} className="mb-6 flex-row items-center gap-2">
          <ArrowLeft size={20} color="#17211B" />
          <Text style={{ color: '#17211B', fontWeight: '600' }}>返回登录</Text>
        </Pressable>

        <View className="mb-7">
          <Text className="text-3xl font-bold" style={{ color: '#17211B' }}>创建品牌</Text>
          <Text className="text-sm mt-2 leading-5" style={{ color: '#66756D' }}>
            开通后会自动创建品牌租户、默认门店和品牌管理员账号。
          </Text>
        </View>

        <View
          className="bg-white rounded-3xl p-6 gap-4"
          style={{ boxShadow: [{ offsetX: 0, offsetY: 8, blurRadius: 24, color: 'rgba(15,47,36,0.08)' }] } as object}
        >
          <Field label="品牌/公司名称" value={brandName} onChangeText={setBrandName} placeholder="例如：開小灶餐饮" />
          <Field label="初始门店名称" value={storeName} onChangeText={setStoreName} placeholder="例如：总店" />
          <Field label="联系人姓名" value={contactName} onChangeText={setContactName} placeholder="例如：张三" />
          <Field label="管理员账号" value={account} onChangeText={setAccount} placeholder="手机号 / 工号 / 英文账号" autoCapitalize="none" />
          <Field label="联系电话（选填）" value={phone} onChangeText={setPhone} placeholder="用于后续服务联系" keyboardType="phone-pad" />
          <Field label="管理员密码" value={password} onChangeText={setPassword} placeholder="至少 6 位" secureTextEntry />

          {error ? (
            <View className="rounded-xl px-4 py-2.5" style={{ backgroundColor: '#FEF2F2' }}>
              <Text className="text-sm text-center" style={{ color: '#DC2626' }}>{error}</Text>
            </View>
          ) : null}

          {message ? (
            <View className="rounded-xl px-4 py-2.5" style={{ backgroundColor: '#ECFDF5' }}>
              <Text className="text-sm text-center" style={{ color: '#047857' }}>{message}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={submit}
            disabled={loading}
            className="rounded-2xl mt-2 active:opacity-80"
            style={{
              height: 52,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#F97316',
            }}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 17 }}>立即开通</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'phone-pad';
}) {
  return (
    <View>
      <Text className="text-sm font-semibold mb-2" style={{ color: '#17211B' }}>{props.label}</Text>
      <TextInput
        className="rounded-2xl px-4 py-3.5 text-base"
        style={{ color: '#17211B', backgroundColor: '#F3FAF6', borderWidth: 1, borderColor: '#DDEBE4' }}
        placeholder={props.placeholder}
        placeholderTextColor="#94A39B"
        value={props.value}
        onChangeText={props.onChangeText}
        secureTextEntry={props.secureTextEntry}
        autoCapitalize={props.autoCapitalize}
        keyboardType={props.keyboardType}
      />
    </View>
  );
}
