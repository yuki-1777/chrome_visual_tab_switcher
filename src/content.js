console.log("=== content.js 読み込み完了 ===");

let isSwitcherOpen = false;
let groups = [];
let selectedIndex = 0;
let backdropElement = null; // 名前変更: overlayElement -> backdropElement
let lastFocusedElement = null; // キャンセル時にフォーカスを戻す場所

// === キーボード監視 ===
document.addEventListener("keydown", (e) => {
  // Option + Q
  if (e.altKey && e.code === "KeyQ") {
    e.preventDefault();
    e.stopImmediatePropagation();
    
    if (!isSwitcherOpen) {
      // 開く前に、今フォーカスしている場所を覚えておく（キャンセル時のため）
      lastFocusedElement = document.activeElement;
      startSwitcher(e.shiftKey);
    } else {
      // 移動
      if (e.shiftKey) {
        selectedIndex = (selectedIndex - 1 + groups.length) % groups.length;
      } else {
        selectedIndex = (selectedIndex + 1) % groups.length;
      }
      updateSelection();
    }
    return;
  }

  // Escapeキー (メニューが開いている時だけ)
  if (isSwitcherOpen && e.code === "Escape") {
    e.preventDefault();
    e.stopImmediatePropagation();
    cancelSwitcher(); // キャンセル処理へ
  }
}, true);

// === キー離脱監視 (決定) ===
document.addEventListener("keyup", (e) => {
  if (e.key === "Alt" && isSwitcherOpen) {
    executeSwitch();
  }
}, true);


// === 起動ロジック ===
async function startSwitcher(reverse = false) {
  if (isSwitcherOpen) return;
  try {
    const response = await chrome.runtime.sendMessage({ action: "getGroups" });
    if (chrome.runtime.lastError) return;

    if (response && response.groups && response.groups.length > 0) {
      isSwitcherOpen = true;
      groups = response.groups;
      if (groups.length > 1) {
        selectedIndex = reverse ? groups.length - 1 : 1;
      } else {
        selectedIndex = 0;
      }
      showUI();
    }
  } catch (e) { console.error(e); }
}

// === 切り替え実行 ===
function executeSwitch() {
  const selectedGroup = groups[selectedIndex];
  if (selectedGroup) {
    chrome.runtime.sendMessage({ action: "switchToGroup", groupId: selectedGroup.id });
  }
  closeUI(); // フォーカスは戻さなくていい（タブが切り替わるから）
}

// === キャンセル実行 ===
function cancelSwitcher() {
  closeUI();
  // キャンセルした場合は、元の入力欄などにフォーカスを戻してあげる（親切設計）
  if (lastFocusedElement) {
    lastFocusedElement.focus();
  }
}

// === UI表示 (バックドロップ方式) ===
function showUI() {
  if (backdropElement) document.body.removeChild(backdropElement);
  
  // 1. 透明な膜（バックドロップ）を作る
  backdropElement = document.createElement("div");
  backdropElement.id = "ts-backdrop";

  // 2. メニュー本体を作る
  const overlay = document.createElement("div");
  overlay.id = "ts-overlay";
  // ★重要: ここにフォーカスを当てるための設定
  overlay.tabIndex = -1; 

  groups.forEach((group, index) => {
    const card = document.createElement("div");
    card.className = "ts-card";
    card.id = `ts-card-${index}`;
    card.innerText = group.title;
    
    const colorCode = getColorCode(group.color);
    card.style.setProperty("--group-color", colorCode);
    card.style.setProperty("--group-bg-color", hexToRgba(colorCode, 0.2));

    card.addEventListener("mouseenter", () => {
      selectedIndex = index;
      updateSelection();
    });
    
    // カードクリックで決定
    card.addEventListener("click", (e) => {
      e.stopPropagation(); // バックドロップへの伝播を止める
      selectedIndex = index;
      executeSwitch();
    });

    const dot = document.createElement("span");
    dot.className = "ts-dot";
    card.prepend(dot);
    overlay.appendChild(card);
  });

  // 3. 組み立て
  backdropElement.appendChild(overlay);
  document.body.appendChild(backdropElement);
  updateSelection();

  // ★重要: メニューに強制的にフォーカスを移動させる！
  // これにより、フォーカスがiframeにあってもここに戻ってくるので、Escキーが確実に効く
  overlay.focus();

  // 4. 外側クリック（バックドロップクリック）の監視
  backdropElement.addEventListener("mousedown", (e) => {
    // クリックされたのがバックドロップそのもの（＝メニューの外）ならキャンセル
    if (e.target === backdropElement) {
      e.preventDefault();
      cancelSwitcher();
    }
  });
}

function updateSelection() {
  // バックドロップ内の overlay を探す
  const overlay = document.getElementById("ts-overlay");
  if (!overlay) return;

  groups.forEach((_, index) => {
    const card = document.getElementById(`ts-card-${index}`);
    if (index === selectedIndex) {
      card.classList.add("selected");
    } else {
      card.classList.remove("selected");
    }
  });
}

function closeUI() {
  isSwitcherOpen = false;
  if (backdropElement) {
    document.body.removeChild(backdropElement);
    backdropElement = null;
  }
}

// ユーティリティ
function getColorCode(name) {
  const colors = {
    grey: "#dadce0", blue: "#8ab4f8", red: "#f28b82",
    yellow: "#fdd663", green: "#81c995", pink: "#ff8bcb",
    purple: "#c58af9", cyan: "#78d9ec", orange: "#fcad70"
  };
  return colors[name] || "#999";
}

function hexToRgba(hex, alpha) {
  let c = hex.substring(1).split('');
  if(c.length== 3){ c= [c[0], c[0], c[1], c[1], c[2], c[2]]; }
  c= '0x'+c.join('');
  return 'rgba('+[(c>>16)&255, (c>>8)&255, c&255].join(',')+','+alpha+')';
}