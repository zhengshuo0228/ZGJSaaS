/**
 * 菜品标准SOP 数据层
 * 封装 dishes / dish_sop / dish_sop_history / dish_categories 表的 CRUD 操作
 */
import { supabase } from '@/client/supabase';
import type { Dish, DishSop, DishWithSop, DishSopHistory, DishCategory } from '@/types/types';

// ===== 查询所有菜品 =====
export async function getDishes(): Promise<Dish[]> {
  const { data } = await supabase
    .from('dishes')
    .select('*')
    .order('created_at', { ascending: false });
  return Array.isArray(data) ? (data as Dish[]) : [];
}

// ===== 查询单个菜品及其SOP =====
export async function getDishWithSop(dishId: string): Promise<DishWithSop | null> {
  const { data: dish } = await supabase
    .from('dishes')
    .select('*')
    .eq('id', dishId)
    .single();
  if (!dish) return null;

  const { data: sop } = await supabase
    .from('dish_sop')
    .select('*')
    .eq('dish_id', dishId)
    .single();

  return {
    ...(dish as Dish),
    sop: (sop as DishSop) ?? null,
  };
}

// ===== 新增或更新菜品及SOP（upsert），同时写入历史快照 =====
export async function upsertDishAndSop(params: {
  dishId?: string;
  name: string;
  category: string;
  imageUrl: string | null;
  ingredients: string;
  steps: string;
  plating: string;
  notes: string;
}): Promise<string | null> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return '未登录，请重新登录';

  try {
    let dishId = params.dishId;

    if (dishId) {
      const { error } = await supabase
        .from('dishes')
        .update({
          name: params.name,
          category: params.category,
          image_url: params.imageUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', dishId);
      if (error) return '菜品信息保存失败：' + error.message;
    } else {
      const { data, error } = await supabase
        .from('dishes')
        .insert({
          name: params.name,
          category: params.category,
          image_url: params.imageUrl,
          created_by: user.id,
        })
        .select('id')
        .single();
      if (error || !data) return '新增菜品失败：' + (error?.message ?? '');
      dishId = (data as { id: string }).id;
    }

    // 计算新版本号
    let newVersion = 'v1.0';
    const { data: existingSop } = await supabase
      .from('dish_sop')
      .select('id, version')
      .eq('dish_id', dishId)
      .single();

    if (existingSop) {
      const match = (existingSop as { version: string }).version.match(/v(\d+)\.(\d+)/);
      if (match) {
        newVersion = `v${match[1]}.${parseInt(match[2], 10) + 1}`;
      }
      const { error } = await supabase
        .from('dish_sop')
        .update({
          ingredients: params.ingredients || null,
          steps: params.steps || null,
          plating: params.plating || null,
          notes: params.notes || null,
          version: newVersion,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', (existingSop as { id: string }).id);
      if (error) return 'SOP内容保存失败：' + error.message;
    } else {
      const { error } = await supabase
        .from('dish_sop')
        .insert({
          dish_id: dishId,
          ingredients: params.ingredients || null,
          steps: params.steps || null,
          plating: params.plating || null,
          notes: params.notes || null,
          version: newVersion,
          updated_by: user.id,
        });
      if (error) return 'SOP内容创建失败：' + error.message;
    }

    // 写入历史快照
    await supabase.from('dish_sop_history').insert({
      dish_id: dishId,
      version: newVersion,
      ingredients: params.ingredients || null,
      steps: params.steps || null,
      plating: params.plating || null,
      notes: params.notes || null,
      updated_by: user.id,
    });

    return null;
  } catch {
    return '保存失败，请重试';
  }
}

// ===== 删除菜品（级联删除SOP + 历史） =====
export async function deleteDish(dishId: string): Promise<string | null> {
  const { error } = await supabase.from('dishes').delete().eq('id', dishId);
  return error ? '删除失败：' + error.message : null;
}

// ===== 查询菜品的版本历史列表 =====
export async function getDishSopHistory(dishId: string): Promise<DishSopHistory[]> {
  const { data } = await supabase
    .from('dish_sop_history')
    .select('*')
    .eq('dish_id', dishId)
    .order('created_at', { ascending: false });
  if (!Array.isArray(data)) return [];

  // 批量查询操作人姓名
  const histories = data as DishSopHistory[];
  const userIds = [...new Set(histories.map((h) => h.updated_by).filter(Boolean))] as string[];
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, display_name')
      .in('id', userIds);
    const nameMap: Record<string, string> = {};
    if (Array.isArray(profiles)) {
      (profiles as { id: string; display_name: string }[]).forEach((p) => {
        nameMap[p.id] = p.display_name;
      });
    }
    return histories.map((h) => ({
      ...h,
      updated_by_name: h.updated_by ? (nameMap[h.updated_by] ?? '未知') : '系统',
    }));
  }
  return histories;
}

// ===== 回滚SOP到指定历史版本 =====
export async function rollbackSopToHistory(
  dishId: string,
  historyId: string,
): Promise<string | null> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return '未登录，请重新登录';

  // 查询目标历史快照
  const { data: target } = await supabase
    .from('dish_sop_history')
    .select('*')
    .eq('id', historyId)
    .single();
  if (!target) return '历史版本不存在';
  const snap = target as DishSopHistory;

  // 获取当前版本号，生成新版本号（大版本 +1）
  const { data: cur } = await supabase
    .from('dish_sop')
    .select('id, version')
    .eq('dish_id', dishId)
    .single();

  let newVersion = 'v2.0';
  if (cur) {
    const match = (cur as { version: string }).version.match(/v(\d+)\.(\d+)/);
    if (match) {
      newVersion = `v${parseInt(match[1], 10) + 1}.0`;
    }
  }

  const sopFields = {
    ingredients: snap.ingredients,
    steps: snap.steps,
    plating: snap.plating,
    notes: snap.notes,
    version: newVersion,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };

  if (cur) {
    const { error } = await supabase
      .from('dish_sop')
      .update(sopFields)
      .eq('id', (cur as { id: string }).id);
    if (error) return '回滚失败：' + error.message;
  } else {
    const { error } = await supabase
      .from('dish_sop')
      .insert({ dish_id: dishId, ...sopFields });
    if (error) return '回滚失败：' + error.message;
  }

  // 写入历史快照（回滚操作也产生新版本记录）
  await supabase.from('dish_sop_history').insert({
    dish_id: dishId,
    ...sopFields,
  });

  return null;
}

// ===== 批量新增菜品 + SOP（Excel导入专用） =====
export async function batchImportDishes(
  rows: {
    name: string;
    category: string;
    ingredients?: string;
    steps?: string;
    plating?: string;
    notes?: string;
  }[],
): Promise<{ success: number; failed: { row: number; reason: string }[] }> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return { success: 0, failed: [{ row: 0, reason: '未登录，请重新登录' }] };

  let success = 0;
  const failed: { row: number; reason: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    try {
      const { data: dish, error: dishErr } = await supabase
        .from('dishes')
        .insert({ name: r.name, category: r.category, created_by: user.id })
        .select('id')
        .single();
      if (dishErr || !dish) {
        failed.push({ row: i + 2, reason: dishErr?.message ?? '菜品写入失败' });
        continue;
      }
      const dishId = (dish as { id: string }).id;

      const hasSop = r.ingredients || r.steps || r.plating || r.notes;
      if (hasSop) {
        const version = 'v1.0';
        const sopRow = {
          dish_id: dishId,
          ingredients: r.ingredients || null,
          steps: r.steps || null,
          plating: r.plating || null,
          notes: r.notes || null,
          version,
          updated_by: user.id,
        };
        const { error: sopErr } = await supabase.from('dish_sop').insert(sopRow);
        if (sopErr) {
          failed.push({ row: i + 2, reason: 'SOP写入失败：' + sopErr.message });
          continue;
        }
        await supabase.from('dish_sop_history').insert({ ...sopRow });
      }
      success++;
    } catch {
      failed.push({ row: i + 2, reason: '未知错误' });
    }
  }
  return { success, failed };
}

