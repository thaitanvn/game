/* =========================
   Luyện gõ 10 ngón (Tiếng Việt)
   BẢN 99.9% (anti-IME/UniKey rollback):
   - KHÔNG phạt theo từng ký tự
   - CHỈ chấm khi kết thúc TỪ (Space) hoặc DẤU CÂU (, . ! ? : ;)
   - Khi chấm: so sánh "chữ gốc không dấu" (an toàn Telex)
   - Hết câu: yêu cầu đúng 100% mới qua câu
     (Sai dấu: nhắc sửa, KHÔNG trừ lượt sai)
========================= */

(() => {
  // ===== DOM =====
  const elTimeLeft = document.getElementById("timeLeft");
  const elLives = document.getElementById("lives");
  const elGameState = document.getElementById("gameState");

  const elPreStartPanel = document.getElementById("preStartPanel");
  const elPracticeCount = document.getElementById("practiceCount");
  const elPracticeNote = document.getElementById("practiceNote");

  const elTargetText = document.getElementById("targetText");
  const elTypingInput = document.getElementById("typingInput");
  const elMsg = document.getElementById("msg");

  const btnStart = document.getElementById("btnStart");
  const btnReset = document.getElementById("btnReset");

  const elVirtualKeyboard = document.getElementById("virtualKeyboard");
  const elFingerHint = document.getElementById("fingerHint");
  const elNextKeyHint = document.getElementById("nextKeyHint");

  // ===== CONFIG =====
  const TOTAL_TIME_SEC = 60;
  const MAX_LIVES = 5;

  // ký tự dùng để "chấm theo từ"
  const COMMIT_CHARS = new Set([" ", ",", ".", "!", "?", ":", ";"]);
  const END_SENTENCE_CHARS = new Set([".", "!", "?", "…"]);

  const SENTENCES = [
    "Mặt trời như quả bóng lửa, rải ánh vàng lên mái nhà nhỏ.",
    "Buổi chiều, ánh hoàng hôn nhuộm vàng mái nhà nhỏ.",
    "Dòng sông lấp lánh, sáng như dải bạc dưới nắng trưa.",
    "Con đường nhỏ trước nhà cong cong như dải lụa mềm.",
    "Bàn tay em gõ đều, như nhịp bước chân trên đường.",
    "Cô giáo nhẹ nhàng giảng bài bằng giọng nói ấm áp.",
    "Tiếng chim líu lo, như bản nhạc nhỏ giữa trời xanh.",
    "Giọt mưa tí tách, như ai gõ cửa khung cửa sổ.",
    "Lá bàng đỏ rực, như đốm lửa nhỏ trong gió heo may.",
    "Bầu trời trong veo, xanh như tấm kính vừa lau sạch.",
    "Sóng biển vỗ bờ, như tiếng trống rộn ràng gọi hè về.",
    "Hoa phượng nở, đỏ như chiếc khăn quàng của tuổi học trò."
  ];

  // ===== STATE =====
  let timeLeft = TOTAL_TIME_SEC;
  let lives = MAX_LIVES;
  let gameRunning = false;

  let totalToPractice = 5;
  let currentIndex = 0;
  let currentSentence = "";
  let timerId = null;

  // anti double-penalty: mỗi lần commit chỉ phạt 1 lần
  let lastCommitTypedLen = -1;

  // ===== KEYBOARD =====
  const KEY_ROWS = [
    ["Q","W","E","R","T","Y","U","I","O","P"],
    ["A","S","D","F","G","H","J","K","L"],
    ["Z","X","C","V","B","N","M",",",".","/"],
    ["SPACE","BACKSPACE"]
  ];
  const keyEls = new Map();

  // ===== FINGER MAP =====
  const fingerMap = {
    "Q":"L1","A":"L1","Z":"L1",
    "W":"L2","S":"L2","X":"L2",
    "E":"L3","D":"L3","C":"L3",
    "R":"L4","F":"L4","V":"L4","T":"L4","G":"L4","B":"L4",
    "Y":"R4","H":"R4","N":"R4",
    "U":"R3","J":"R3","M":"R3",
    "I":"R2","K":"R2",",":"R2",
    "O":"R1","L":"R1",".":"R1","P":"R1","/":"R1",
    "SPACE":"L5"
  };

  const fingerName = {
    "L1":"Tay trái – Ngón út",
    "L2":"Tay trái – Ngón áp út",
    "L3":"Tay trái – Ngón giữa",
    "L4":"Tay trái – Ngón trỏ",
    "L5":"Tay trái – Ngón cái",
    "R1":"Tay phải – Ngón út",
    "R2":"Tay phải – Ngón áp út",
    "R3":"Tay phải – Ngón giữa",
    "R4":"Tay phải – Ngón trỏ",
    "R5":"Tay phải – Ngón cái"
  };

  // ===== HELPERS =====
  function clampInt(v, min, max, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.trunc(n)));
  }

  function pickSentences(k) {
    const arr = [...SENTENCES];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    const out = [];
    for (let i = 0; i < k; i++) out.push(arr[i % arr.length]);
    return out;
  }

  function stripVN(s) {
    if (!s) return "";
    return s
      .toLowerCase()
      .replace(/đ/g, "d")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function normalizeToKey(ch) {
    if (!ch) return null;
    if (ch === " ") return "SPACE";
    if (ch === "," || ch === "." || ch === "/") return ch;

    const lower = ch.toLowerCase();
    if (lower === "đ") return "D";

    const stripped = lower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const base = stripped[0];
    if (base >= "a" && base <= "z") return base.toUpperCase();
    return null;
  }

  function clearActiveFinger() {
    document.querySelectorAll(".finger.active").forEach(el => el.classList.remove("active"));
  }
  function setActiveFinger(code) {
    clearActiveFinger();
    if (!code) return;
    const el = document.querySelector(`.finger[data-f="${code}"]`);
    if (el) el.classList.add("active");
  }

  function clearKeyHighlights() {
    keyEls.forEach(el => el.classList.remove("next", "pressed"));
  }
  function setNextKeyHighlight(keyLabel) {
    clearKeyHighlights();
    const el = keyEls.get(keyLabel);
    if (el) el.classList.add("next");
  }
  function pressKeyFlash(keyLabel) {
    const el = keyEls.get(keyLabel);
    if (!el) return;
    el.classList.add("pressed");
    setTimeout(() => el.classList.remove("pressed"), 120);
  }

  // ===== UI RENDER =====
  function renderTarget(sentence, typed) {
    elTargetText.innerHTML = "";
    for (let i = 0; i < sentence.length; i++) {
      const span = document.createElement("span");
      span.className = "char";
      span.textContent = sentence[i];

      if (i < typed.length && typed[i] === sentence[i]) span.classList.add("ok");
      if (i === typed.length) span.classList.add("focus");

      elTargetText.appendChild(span);
    }
  }

  function buildVirtualKeyboard() {
    elVirtualKeyboard.innerHTML = "";
    keyEls.clear();

    KEY_ROWS.forEach(row => {
      const rowEl = document.createElement("div");
      rowEl.className = "vk-row";
      row.forEach(label => {
        const keyEl = document.createElement("div");
        keyEl.className = "vk-key";

        if (label === "SPACE") {
          keyEl.textContent = "Space";
          keyEl.classList.add("space");
        } else if (label === "BACKSPACE") {
          keyEl.textContent = "Xóa";
          keyEl.classList.add("wide");
        } else {
          keyEl.textContent = label;
        }

        rowEl.appendChild(keyEl);
        keyEls.set(label, keyEl);
      });
      elVirtualKeyboard.appendChild(rowEl);
    });
  }

  function updateHints(typedText) {
    const idx = typedText.length;
    const expectedChar = currentSentence[idx] || "";
    const keyLabel = normalizeToKey(expectedChar);

    if (elNextKeyHint) {
      const b = elNextKeyHint.querySelector("b");
      if (b) b.textContent = expectedChar ? (keyLabel === "SPACE" ? "Space" : expectedChar) : "—";
    }

    if (keyLabel) setNextKeyHighlight(keyLabel);
    else clearKeyHighlights();

    let fingerCode = null;
    if (keyLabel) fingerCode = fingerMap[keyLabel] || null;

    if (elFingerHint) {
      const b = elFingerHint.querySelector("b");
      if (b) b.textContent = fingerCode ? (fingerName[fingerCode] || "—") : "—";
    }
    setActiveFinger(fingerCode);
  }

  // ===== GAME =====
  let practiceList = [];

  function loadSentence() {
    currentSentence = practiceList[currentIndex] || "";
    elTypingInput.value = "";
    lastCommitTypedLen = -1;

    renderTarget(currentSentence, "");
    updateHints("");
    elMsg.textContent = `Bắt đầu! (Câu ${currentIndex + 1}/${totalToPractice})`;
  }

  function startTimer() {
    stopTimer();
    timeLeft = TOTAL_TIME_SEC;
    elTimeLeft.textContent = String(timeLeft);

    timerId = setInterval(() => {
      if (!gameRunning) return;
      timeLeft--;
      elTimeLeft.textContent = String(timeLeft);
      if (timeLeft <= 0) finishGame("Hết giờ!");
    }, 1000);
  }

  function stopTimer() {
    if (timerId) clearInterval(timerId);
    timerId = null;
  }

  function startGame() {
    totalToPractice = clampInt(elPracticeCount?.value, 1, 30, 5);
    if (elPracticeCount) elPracticeCount.value = String(totalToPractice);

    practiceList = pickSentences(totalToPractice);
    currentIndex = 0;

    lives = MAX_LIVES;
    elLives.textContent = String(lives);

    gameRunning = true;
    elGameState.textContent = "Đang luyện";

    if (elPreStartPanel) elPreStartPanel.style.display = "none";

    elTypingInput.disabled = false;
    elTypingInput.focus();

    loadSentence();
    startTimer();
  }

  function resetGame() {
    stopTimer();
    gameRunning = false;

    elGameState.textContent = "Chưa bắt đầu";
    timeLeft = TOTAL_TIME_SEC;
    elTimeLeft.textContent = String(timeLeft);

    lives = MAX_LIVES;
    elLives.textContent = String(lives);

    if (elPreStartPanel) elPreStartPanel.style.display = "grid";

    elTypingInput.value = "";
    elTypingInput.disabled = true;

    elTargetText.innerHTML = "";
    elMsg.textContent = "";

    clearKeyHighlights();
    clearActiveFinger();

    if (elFingerHint?.querySelector("b")) elFingerHint.querySelector("b").textContent = "—";
    if (elNextKeyHint?.querySelector("b")) elNextKeyHint.querySelector("b").textContent = "—";

    currentSentence = "";
    lastCommitTypedLen = -1;
  }

  function finishGame(reason) {
    gameRunning = false;
    elGameState.textContent = "Kết thúc";
    stopTimer();

    elTypingInput.disabled = true;
    clearKeyHighlights();
    clearActiveFinger();

    elMsg.textContent = `🏁 ${reason} (Bấm Reset để luyện lại)`;
  }

  // ===== CORE: COMMIT-CHECK =====
  function isCommitKeyChar(ch) {
    return COMMIT_CHARS.has(ch);
  }

  function shouldCommitNow(prevValue, currValue) {
    // commit khi:
    // - vừa tăng độ dài và ký tự mới là commit char (space/dấu câu)
    // - hoặc người dùng paste/auto-correct làm thay đổi và trong chuỗi có commit char mới ở cuối
    if (currValue.length <= prevValue.length) return false;
    const newChar = currValue[currValue.length - 1];
    return isCommitKeyChar(newChar);
  }

  function basePrefixOk(typed, target) {
    const typedBase = stripVN(typed);
    const targetBasePrefix = stripVN(target).slice(0, typedBase.length);
    return typedBase === targetBasePrefix;
  }

  function handleCommitCheck(typed) {
    // Chỉ gọi khi vừa gõ Space/dấu câu
    // Nếu prefix base không khớp -> lỗi thật -> trừ sai
    if (!basePrefixOk(typed, currentSentence)) {
      if (typed.length !== lastCommitTypedLen) {
        lives--;
        elLives.textContent = String(lives);
        lastCommitTypedLen = typed.length;
      }
      elMsg.textContent = `Sai rồi 😅 Bé sửa lại từ vừa gõ nhé. (Còn ${lives} lượt sai)`;
      if (lives <= 0) finishGame("Hết lượt sai!");
      return;
    }

    // đúng base -> không trừ
    lastCommitTypedLen = -1;

    // Nếu đã đủ độ dài câu: yêu cầu đúng 100% để qua câu
    if (typed.length === currentSentence.length) {
      if (typed === currentSentence) {
        currentIndex++;
        if (currentIndex >= totalToPractice) {
          finishGame(`Hoàn thành ${totalToPractice} câu! Bé giỏi quá!`);
        } else {
          loadSentence();
        }
      } else {
        elMsg.textContent = `Gần đúng rồi ✨ Bé kiểm tra lại DẤU và DẤU CÂU nhé (không bị trừ lượt sai).`;
      }
      return;
    }

    elMsg.textContent = `Tốt lắm! Tiếp tục nhé ✨ (Câu ${currentIndex + 1}/${totalToPractice})`;
  }

  // ===== INPUT HANDLING =====
  let prevValue = "";

  function handleInput() {
    if (!gameRunning) return;

    let typed = elTypingInput.value || "";

    // chặn vượt độ dài câu
    if (typed.length > currentSentence.length) {
      typed = typed.slice(0, currentSentence.length);
      elTypingInput.value = typed;
    }

    renderTarget(currentSentence, typed);
    updateHints(typed);

    // flash phím
    const lastChar = typed[typed.length - 1];
    const keyLabel = normalizeToKey(lastChar);
    if (keyLabel) pressKeyFlash(keyLabel);

    // Nếu gõ xong 1 từ (space/dấu câu) -> commit check
    if (shouldCommitNow(prevValue, typed)) {
      handleCommitCheck(typed);
    } else {
      // Trong lúc đang gõ từ: KHÔNG phạt
      // Chỉ nhắc nhẹ nếu prefix base đã lệch (để biết sớm) nhưng không trừ
      if (!basePrefixOk(typed, currentSentence)) {
        elMsg.textContent = `Hình như sai chữ rồi 😅 Bé nhìn lại từ đang gõ nhé (chưa bị trừ lượt sai).`;
      } else {
        elMsg.textContent = `Đang gõ... (Câu ${currentIndex + 1}/${totalToPractice})`;
      }
    }

    prevValue = typed;
  }

  // ===== EVENTS =====
  btnStart?.addEventListener("click", () => {
    if (!gameRunning) startGame();
    else elTypingInput?.focus();
  });

  btnReset?.addEventListener("click", resetGame);

  elTypingInput?.addEventListener("input", handleInput);

  elTypingInput?.addEventListener("keydown", (e) => {
    if (!gameRunning) return;
    if (e.key === "Backspace") pressKeyFlash("BACKSPACE");
  });

  // ===== INIT =====
  buildVirtualKeyboard();
  resetGame();
  prevValue = "";

  if (elPracticeCount && elPracticeNote) {
    elPracticeCount.addEventListener("input", () => {
      const k = clampInt(elPracticeCount.value, 1, 30, 5);
      elPracticeNote.textContent = `Ví dụ: ${k} (bé sẽ luyện ${k} câu liên tiếp)`;
    });
  }
})();
