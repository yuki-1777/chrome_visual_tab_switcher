// 最近アクティブになったグループIDを保存する履歴リスト（先頭が最新）
let recentGroupIds = [];

// ★追加: グループごとに「最後にアクティブだったタブID」を記憶する辞書
// { groupId: tabId, ... }
let lastActiveTabs = {};

// 1. タブがアクティブになったら履歴を更新
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab.groupId !== -1) {
      updateRecentGroups(tab.groupId);
      // ★追加: このグループの最新タブとして記録
      lastActiveTabs[tab.groupId] = tab.id;
    }
  } catch (e) {
    // タブが閉じられた直後などはエラーになることがあるので無視
  }
});

// 2. ウィンドウがフォーカスされた時も履歴を更新
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, windowId });
    if (tab && tab.groupId !== -1) {
      updateRecentGroups(tab.groupId);
      // ★追加: このグループの最新タブとして記録
      lastActiveTabs[tab.groupId] = tab.id;
    }
  } catch (e) {}
});

// 履歴リストを更新する関数
function updateRecentGroups(groupId) {
  recentGroupIds = recentGroupIds.filter(id => id !== groupId);
  recentGroupIds.unshift(groupId);
}

// --- content.js からのメッセージ処理 ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getGroups") {
    getSortedGroupList().then(groups => sendResponse({ groups }));
    return true; 
  }

  if (request.action === "switchToGroup") {
    activateGroup(request.groupId);
  }

  // iframeからのキー入力を、そのタブのトップページへ転送する（前回の実装分）
  if (request.action === "delegateKey") {
    if (sender.tab && sender.tab.id) {
      chrome.tabs.sendMessage(sender.tab.id, { 
        action: "simulateKey", 
        shift: request.shift 
      });
    }
  }
});

// 並び替え済みのグループ一覧を作成する関数
async function getSortedGroupList() {
  const allTabs = await chrome.tabs.query({});
  const currentGroupIds = [...new Set(allTabs.map(tab => tab.groupId))].filter(id => id !== -1);
  
  let sortedIds = recentGroupIds.filter(id => currentGroupIds.includes(id));
  const unrecordedIds = currentGroupIds.filter(id => !recentGroupIds.includes(id));
  sortedIds = [...sortedIds, ...unrecordedIds];

  const groupsInfo = [];
  for (const id of sortedIds) {
    try {
      const group = await chrome.tabGroups.get(id);
      groupsInfo.push({
        id: group.id,
        title: group.title || "（無題）",
        color: group.color
      });
    } catch (e) {}
  }
  return groupsInfo;
}

// ★修正: 指定されたグループへ移動する関数
async function activateGroup(groupId) {
  const allTabs = await chrome.tabs.query({});
  
  let targetTab = null;

  // 1. まず「記憶にあるタブ」を探す
  const lastTabId = lastActiveTabs[groupId];
  if (lastTabId) {
    // 記憶にあったIDが、現在の全タブリストの中にまだ存在するか確認
    targetTab = allTabs.find(tab => tab.id === lastTabId && tab.groupId === groupId);
  }

  // 2. 記憶がない、またはそのタブが既に閉じられていた場合は「グループの先頭」を探す
  if (!targetTab) {
    targetTab = allTabs.find(tab => tab.groupId === groupId);
  }

  // 移動実行
  if (targetTab) {
    await chrome.tabs.update(targetTab.id, { active: true });
    await chrome.windows.update(targetTab.windowId, { focused: true });
    
    updateRecentGroups(groupId);
    lastActiveTabs[groupId] = targetTab.id; // 移動した結果も記憶しておく
  }
}