// ===== 分类管理 CRUD =====

/** 查询所有分类（全员可读） */
export async function getDishCategories(): Promise<DishCategory[]> {
  const { data } = await supabase
    .from('dish_categories')
    .select('*')
    .order('created_at', { ascending: true });
  return Array.isArray(data) ? (data as DishCategory[]) : [];
}

/** 新增分类（sop_manage权限） */
export async function createDishCategory(name: string): Promise<string | null> {
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return '未登录，请重新登录';
  const { error } = await supabase.from('dish_categories').insert({
    name: name.trim(),
    created_by: user.id,
  });
  if (error) {
    if (error.code === '23505') return '该分类名称已存在';
    return error.message;
  }
  return null;
}

/** 更新分类名称（sop_manage权限） */
export async function updateDishCategory(id: string, name: string): Promise<string | null> {
  const { error } = await supabase
    .from('dish_categories')
    .update({ name: name.trim() })
    .eq('id', id);
  if (error) {
    if (error.code === '23505') return '该分类名称已存在';
    return error.message;
  }
  return null;
}

/** 删除分类前检查是否有菜品使用该分类 */
export async function checkCategoryUsage(categoryName: string): Promise<number> {
  const { count } = await supabase
    .from('dishes')
    .select('*', { count: 'exact', head: true })
    .eq('category', categoryName);
  return count ?? 0;
}

/** 删除分类（sop_manage权限，调用前请先 checkCategoryUsage） */
export async function deleteDishCategory(id: string): Promise<string | null> {
  const { error } = await supabase.from('dish_categories').delete().eq('id', id);
  if (error) return error.message;
  return null;
}
