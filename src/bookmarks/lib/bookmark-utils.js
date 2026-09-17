/*
 * Ported from bookmark-sorter (bookmark-utils.js).
 * Bookmark tree helpers: walking the tree, nested folder paths, moves.
 *
 * Plain script, not a module: the service worker loads it with importScripts.
 * Everything stays inside this function scope, and only the names listed at the
 * bottom are published on self.CodexBookmarks.
 */

(function () {
  'use strict';

/**
 * Bookmark Utilities - 书签操作工具库
 * 提供书签遍历、文件夹创建/查找、移动等基础操作
 */

/**
 * 递归遍历书签树，收集所有书签节点
 * @param {chrome.bookmarks.BookmarkTreeNode} node - 起始节点
 * @param {string} path - 当前文件夹路径（用于显示）
 * @returns {Array<{id, name, url, path, parentId, dateAdded}>}
 */
function collectBookmarks(node, path = '') {
  const results = [];
  if (!node) return results;

  const currentPath = path ? `${path} > ${node.title || '根'}` : (node.title || '根');

  if (node.url) {
    // 这是一个书签
    results.push({
      id: node.id,
      name: node.title || '',
      url: node.url,
      path: path,
      parentId: node.parentId,
      dateAdded: node.dateAdded ? Number(node.dateAdded) : 0,
    });
  }

  if (node.children) {
    for (const child of node.children) {
      results.push(...collectBookmarks(child, currentPath));
    }
  }

  return results;
}

/**
 * 获取收藏栏下的所有书签
 * @returns {Promise<Array>}
 */
async function getBookmarkBarBookmarks() {
  const tree = await chrome.bookmarks.getTree();
  const root = tree[0];
  // 找到 bookmark_bar (id 通常是 '1')
  const barNode = root.children?.find(c => c.id === '1') || root.children?.[0];
  if (!barNode) return [];
  return collectBookmarks(barNode, '');
}

/**
 * 获取所有书签（包括其他书签和移动书签）
 * @returns {Promise<Array>}
 */
async function getAllBookmarks() {
  const tree = await chrome.bookmarks.getTree();
  const results = [];
  for (const root of tree) {
    if (root.children) {
      for (const child of root.children) {
        results.push(...collectBookmarks(child, ''));
      }
    }
  }
  return results;
}

/**
 * 在指定父文件夹下查找或创建嵌套文件夹路径
 * 例如: ensureFolderPath('1', ['社交', '国内'])
 * 会在收藏栏下创建 社交 > 国内 的嵌套结构
 * @param {string} parentId - 父文件夹ID
 * @param {string[]} folderPath - 文件夹路径数组
 * @returns {Promise<string>} 最终文件夹的ID
 */
async function ensureFolderPath(parentId, folderPath) {
  let currentParentId = parentId;

  for (const folderName of folderPath) {
    if (!folderName) continue;

    // 查找是否已存在同名文件夹
    const children = await chrome.bookmarks.getChildren(currentParentId);
    const existing = children.find(
      c => !c.url && c.title === folderName
    );

    if (existing) {
      currentParentId = existing.id;
    } else {
      // 创建新文件夹
      const created = await chrome.bookmarks.create({
        parentId: currentParentId,
        title: folderName,
      });
      currentParentId = created.id;
    }
  }

  return currentParentId;
}

/**
 * 将书签移动到指定文件夹
 * @param {string} bookmarkId - 书签ID
 * @param {string} targetFolderId - 目标文件夹ID
 * @returns {Promise<chrome.bookmarks.BookmarkTreeNode>}
 */
async function moveBookmark(bookmarkId, targetFolderId) {
  return chrome.bookmarks.move(bookmarkId, { parentId: targetFolderId });
}

/**
 * 批量移动书签到分类文件夹
 * @param {Array<{bookmarkId: string, category: string[]}>} moves - 移动计划
 * @param {string} barId - 收藏栏ID (通常为 '1')
 * @returns {Promise<{success: number, failed: number, errors: string[]}>}
 */
async function batchMoveBookmarks(moves, barId = '1') {
  let success = 0;
  let failed = 0;
  const errors = [];

  // 先按分类路径分组，减少重复创建文件夹
  const folderCache = new Map(); // "path1>path2" -> folderId

  for (const move of moves) {
    try {
      const { bookmarkId, category } = move;
      const folderKey = category.join('>');

      let targetFolderId;
      if (folderCache.has(folderKey)) {
        targetFolderId = folderCache.get(folderKey);
      } else {
        targetFolderId = await ensureFolderPath(barId, category);
        folderCache.set(folderKey, targetFolderId);
      }

      await moveBookmark(bookmarkId, targetFolderId);
      success++;
    } catch (err) {
      failed++;
      errors.push(`移动书签 ${move.bookmarkId} 失败: ${err.message}`);
    }
  }

  return { success, failed, errors };
}

/**
 * 删除书签
 * @param {string} bookmarkId
 * @returns {Promise<void>}
 */
async function removeBookmark(bookmarkId) {
  return chrome.bookmarks.remove(bookmarkId);
}

/**
 * 获取收藏栏节点ID
 * @returns {Promise<string>}
 */
async function getBookmarkBarId() {
  const tree = await chrome.bookmarks.getTree();
  const root = tree[0];
  const barNode = root.children?.find(c => c.id === '1') || root.children?.[0];
  return barNode?.id || '1';
}

/**
 * 获取收藏栏的完整树结构（用于预览）
 * @returns {Promise<chrome.bookmarks.BookmarkTreeNode>}
 */
async function getBookmarkBarTree() {
  const tree = await chrome.bookmarks.getTree();
  const root = tree[0];
  return root.children?.find(c => c.id === '1') || root.children?.[0];
}

/**
 * 从收藏栏树提取分类层级（用户实际文件夹结构）
 * 以用户当前的文件夹作为分类体系，最多支持3层嵌套
 * @returns {Promise<Array<{name, children}>>}
 */
async function getBookmarkBarCategories() {
  const barNode = await getBookmarkBarTree();
  if (!barNode?.children) return [];

  const categories = [];
  for (const child of barNode.children) {
    if (child.url) continue; // 跳过根级的书签
    const cat = { name: child.title || '未命名', children: [] };
    if (child.children) {
      for (const sub of child.children) {
        if (sub.url) continue;
        const subCat = { name: sub.title || '未命名', children: [] };
        if (sub.children) {
          for (const sub2 of sub.children) {
            if (sub2.url) continue;
            subCat.children.push({ name: sub2.title || '未命名', children: [] });
          }
        }
        cat.children.push(subCat);
      }
    }
    categories.push(cat);
  }
  return categories;
}

/**
 * 清理收藏栏下的空文件夹
 * @param {string} parentId - 起始文件夹ID
 * @returns {Promise<number>} 删除的空文件夹数量
 */
async function cleanEmptyFolders(parentId) {
  let removed = 0;
  const children = await chrome.bookmarks.getChildren(parentId);

  for (const child of children) {
    if (!child.url) {
      // 先递归清理子文件夹
      removed += await cleanEmptyFolders(child.id);

      // 再检查自身是否为空
      const remaining = await chrome.bookmarks.getChildren(child.id);
      if (remaining.length === 0) {
        await chrome.bookmarks.remove(child.id);
        removed++;
      }
    }
  }

  return removed;
}

/**
 * 合并同名文件夹（递归）
 * 同一父级下如果有多个同名文件夹，将后创建的文件夹内容移入先创建的，然后删除重复的
 * @param {string} parentId - 起始文件夹ID
 * @returns {Promise<number>} 合并的文件夹数量
 */
async function mergeDuplicateFolders(parentId) {
  let merged = 0;
  const children = await chrome.bookmarks.getChildren(parentId);

  // 先递归处理子文件夹
  for (const child of children) {
    if (!child.url) {
      merged += await mergeDuplicateFolders(child.id);
    }
  }

  // 重新获取子列表（递归后可能有变化）
  const currentChildren = await chrome.bookmarks.getChildren(parentId);
  const folders = currentChildren.filter(c => !c.url);

  // 按名称分组
  const nameMap = new Map();
  for (const folder of folders) {
    const key = folder.title.trim().toLowerCase();
    if (!nameMap.has(key)) {
      nameMap.set(key, []);
    }
    nameMap.get(key).push(folder);
  }

  // 合并同名文件夹
  for (const [name, group] of nameMap) {
    if (group.length <= 1) continue;

    // 保留第一个（最早创建），合并其余的
    const keep = group[0];
    const duplicates = group.slice(1);

    for (const dup of duplicates) {
      // 将重复文件夹的所有子项移入保留文件夹
      const dupChildren = await chrome.bookmarks.getChildren(dup.id);
      for (const item of dupChildren) {
        await chrome.bookmarks.move(item.id, { parentId: keep.id });
      }
      // 删除空的重复文件夹
      await chrome.bookmarks.remove(dup.id);
      merged++;
    }
  }

  return merged;
}

  self.CodexBookmarks = Object.assign(self.CodexBookmarks || {}, {
    collectBookmarks,
    getBookmarkBarBookmarks,
    getAllBookmarks,
    ensureFolderPath,
    moveBookmark,
    batchMoveBookmarks,
    removeBookmark,
    getBookmarkBarId,
    getBookmarkBarTree,
    getBookmarkBarCategories,
    cleanEmptyFolders,
    mergeDuplicateFolders,
  });
})();
