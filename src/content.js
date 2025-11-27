console.log("=== content.js 読み込み完了 ===");

let isSwitcherOpen = false;
let groups = [];
let selectedIndex = 0;
let overlayElement = null;

// === 起動ロジック (共通) ===
async function startSwitcher(reverse = false) {
  if (isSwitcherOpen) return;

  try {
    const response = await chrome.runtime.sendMessage({ action: "getGroups" });
    if (chrome.runtime.lastError) return;

    if (response && response.groups && response.groups.length > 0) {
      isSwitcherOpen = true;
      groups = response.groups;
      
      // 初期選択: グループがあれば直前([1])、なければ[0]
      if (groups.length > 1) {
        selectedIndex = reverse ? groups.length - 1 : 1;
      } else {
        selectedIndex = 0;
      }
      
      showOverlay();
    }
  } catch (e) { console.error(e); }
}

// === キーボード監視 ===
document.addEventListener("keydown", (e) => {
  if (e.altKey && e.code === "KeyQ") {
    
    e.preventDefault();
    e.stopImmediatePropagation();
        
    if (!isSwitcherOpen) {
      startSwitcher(e.shiftKey);
    } else {
      // 開いている時: Shiftで戻る、なしで進む
      if (e.shiftKey) {
        selectedIndex = (selectedIndex - 1 + groups.length) % groups.length;
      } else {
        selectedIndex = (selectedIndex + 1) % groups.length;
      }
      updateSelection();
    }
  }
}, true);

// === キー離脱監視 (決定) ===
document.addEventListener("keyup", (e) => {
  if (e.key === "Alt" && isSwitcherOpen) {
    executeSwitch();
  }
}, true);

// 切り替え実行
function executeSwitch() {
  const selectedGroup = groups[selectedIndex];
  if (selectedGroup) {
    chrome.runtime.sendMessage({ action: "switchToGroup", groupId: selectedGroup.id });
  }
  closeOverlay();
}

// === UI表示 (CSSクラス方式に変更) ===
function showOverlay() {
  if (overlayElement) document.body.removeChild(overlayElement);
  
  overlayElement = document.createElement("div");
  overlayElement.id = "ts-overlay"; // CSSのIDを指定

  groups.forEach((group, index) => {
    const card = document.createElement("div");
    card.id = `ts-card-${index}`;
    card.className = "ts-card"; // CSSのクラスを指定
    card.innerText = group.title;
    
    // ★ここがプロ技：CSS変数をセットする★
    // これにより、style.css 側で var(--group-color) としてこの色を使えるようになります
    const colorCode = getColorCode(group.color);
    card.style.setProperty("--group-color", colorCode);
    card.style.setProperty("--group-bg-color", hexToRgba(colorCode, 0.2));

    // マウスホバー
    card.addEventListener("mouseenter", () => {
      selectedIndex = index;
      updateSelection();
    });

    // クリック
    card.addEventListener("click", () => {
      selectedIndex = index;
      executeSwitch();
    });

    // アイコン
    const dot = document.createElement("span");
    dot.className = "ts-dot"; // CSSのクラスを指定
    card.prepend(dot);

    overlayElement.appendChild(card);
  });

  document.body.appendChild(overlayElement);
  updateSelection();
}

function updateSelection() {
  if (!overlayElement) return;
  groups.forEach((_, index) => {
    const card = document.getElementById(`ts-card-${index}`);
    
    // クラスの付け外しだけで見た目を変える
    if (index === selectedIndex) {
      card.classList.add("selected");
    } else {
      card.classList.remove("selected");
    }
  });
}

function closeOverlay() {
  isSwitcherOpen = false;
  if (overlayElement) {
    document.body.removeChild(overlayElement);
    overlayElement = null;
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