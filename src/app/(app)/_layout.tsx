import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="home" />
      <Stack.Screen name="ingredients" />
      <Stack.Screen name="purchase-submit" />
      <Stack.Screen name="review" />
      <Stack.Screen name="purchase-summary" />
      <Stack.Screen name="history" />
      <Stack.Screen name="account-management" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="statistics" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="leaderboard-detail" />
      <Stack.Screen name="share-image-preview" />
      <Stack.Screen name="sop" />
      <Stack.Screen name="sop-detail" />
      <Stack.Screen name="sop-edit" />
      <Stack.Screen name="sop-history" />
      <Stack.Screen name="sop-import" />
      <Stack.Screen name="sop-categories" />
      <Stack.Screen name="watermark-camera" />
      <Stack.Screen name="watermark-album" />
      <Stack.Screen name="watermark-photo-detail" />
    </Stack>
  );
}
