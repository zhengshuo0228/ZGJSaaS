import { Redirect } from 'expo-router';
import { useSession } from '@/ctx';
import { ActivityIndicator, View } from 'react-native';

export default function Index() {
  const { session, isLoading, isGuestMode } = useSession();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' }}>
        <ActivityIndicator size="large" color="#059669" />
      </View>
    );
  }

  if (session || isGuestMode) {
    return <Redirect href="/(app)/home" />;
  }

  return <Redirect href="/(auth)/sign-in" />;
}
