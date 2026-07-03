/**
 * 我的团队页面 v5 — 发布者岗位展示 + 批量删除（含 Storage 清理）
 */
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  ArrowLeft,
  CheckCircle2,
  CornerDownRight,
  Download,
  Heart,
  MessageCircle,
  Play,
  Search,
  Send,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { supabase } from '@/client/supabase';

// ─── 类型 ─────────────────────────────────────────────────────────────────────
interface PostMedia {
  id: string;
  photo_url: string;
  photo_path: string;   // Storage 路径，用于批量删除文件
  media_type: 'image' | 'video';
  sort_order: number;
}

interface PostItem {
  id: string;
  remark: string | null;
  taken_at: string;
  user_id: string;
  uploader_name: string;
  uploader_position: string | null;   // 岗位信息
  uploader_avatar?: string | null;
  media: PostMedia[];
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
}

interface CommentItem {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  commenter_name: string;
  parent_id: string | null;
  reply_to_name: string | null;
}

interface UploaderOption { user_id: string; display_name: string; }

// ─── 工具 ─────────────────────────────────────────────────────────────────────
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return '刚刚';
  if (m < 60) return `${m}分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}小时前`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}天前`;
  const dt = new Date(iso);
  const p = (n: number) => n < 10 ? `0${n}` : `${n}`;
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}
function getInitial(name: string) { return (name || '?')[0].toUpperCase(); }
const AVATAR_COLORS = ['#FFA07A', '#AC88FF', '#22D9AE', '#67D6CA', '#E6A1FF', '#DDADD1'];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
}

const PAGE_SIZE = 15;

// ─── 九宫格媒体组件 ────────────────────────────────────────────────────────────
function MediaGrid({ media, onPress }: { media: PostMedia[]; onPress: (m: PostMedia) => void }) {
  const { width } = useWindowDimensions();
  const contentW = width - 16 - 42 - 12 - 16; // paddingH - avatar - gap - right pad

  const count = Math.min(media.length, 9);
  const displayed = media.slice(0, count);
  const extra = media.length - 9;

  if (count === 0) return null;

  // 单张：大图
  if (count === 1) {
    const m = displayed[0];
    const size = Math.min(contentW, 200);
    return (
      <Pressable onPress={() => onPress(m)} style={{ width: size, height: size, borderRadius: 8, overflow: 'hidden', marginBottom: 8 }} className="active:opacity-90">
        <Image source={{ uri: m.photo_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        {m.media_type === 'video' && (
          <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)' }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.9)', alignItems: 'center', justifyContent: 'center' }}>
              <Play size={16} color="#1F2937" fill="#1F2937" />
            </View>
          </View>
        )}
      </Pressable>
    );
  }

  // 2张：2列
  if (count === 2) {
    const cellSize = (contentW - 4) / 2;
    return (
      <View style={{ flexDirection: 'row', gap: 4, marginBottom: 8 }}>
        {displayed.map(m => (
          <Pressable key={m.id} onPress={() => onPress(m)} style={{ width: cellSize, height: cellSize, borderRadius: 6, overflow: 'hidden' }} className="active:opacity-90">
            <Image source={{ uri: m.photo_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
            {m.media_type === 'video' && (
              <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)' }}>
                <Play size={14} color="#fff" fill="#fff" />
              </View>
            )}
          </Pressable>
        ))}
      </View>
    );
  }

  // 3-9张：3列网格
  const cols = 3;
  const cellSize = (contentW - 4 * (cols - 1)) / cols;
  const rows: PostMedia[][] = [];
  for (let i = 0; i < displayed.length; i += cols) rows.push(displayed.slice(i, i + cols));

  return (
    <View style={{ gap: 4, marginBottom: 8 }}>
      {rows.map((row, ri) => (
        <View key={ri} style={{ flexDirection: 'row', gap: 4 }}>
          {row.map((m, ci) => {
            const isLast = ri === rows.length - 1 && ci === row.length - 1 && extra > 0;
            return (
              <Pressable key={m.id} onPress={() => onPress(m)} style={{ width: cellSize, height: cellSize, borderRadius: 6, overflow: 'hidden' }} className="active:opacity-90">
                <Image source={{ uri: m.photo_url }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                {m.media_type === 'video' && !isLast && (
                  <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)' }}>
                    <Play size={12} color="#fff" fill="#fff" />
                  </View>
                )}
                {isLast && (
                  <View style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>+{extra}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
          {/* 补齐最后一行空格 */}
          {row.length < cols && Array.from({ length: cols - row.length }).map((_, i) => (
            <View key={`empty-${i}`} style={{ width: cellSize, height: cellSize }} />
          ))}
        </View>
      ))}
    </View>
  );
}

// ─── 主页面 ───────────────────────────────────────────────────────────────────
export default function WatermarkAlbumScreen() {
  const router = useRouter();

  const [items, setItems]           = useState<PostItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore]       = useState(true);
  const [page, setPage]             = useState(0);

  const [search, setSearch]               = useState('');
  const [uploaders, setUploaders]         = useState<UploaderOption[]>([]);
  const [selectedUploader, setSelectedUploader] = useState<string | null>(null);
  const [showFilter, setShowFilter]       = useState(false);

  const [myUserId, setMyUserId]     = useState<string | null>(null);

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<PostItem | null>(null);
  const [deleting, setDeleting]         = useState(false);
  const [deleteErrMsg, setDeleteErrMsg] = useState('');
  // 用于关闭 Swipeable
  const swipeableRefs = useRef<Map<string, Swipeable | null>>(new Map());

  // 多选
  const [multiMode, setMultiMode]   = useState(false);
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [batchProgress, setBatchProgress] = useState('');

  // 评论
  const [commentPostId, setCommentPostId] = useState<string | null>(null);
  const [comments, setComments]           = useState<CommentItem[]>([]);
  const [commentText, setCommentText]     = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [postingComment, setPostingComment]   = useState(false);
  const [replyTo, setReplyTo]             = useState<{ id: string; name: string } | null>(null);
  const commentInputRef = useRef<TextInput>(null);

  const fetchMe = async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) setMyUserId(data.user.id);
    return data.user?.id ?? null;
  };

  const fetchUploaders = async () => {
    // 两步查询避免 PostgREST profiles 关联静默失败
    const { data: postsData } = await supabase
      .from('watermark_posts')
      .select('user_id')
      .not('user_id', 'is', null);
    if (!postsData) return;
    const userIds = [...new Set((postsData as { user_id: string }[]).map(r => r.user_id).filter(Boolean))];
    if (userIds.length === 0) return;
    const { data: profData } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', userIds);
    if (profData) {
      setUploaders((profData as { id: string; display_name: string }[]).map(p => ({
        user_id: p.id,
        display_name: p.display_name || '用户',
      })));
    }
  };

  const fetchItems = useCallback(async (pageNum: number, refresh = false, overrideUid?: string | null) => {
    if (refresh) setRefreshing(true); else setLoading(pageNum === 0);
    const from = pageNum * PAGE_SIZE;
    const to   = from + PAGE_SIZE - 1;
    // 优先用传入的 uid，其次用 state（防止 state 异步滞后）
    const uid = overrideUid !== undefined ? overrideUid : myUserId;

    try {
      // Step1：查帖子主体（watermark_likes 通过 post_id FK、watermark_comments 通过新增 post_id FK 关联）
      let query = supabase
        .from('watermark_posts')
        .select(`
          id, remark, taken_at, user_id,
          watermark_post_media(id, photo_url, photo_path, media_type, sort_order),
          watermark_likes!watermark_likes_post_id_fkey(user_id),
          watermark_comments!watermark_comments_post_id_fkey(id)
        `)
        .order('taken_at', { ascending: false })
        .range(from, to);
      if (selectedUploader) query = query.eq('user_id', selectedUploader);
      if (search.trim()) query = query.ilike('remark', `%${search.trim()}%`);

      const { data, error } = await query;
      if (error) throw error;

      const rows = data || [];

      // Step2：批量查 profiles（独立查询，避免关联失败），取 display_name + position
      const userIds = [...new Set(rows.map((r: Record<string, unknown>) => r.user_id as string).filter(Boolean))];
      const profileMap = new Map<string, { display_name: string; position: string | null }>();
      if (userIds.length > 0) {
        const { data: pData } = await supabase
          .from('profiles')
          .select('id, display_name, position')
          .in('id', userIds);
        (pData || []).forEach((p: Record<string, unknown>) => {
          profileMap.set(p.id as string, {
            display_name: (p.display_name as string) || '用户',
            position:     (p.position as string) || null,
          });
        });
      }

      const mapped: PostItem[] = rows.map((r: Record<string, unknown>) => {
        const prof     = profileMap.get(r.user_id as string);
        const likes    = (r.watermark_likes as { user_id: string }[]) || [];
        const comms    = (r.watermark_comments as { id: string }[]) || [];
        const mediaRaw = (r.watermark_post_media as PostMedia[]) || [];
        const sortedMedia = [...mediaRaw].sort((a, b) => a.sort_order - b.sort_order);
        return {
          id:               r.id as string,
          remark:           r.remark as string | null,
          taken_at:         r.taken_at as string,
          user_id:          r.user_id as string,
          uploader_name:    prof?.display_name || '用户',
          uploader_position: prof?.position || null,
          uploader_avatar:  null,
          media:            sortedMedia,
          like_count:       likes.length,
          comment_count:    comms.length,
          liked_by_me:      !!uid && likes.some(l => l.user_id === uid),
        };
      });

      if (refresh || pageNum === 0) setItems(mapped);
      else setItems(prev => [...prev, ...mapped]);
      setHasMore(mapped.length === PAGE_SIZE);
    } catch (e: unknown) {
      console.error('[工作圈] fetchItems 失败:', (e as Error).message);
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [search, selectedUploader, myUserId]);

  useFocusEffect(useCallback(() => {
    (async () => {
      // 先获取 uid，再传给 fetchItems，避免 state 异步滞后导致 liked_by_me 全 false
      const uid = await fetchMe();
      setPage(0);
      fetchItems(0, true, uid);
      fetchUploaders();
    })();
  }, [fetchItems]));

  const handleLoadMore = () => {
    if (!hasMore || loading) return;
    const next = page + 1; setPage(next); fetchItems(next);
  };
  const handleRefresh        = () => { setPage(0); fetchItems(0, true); };
  const handleSearch         = () => { setPage(0); fetchItems(0, true); };
  const handleSelectUploader = (uid: string | null) => { setSelectedUploader(uid); setShowFilter(false); setPage(0); fetchItems(0, true); };

  // ─── 点赞（乐观更新 + 推送通知）────────────────────────────────────────────
  const handleLike = async (item: PostItem) => {
    if (!myUserId) return;
    const wasLiked = item.liked_by_me;
    const optimistic = wasLiked
      ? { liked_by_me: false, like_count: Math.max(0, item.like_count - 1) }
      : { liked_by_me: true,  like_count: item.like_count + 1 };
    setItems(prev => prev.map(it => it.id === item.id ? { ...it, ...optimistic } : it));

    if (wasLiked) {
      await supabase.from('watermark_likes').delete().eq('post_id', item.id).eq('user_id', myUserId);
    } else {
      await supabase.from('watermark_likes').insert({ post_id: item.id, user_id: myUserId });
      // 给 post 作者发推送通知（非自己）
      if (item.user_id && item.user_id !== myUserId) {
        try {
          await supabase.functions.invoke('send-push', {
            body: {
              user_ids: [item.user_id],
              title: '有人为你点赞 ❤️',
              body: `${item.uploader_name} 赞了你的工作圈内容`,
              data: { type: 'like', post_id: item.id },
            },
          });
        } catch { /* 推送失败不影响点赞 */ }
      }
    }
  };

  // ─── 评论弹窗 ────────────────────────────────────────────────────────────────
  const openComments = async (postId: string) => {
    setCommentPostId(postId);
    setReplyTo(null);
    setLoadingComments(true);
    // 用 post_id 查询（迁移后字段），并两步解析 commenter_name
    const { data } = await supabase
      .from('watermark_comments')
      .select('id, content, created_at, user_id, parent_id, reply_to_name')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    const rows = data || [];
    // 批量查 profiles
    const uids = [...new Set(rows.map((r: Record<string, unknown>) => r.user_id as string).filter(Boolean))];
    const nameMap = new Map<string, string>();
    if (uids.length > 0) {
      const { data: pData } = await supabase.from('profiles').select('id, display_name').in('id', uids);
      (pData || []).forEach((p: Record<string, unknown>) => nameMap.set(p.id as string, (p.display_name as string) || '用户'));
    }

    setComments(rows.map((r: Record<string, unknown>) => ({
      id:              r.id as string,
      content:         r.content as string,
      created_at:      r.created_at as string,
      user_id:         r.user_id as string,
      commenter_name:  nameMap.get(r.user_id as string) || '用户',
      parent_id:       (r.parent_id as string) || null,
      reply_to_name:   (r.reply_to_name as string) || null,
    })));
    setLoadingComments(false);
    setTimeout(() => commentInputRef.current?.focus(), 300);
  };

  const handlePostComment = async () => {
    if (!commentPostId || !commentText.trim() || !myUserId) return;
    setPostingComment(true);
    const content = commentText.trim();
    setCommentText('');
    // 用 post_id 写入（同时保留 photo_id 向后兼容旧查询）
    const payload: Record<string, unknown> = {
      post_id:  commentPostId,
      photo_id: commentPostId,
      user_id:  myUserId,
      content,
    };
    if (replyTo) {
      payload.parent_id     = replyTo.id;
      payload.reply_to_name = replyTo.name;
    }
    setReplyTo(null);
    const { data, error } = await supabase
      .from('watermark_comments')
      .insert(payload)
      .select('id, content, created_at, user_id, parent_id, reply_to_name')
      .single();
    if (!error && data) {
      // 查该用户名字
      let commenter_name = '用户';
      const { data: pData } = await supabase.from('profiles').select('display_name').eq('id', data.user_id).single();
      if (pData) commenter_name = pData.display_name || '用户';
      const newComment: CommentItem = {
        id:             data.id,
        content:        data.content,
        created_at:     data.created_at,
        user_id:        data.user_id,
        commenter_name,
        parent_id:      data.parent_id || null,
        reply_to_name:  data.reply_to_name || null,
      };
      setComments(prev => [...prev, newComment]);
      setItems(prev => prev.map(it =>
        it.id === commentPostId ? { ...it, comment_count: it.comment_count + 1 } : it
      ));
    }
    setPostingComment(false);
  };

  const handleDeleteComment = async (commentId: string, postId: string) => {
    await supabase.from('watermark_comments').delete().eq('id', commentId);
    setComments(prev => prev.filter(c => c.id !== commentId));
    setItems(prev => prev.map(it =>
      it.id === postId ? { ...it, comment_count: Math.max(0, it.comment_count - 1) } : it
    ));
  };

  // ─── 删除帖子 ─────────────────────────────────────────────────────────────────
  const handleDeletePost = async (item: PostItem) => {
    setDeleting(true);
    setDeleteErrMsg('');
    try {
      // 先删媒体记录，再删帖子（RLS 均已配置 user_id 校验）
      await supabase.from('watermark_post_media').delete().eq('post_id', item.id);
      const { error } = await supabase.from('watermark_posts').delete().eq('id', item.id);
      if (error) throw error;
      // 乐观移除
      setItems(prev => prev.filter(it => it.id !== item.id));
      setDeleteTarget(null);
    } catch (e: unknown) {
      setDeleteErrMsg(`删除失败：${(e as Error).message || '请重试'}`);
    } finally {
      setDeleting(false);
    }
  };

  // ─── 多选 ─────────────────────────────────────────────────────────────────────
  const toggleSelect = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const handleSelectAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map(it => it.id)));
  };
  const exitMultiMode = () => { setMultiMode(false); setSelected(new Set()); };

  const handleBatchDownload = async () => {
    if (selected.size === 0) return;
    const targets = items.filter(it => selected.has(it.id));
    if (process.env.EXPO_OS === 'web') {
      targets.forEach(t => t.media.forEach(m => {
        const a = document.createElement('a');
        a.href = m.photo_url; a.download = `wm-${m.id}.${m.media_type === 'video' ? 'mp4' : 'jpg'}`;
        a.target = '_blank'; a.click();
      }));
      exitMultiMode(); return;
    }
    const { status } = await MediaLibrary.requestPermissionsAsync(false, ['photo']);
    if (status !== 'granted') { setBatchProgress('需要相册权限'); setTimeout(() => setBatchProgress(''), 3000); return; }
    let done = 0;
    for (const t of targets) {
      for (const m of t.media) {
        setBatchProgress(`下载中 ${done + 1}…`);
        try {
          const ext = m.media_type === 'video' ? 'mp4' : 'jpg';
          const localUri = (FileSystem.documentDirectory ?? '') + `wm-${m.id}.${ext}`;
          const { uri } = await FileSystem.downloadAsync(m.photo_url, localUri);
          await MediaLibrary.createAssetAsync(uri);
          await FileSystem.deleteAsync(localUri, { idempotent: true });
        } catch { /* skip */ }
        done++;
      }
    }
    setBatchProgress(`已保存 ${done} 个文件 ✓`); setTimeout(() => setBatchProgress(''), 3500);
    exitMultiMode();
  };

  const handleBatchShare = async () => {
    if (selected.size === 0) return;
    const targets = items.filter(it => selected.has(it.id));
    if (process.env.EXPO_OS === 'web') {
      targets.forEach(t => t.media.forEach(m => window.open(m.photo_url, '_blank')));
      exitMultiMode(); return;
    }
    const canShare = await Sharing.isAvailableAsync();
    if (!canShare) { setBatchProgress('设备不支持分享'); setTimeout(() => setBatchProgress(''), 3000); return; }
    for (const t of targets) {
      const m = t.media[0];
      if (!m) continue;
      try {
        const ext = m.media_type === 'video' ? 'mp4' : 'jpg';
        const localUri = (FileSystem.documentDirectory ?? '') + `wm-share-${m.id}.${ext}`;
        await FileSystem.downloadAsync(m.photo_url, localUri);
        await Sharing.shareAsync(localUri);
        await FileSystem.deleteAsync(localUri, { idempotent: true });
      } catch { /* skip */ }
    }
    setBatchProgress(''); exitMultiMode();
  };

  // ─── 批量删除（含 Storage 文件清理）──────────────────────────────────────────
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);

  const handleBatchDelete = async () => {
    // 只删自己发布的帖子
    const targets = items.filter(it => selected.has(it.id) && it.user_id === myUserId);
    if (targets.length === 0) { setBatchDeleteConfirm(false); return; }
    setBatchDeleting(true);
    setBatchProgress(`删除中 0/${targets.length}…`);
    try {
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        setBatchProgress(`删除中 ${i + 1}/${targets.length}…`);

        // 1. 删除 Storage 文件（photo_path 不为空才请求）
        const paths = t.media.map(m => m.photo_path).filter(Boolean);
        if (paths.length > 0) {
          await supabase.storage.from('watermark-photos').remove(paths);
        }

        // 2. 删除媒体记录
        await supabase.from('watermark_post_media').delete().eq('post_id', t.id);

        // 3. 删除帖子（RLS 保证只能删自己的）
        await supabase.from('watermark_posts').delete().eq('id', t.id);
      }
      // 乐观移除列表
      const deletedIds = new Set(targets.map(t => t.id));
      setItems(prev => prev.filter(it => !deletedIds.has(it.id)));
      setBatchProgress(`已删除 ${targets.length} 条内容 ✓`);
      setTimeout(() => setBatchProgress(''), 3000);
      exitMultiMode();
    } catch (e: unknown) {
      setBatchProgress(`删除失败：${(e as Error).message || '请重试'}`);
      setTimeout(() => setBatchProgress(''), 4000);
    } finally {
      setBatchDeleting(false);
      setBatchDeleteConfirm(false);
    }
  };
  const renderItem = ({ item }: { item: PostItem }) => {
    const isSelected = selected.has(item.id);
    const isMine = !!myUserId && item.user_id === myUserId;

    // 左滑显示删除按钮（仅自己的帖子）
    const renderRightActions = (
      _progress: Animated.AnimatedInterpolation<number>,
      _drag: Animated.AnimatedInterpolation<number>,
    ) => {
      if (!isMine || multiMode) return null;
      return (
        <View style={{ width: 80, justifyContent: 'center', alignItems: 'center', backgroundColor: '#EF4444' }}>
          <Pressable
            onPress={() => {
              swipeableRefs.current.get(item.id)?.close();
              setDeleteTarget(item);
            }}
            style={{ alignItems: 'center', gap: 4 }}
            className="active:opacity-80"
          >
            <Trash2 size={20} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>删除</Text>
          </Pressable>
        </View>
      );
    };

    return (
      <Swipeable
        ref={ref => { swipeableRefs.current.set(item.id, ref); }}
        renderRightActions={renderRightActions}
        rightThreshold={40}
        overshootRight={false}
        enabled={isMine && !multiMode}
      >
        <Pressable
          onPress={() => { if (multiMode) { toggleSelect(item.id); return; } }}
          onLongPress={() => {
            if (isMine) {
              // 长按：弹出删除确认
              setDeleteTarget(item);
            } else {
              // 他人内容长按：进入多选模式
              setMultiMode(true); toggleSelect(item.id);
            }
          }}
          className="active:opacity-95"
        >
        <View style={{
          flexDirection: 'row', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10,
          borderBottomWidth: 0.5, borderBottomColor: '#E5E7EB',
          backgroundColor: isSelected ? '#FFF4EE' : '#fff',
        }}>
          {multiMode && (
            <View style={{ marginRight: 10, marginTop: 12, width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: isSelected ? '#FFA07A' : '#D1D5DB', backgroundColor: isSelected ? '#FFA07A' : '#fff', alignItems: 'center', justifyContent: 'center' }}>
              {isSelected && <CheckCircle2 size={14} color="#fff" />}
            </View>
          )}
          {/* 头像 */}
          <View style={{ marginRight: 12, marginTop: 2 }}>
            {item.uploader_avatar ? (
              <Image source={{ uri: item.uploader_avatar }} style={{ width: 42, height: 42, borderRadius: 21 }} contentFit="cover" />
            ) : (
              <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: avatarColor(item.uploader_name), alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>{getInitial(item.uploader_name)}</Text>
              </View>
            )}
          </View>

          {/* 内容区 */}
          <View style={{ flex: 1 }}>
            {/* 姓名 · 岗位 */}
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#4A6CF7', marginBottom: 4 }}>
              {item.uploader_position ? `${item.uploader_name} · ${item.uploader_position}` : item.uploader_name}
            </Text>
            {!!item.remark && (
              <Text style={{ fontSize: 14, color: '#1F2937', lineHeight: 20, marginBottom: 8 }}>{item.remark}</Text>
            )}
            {/* 九宫格媒体 */}
            {item.media.length > 0 && (
              <MediaGrid media={item.media} onPress={(m) => {
                router.push({ pathname: '/(app)/watermark-photo-detail', params: { id: m.id } } as Parameters<typeof router.push>[0]);
              }} />
            )}
            {/* 时间 + 互动 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
              <Text style={{ fontSize: 12, color: '#9CA3AF' }}>{timeAgo(item.taken_at)}</Text>
              {!multiMode && (
                <View style={{ flexDirection: 'row', gap: 16 }}>
                  <Pressable onPress={() => handleLike(item)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} className="active:opacity-70">
                    <Heart size={15} color={item.liked_by_me ? '#EF4444' : '#9CA3AF'} fill={item.liked_by_me ? '#EF4444' : 'none'} />
                    <Text style={{ fontSize: 12, color: item.liked_by_me ? '#EF4444' : '#9CA3AF' }}>{item.like_count > 0 ? item.like_count : '赞'}</Text>
                  </Pressable>
                  <Pressable onPress={() => openComments(item.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} className="active:opacity-70">
                    <MessageCircle size={15} color="#9CA3AF" />
                    <Text style={{ fontSize: 12, color: '#9CA3AF' }}>{item.comment_count > 0 ? item.comment_count : '评论'}</Text>
                  </Pressable>
                </View>
              )}
            </View>
          </View>
        </View>
      </Pressable>
      </Swipeable>
    );
  };

  // ─── JSX ─────────────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <StatusBar style="dark" />
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#fff' }}>
        {/* 顶部导航 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#E5E7EB', gap: 10 }}>
          {multiMode ? (
            <>
              <Pressable onPress={exitMultiMode} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }} className="active:opacity-60">
                <X size={18} color="#374151" />
              </Pressable>
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: '#1F2937' }}>已选 {selected.size} 项</Text>
              <Pressable onPress={handleSelectAll} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: '#F3F4F6' }} className="active:opacity-60">
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#374151' }}>{selected.size === items.length ? '取消全选' : '全选'}</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable onPress={() => router.back()} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }} className="active:opacity-60">
                <ArrowLeft size={18} color="#374151" />
              </Pressable>
              <Text style={{ flex: 1, fontSize: 17, fontWeight: '700', color: '#1F2937' }}>我的团队</Text>
              <Pressable onPress={() => setShowFilter(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: selectedUploader ? '#FFA07A' : '#F3F4F6' }} className="active:opacity-60">
                <SlidersHorizontal size={14} color={selectedUploader ? '#fff' : '#374151'} />
                <Text style={{ fontSize: 12, fontWeight: '600', color: selectedUploader ? '#fff' : '#374151' }}>
                  {selectedUploader ? uploaders.find(u => u.user_id === selectedUploader)?.display_name || '筛选中' : '筛选'}
                </Text>
              </Pressable>
            </>
          )}
        </View>

        {/* 搜索框 */}
        {!multiMode && (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginVertical: 8, backgroundColor: '#F9FAFB', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#E5E7EB' }}>
            <Search size={16} color="#9CA3AF" />
            <TextInput value={search} onChangeText={setSearch} onSubmitEditing={handleSearch} placeholder="搜索备注内容…" placeholderTextColor="#9CA3AF" style={{ flex: 1, marginLeft: 8, fontSize: 14, color: '#1F2937' }} returnKeyType="search" />
            {search.length > 0 && (
              <Pressable onPress={() => { setSearch(''); setPage(0); fetchItems(0, true); }} className="active:opacity-60">
                <X size={16} color="#9CA3AF" />
              </Pressable>
            )}
          </View>
        )}

        {!!batchProgress && (
          <View style={{ marginHorizontal: 16, marginBottom: 8, backgroundColor: '#FFF4EE', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 }}>
            <Text style={{ color: '#FFA07A', fontSize: 13, fontWeight: '600' }}>{batchProgress}</Text>
          </View>
        )}
      </SafeAreaView>

      {/* 列表 */}
      {loading && items.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#FFA07A" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          onRefresh={handleRefresh}
          refreshing={refreshing}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          contentInsetAdjustmentBehavior="automatic"
          ListEmptyComponent={
            <View style={{ paddingTop: 80, alignItems: 'center' }}>
              <Text style={{ color: '#9CA3AF', fontSize: 15 }}>暂无内容</Text>
              <Text style={{ color: '#9CA3AF', fontSize: 13, marginTop: 4 }}>发布水印照片/视频后将显示在这里</Text>
            </View>
          }
          ListFooterComponent={
            hasMore && items.length > 0
              ? <ActivityIndicator size="small" color="#FFA07A" style={{ marginVertical: 16 }} />
              : items.length > 0 ? <Text style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 12, marginVertical: 16 }}>— 已全部加载 —</Text> : null
          }
        />
      )}

      {/* 多选底部工具栏 */}
      {multiMode && selected.size > 0 && (
        <SafeAreaView edges={['bottom']} style={{ backgroundColor: '#fff', borderTopWidth: 0.5, borderTopColor: '#E5E7EB' }}>
          <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 10 }}>
            <Pressable onPress={handleBatchDownload} style={{ flex: 1, paddingVertical: 11, borderRadius: 14, backgroundColor: '#FFA07A', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }} className="active:opacity-80">
              <Download size={15} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>保存({selected.size})</Text>
            </Pressable>
            <Pressable onPress={handleBatchShare} style={{ flex: 1, paddingVertical: 11, borderRadius: 14, backgroundColor: '#4A6CF7', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }} className="active:opacity-80">
              <Send size={15} color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>分享({selected.size})</Text>
            </Pressable>
            {/* 批量删除：仅当选中内容中有自己发布的才显示 */}
            {items.some(it => selected.has(it.id) && it.user_id === myUserId) && (
              <Pressable onPress={() => setBatchDeleteConfirm(true)} style={{ flex: 1, paddingVertical: 11, borderRadius: 14, backgroundColor: '#EF4444', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }} className="active:opacity-80">
                <Trash2 size={15} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>删除({items.filter(it => selected.has(it.id) && it.user_id === myUserId).length})</Text>
              </Pressable>
            )}
          </View>
        </SafeAreaView>
      )}

      {/* 筛选弹窗 */}
      {showFilter && (
        <Pressable style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }} onPress={() => setShowFilter(false)}>
          <Pressable onPress={e => e.stopPropagation()}>
            <SafeAreaView edges={['bottom']} style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 16, paddingHorizontal: 16, maxHeight: 360 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#1F2937' }}>按上传者筛选</Text>
                <Pressable onPress={() => setShowFilter(false)} className="active:opacity-60"><X size={20} color="#6B7280" /></Pressable>
              </View>
              <Pressable onPress={() => handleSelectUploader(null)} style={{ paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#F3F4F6', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 15, color: !selectedUploader ? '#FFA07A' : '#1F2937', fontWeight: !selectedUploader ? '600' : '400' }}>全部成员</Text>
                {!selectedUploader && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFA07A' }} />}
              </Pressable>
              {uploaders.map(u => (
                <Pressable key={u.user_id} onPress={() => handleSelectUploader(u.user_id)} style={{ paddingVertical: 12, borderBottomWidth: 0.5, borderBottomColor: '#F3F4F6', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 15, color: selectedUploader === u.user_id ? '#FFA07A' : '#1F2937', fontWeight: selectedUploader === u.user_id ? '600' : '400' }}>{u.display_name}</Text>
                  {selectedUploader === u.user_id && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#FFA07A' }} />}
                </Pressable>
              ))}
            </SafeAreaView>
          </Pressable>
        </Pressable>
      )}

      {/* 评论半屏弹窗 */}
      {commentPostId && (
        <Pressable style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }} onPress={() => { setCommentPostId(null); setCommentText(''); setReplyTo(null); }}>
          <Pressable onPress={e => e.stopPropagation()}>
            <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}>
              <SafeAreaView edges={['bottom']} style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: 500 }}>
                {/* 标题 */}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10, borderBottomWidth: 0.5, borderBottomColor: '#F3F4F6' }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#1F2937' }}>
                    评论 {comments.length > 0 ? `(${comments.length})` : ''}
                  </Text>
                  <Pressable onPress={() => { setCommentPostId(null); setCommentText(''); setReplyTo(null); }} className="active:opacity-60">
                    <X size={20} color="#6B7280" />
                  </Pressable>
                </View>

                {/* 评论列表 */}
                <ScrollView style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled">
                  {loadingComments ? (
                    <ActivityIndicator color="#FFA07A" style={{ margin: 24 }} />
                  ) : comments.length === 0 ? (
                    <Text style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 14, marginVertical: 24 }}>暂无评论，快来说点什么</Text>
                  ) : (
                    <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 14 }}>
                      {comments.map(c => (
                        <View key={c.id} style={{ flexDirection: 'row', gap: 10 }}>
                          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: avatarColor(c.commenter_name), alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{getInitial(c.commenter_name)}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                              <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151' }}>{c.commenter_name}</Text>
                              <Text style={{ fontSize: 11, color: '#9CA3AF' }}>{timeAgo(c.created_at)}</Text>
                            </View>
                            {c.reply_to_name && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                                <CornerDownRight size={11} color="#9CA3AF" />
                                <Text style={{ fontSize: 12, color: '#6B7280' }}>回复 @{c.reply_to_name}</Text>
                              </View>
                            )}
                            <Text style={{ fontSize: 14, color: '#1F2937', lineHeight: 20 }}>{c.content}</Text>
                            <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
                              {/* 回复按钮 */}
                              <Pressable onPress={() => {
                                setReplyTo({ id: c.id, name: c.commenter_name });
                                commentInputRef.current?.focus();
                              }} className="active:opacity-60">
                                <Text style={{ fontSize: 12, color: '#9CA3AF' }}>回复</Text>
                              </Pressable>
                              {/* 删除（仅自己） */}
                              {c.user_id === myUserId && commentPostId && (
                                <Pressable onPress={() => handleDeleteComment(c.id, commentPostId)} className="active:opacity-60">
                                  <Text style={{ fontSize: 12, color: '#EF4444' }}>删除</Text>
                                </Pressable>
                              )}
                            </View>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </ScrollView>

                {/* 回复提示条 */}
                {replyTo && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 6, backgroundColor: '#FFF4EE', gap: 8 }}>
                    <Text style={{ flex: 1, fontSize: 12, color: '#6B7280' }}>
                      <Text style={{ color: '#FFA07A', fontWeight: '600' }}>回复 @{replyTo.name}</Text>
                    </Text>
                    <Pressable onPress={() => setReplyTo(null)} className="active:opacity-60">
                      <X size={14} color="#9CA3AF" />
                    </Pressable>
                  </View>
                )}

                {/* 输入区 */}
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 0.5, borderTopColor: '#F3F4F6', gap: 8 }}>
                  <TextInput
                    ref={commentInputRef}
                    value={commentText}
                    onChangeText={setCommentText}
                    placeholder={replyTo ? `回复 @${replyTo.name}…` : '发表评论…'}
                    placeholderTextColor="#9CA3AF"
                    style={{ flex: 1, fontSize: 14, color: '#1F2937', backgroundColor: '#F9FAFB', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, maxHeight: 80, borderWidth: 1, borderColor: '#E5E7EB' }}
                    multiline
                    returnKeyType="send"
                    onSubmitEditing={handlePostComment}
                  />
                  <Pressable
                    onPress={handlePostComment}
                    disabled={postingComment || !commentText.trim()}
                    style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: commentText.trim() ? '#FFA07A' : '#E5E7EB', alignItems: 'center', justifyContent: 'center' }}
                    className="active:opacity-80"
                  >
                    {postingComment ? <ActivityIndicator size="small" color="#fff" /> : <Send size={16} color="#fff" />}
                  </Pressable>
                </View>
              </SafeAreaView>
            </KeyboardAvoidingView>
          </Pressable>
        </Pressable>
      )}

      {/* 批量删除确认弹窗 */}
      {batchDeleteConfirm && (
        <AlertDialog open={batchDeleteConfirm} onOpenChange={open => { if (!open) setBatchDeleteConfirm(false); }}>
          <AlertDialogTrigger asChild><View /></AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>批量删除确认</AlertDialogTitle>
              <AlertDialogDescription>
                将删除你发布的 {items.filter(it => selected.has(it.id) && it.user_id === myUserId).length} 条内容，
                所有图片/视频文件也会一并从云端移除，无法恢复。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onPress={() => setBatchDeleteConfirm(false)}>
                <Text>取消</Text>
              </AlertDialogCancel>
              <AlertDialogAction
                onPress={handleBatchDelete}
                disabled={batchDeleting}
                style={{ backgroundColor: '#EF4444' }}
              >
                {batchDeleting
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ color: '#fff', fontWeight: '700' }}>确认删除</Text>}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* 删除帖子确认弹窗（AlertDialog，自己帖子长按/滑动触发） */}
      {deleteTarget && (
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
          <AlertDialogTrigger asChild><View /></AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>删除这条工作圈？</AlertDialogTitle>
              <AlertDialogDescription>
                删除后将无法恢复，所有图片/视频也会一并移除。
                {!!deleteErrMsg && (
                  <Text style={{ color: '#EF4444', fontSize: 13, marginTop: 6 }}>{deleteErrMsg}</Text>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onPress={() => { setDeleteTarget(null); setDeleteErrMsg(''); }}>
                <Text>取消</Text>
              </AlertDialogCancel>
              <AlertDialogAction
                onPress={() => deleteTarget && handleDeletePost(deleteTarget)}
                disabled={deleting}
                style={{ backgroundColor: '#EF4444' }}
              >
                {deleting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>删除</Text>}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </View>
  );
}
