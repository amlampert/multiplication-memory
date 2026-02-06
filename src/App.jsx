import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import logo from "./assets/kokoro-logo.png";

const STORAGE_KEY = "mult_game_v11";
const TTL_MS = 24 * 60 * 60 * 1000;

const MIN_LEVEL = 0;
const MAX_LEVEL = 12;

const CORRECTIONS_REQUIRED = 3;
const CURRENT_REVIEW_REPEATS = 3;
const NEXT_LEVEL_HIDDEN_REPEATS = 3;

function newLevelMaxN(level) {
  return level;
}

/* ------------------ storage ------------------ */
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);

    if (!s?.expiresAt || Date.now() > s.expiresAt) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    if (typeof s.level !== "number") return null;

    if (!s.newStatus || typeof s.newStatus !== "object") s.newStatus = {};
    if (!Array.isArray(s.missedEver)) s.missedEver = [];
    if (!Array.isArray(s.corrections)) s.corrections = [];
    if (!Array.isArray(s.reviewQueue)) s.reviewQueue = [];
    if (typeof s.alt !== "number") s.alt = 0;

    if (s.level > MAX_LEVEL) return null;

    return s;
  } catch {
    return null;
  }
}

function saveState(next) {
  const state = {
    level: next.level,
    newStatus: next.newStatus || {},
    missedEver: Array.isArray(next.missedEver) ? next.missedEver : [],
    corrections: Array.isArray(next.corrections) ? next.corrections : [],
    reviewQueue: Array.isArray(next.reviewQueue) ? next.reviewQueue : [],
    alt: typeof next.alt === "number" ? next.alt : 0,
    expiresAt: Date.now() + TTL_MS,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  return state;
}

function clearState() {
  localStorage.removeItem(STORAGE_KEY);
}

/* ------------------ helpers ------------------ */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function keyFor(a, b) {
  return `${a}x${b}`;
}

function normalizeFact(a, b) {
  return a <= b ? { a, b } : { a: b, b: a };
}

function makeFact(a, b) {
  const n = normalizeFact(a, b);
  return { a: n.a, b: n.b, answer: n.a * n.b };
}

function buildNewStatus(level) {
  const maxN = newLevelMaxN(level);
  const status = {};
  for (let n = 0; n <= maxN; n++) {
    const f = makeFact(n, level);
    status[keyFor(f.a, f.b)] = false;
  }
  return status;
}

function allDone(statusObj) {
  const vals = Object.values(statusObj || {});
  return vals.length > 0 && vals.every(Boolean);
}

function pickRandomRemainingNew(level, statusObj) {
  const keys = Object.keys(statusObj || {});
  const remaining = keys.filter((k) => statusObj[k] === false);
  if (remaining.length === 0) return null;

  const pickKey = remaining[randomInt(0, remaining.length - 1)];
  const [aStr, bStr] = pickKey.split("x");
  return makeFact(Number(aStr), Number(bStr));
}

function pickRandomAny(level) {
  const a = randomInt(0, level);
  const b = randomInt(0, level);
  return makeFact(a, b);
}

/* ------------------ sounds ------------------ */
function beep(ctx, freq, durMs, type = "sine", gain = 0.03) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = gain;
  o.connect(g);
  g.connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + durMs / 1000);
}

function playSuccess(ctx) {
  beep(ctx, 660, 60, "triangle", 0.028);
  setTimeout(() => beep(ctx, 880, 70, "triangle", 0.024), 40);
}

function playFail(ctx) {
  beep(ctx, 196, 120, "sine", 0.026);
  setTimeout(() => beep(ctx, 155, 140, "sine", 0.022), 45);
}

function playCelebrate(ctx) {
  const notes = [523, 659, 784, 1046, 784, 988];
  notes.forEach((f, i) =>
    setTimeout(() => beep(ctx, f, 80, "triangle", 0.03), i * 75),
  );
}

// light “action/click” sound for UI actions
function playAction(ctx) {
  beep(ctx, 520, 45, "triangle", 0.02);
  setTimeout(() => beep(ctx, 740, 45, "triangle", 0.018), 35);
}

/* ------------------ mobile keypad ------------------ */
function isCoarsePointer() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

function Keypad({ onDigit, onBackspace, onClear, onSubmit, disabled }) {
  const btn = (label, onClick, extraClass = "") => (
    <button
      type="button"
      className={`kpBtn ${extraClass}`}
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  );

  return (
    <div className="keypad" aria-label="Number keypad">
      <div className="kpGrid">
        {btn("1", () => onDigit("1"))}
        {btn("2", () => onDigit("2"))}
        {btn("3", () => onDigit("3"))}

        {btn("4", () => onDigit("4"))}
        {btn("5", () => onDigit("5"))}
        {btn("6", () => onDigit("6"))}

        {btn("7", () => onDigit("7"))}
        {btn("8", () => onDigit("8"))}
        {btn("9", () => onDigit("9"))}

        {btn("Clear", onClear, "kpWide")}
        {btn("0", () => onDigit("0"))}
        {btn("⌫", onBackspace)}
      </div>

      <div className="kpSubmitRow">
        {btn("Check", onSubmit, "kpSubmit")}
      </div>
    </div>
  );
}

/* ------------------ correction pure updates ------------------ */
function ensureCorrectionEntryPure(corrections, fact) {
  const k = keyFor(fact.a, fact.b);
  const idx = corrections.findIndex((c) => c.key === k);
  const next = [...corrections];
  if (idx === -1)
    next.push({
      key: k,
      a: fact.a,
      b: fact.b,
      got: 0,
      required: CORRECTIONS_REQUIRED,
    });
  else next[idx] = { ...next[idx], required: CORRECTIONS_REQUIRED };
  return next;
}

function resetCorrectionProgressPure(corrections, fact) {
  const k = keyFor(fact.a, fact.b);
  const idx = corrections.findIndex((c) => c.key === k);
  if (idx === -1) return corrections;
  const next = [...corrections];
  next[idx] = { ...next[idx], got: 0, required: CORRECTIONS_REQUIRED };
  return next;
}

function creditCorrectionPure(corrections, fact) {
  const k = keyFor(fact.a, fact.b);
  const idx = corrections.findIndex((c) => c.key === k);
  if (idx === -1) return corrections;
  const next = [...corrections];
  const cur = next[idx];
  const got = Math.min(cur.required, (cur.got || 0) + 1);
  if (got >= cur.required) next.splice(idx, 1);
  else next[idx] = { ...cur, got };
  return next;
}

export default function App() {
  const saved = useMemo(() => loadState(), []);

  const [level, setLevel] = useState(saved?.level ?? null);
  const [newStatus, setNewStatus] = useState(() => {
    if (saved?.level == null) return {};
    const desired = buildNewStatus(saved.level);
    const merged = { ...desired, ...(saved?.newStatus || {}) };
    for (const k of Object.keys(desired)) if (!(k in merged)) merged[k] = false;
    for (const k of Object.keys(merged)) if (!(k in desired)) delete merged[k];
    return merged;
  });

  const [missedEver, setMissedEver] = useState(saved?.missedEver ?? []);
  const [corrections, setCorrections] = useState(saved?.corrections ?? []);
  const [reviewQueue, setReviewQueue] = useState(saved?.reviewQueue ?? []);
  const [alt, setAlt] = useState(saved?.alt ?? 0);

  const [question, setQuestion] = useState(null);
  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState("");

  // quick correct indicator
  const [justCorrect, setJustCorrect] = useState(false);

  // ---- NO BACK-TO-BACK REPEATS (except the intentional immediate re-ask after a miss) ----
  const lastQuestionKeyRef = useRef(null);

  // After the immediate re-ask, force the next normal question to be NEW.
  const forceNextIsNewRef = useRef(false);

  // wrong modal
  const [wrongModalOpen, setWrongModalOpen] = useState(false);
  const [wrongModalFact, setWrongModalFact] = useState(null);
  const [wrongEnterArmed, setWrongEnterArmed] = useState(false);
  const wrongArmTimerRef = useRef(null);

  // level-up modal
  const [celebrateOpen, setCelebrateOpen] = useState(false);
  const [celebrateNextLevel, setCelebrateNextLevel] = useState(null);
  const [celebrateEnterArmed, setCelebrateEnterArmed] = useState(false);
  const celebrateArmTimerRef = useRef(null);

  // game over screen
  const [gameOver, setGameOver] = useState(false);
  const [gameOverEnterArmed, setGameOverEnterArmed] = useState(false);
  const gameOverArmTimerRef = useRef(null);

  const inputRef = useRef(null);
  const audioRef = useRef(null);

  // mobile keypad preference
  const [useKeypad, setUseKeypad] = useState(() => isCoarsePointer());

  function getAudio() {
    if (!audioRef.current)
      audioRef.current = new (window.AudioContext ||
        window.webkitAudioContext)();
    audioRef.current.resume?.();
    return audioRef.current;
  }

  useEffect(() => {
    const onResize = () => setUseKeypad(isCoarsePointer());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function kpActionSound() {
    playAction(getAudio());
  }

  function kpDigit(d) {
    if (wrongModalOpen || celebrateOpen) return;
    kpActionSound();
    setInput((prev) => (prev + d).slice(0, 4));
    inputRef.current?.blur();
  }

  function kpBackspace() {
    if (wrongModalOpen || celebrateOpen) return;
    kpActionSound();
    setInput((prev) => prev.slice(0, -1));
    inputRef.current?.blur();
  }

  function kpClear() {
    if (wrongModalOpen || celebrateOpen) return;
    kpActionSound();
    setInput("");
    inputRef.current?.blur();
  }

  function kpSubmit() {
    if (wrongModalOpen || celebrateOpen) return;
    kpActionSound();
    submit();
  }

  useEffect(() => {
    if (level == null) return;
    saveState({ level, newStatus, missedEver, corrections, reviewQueue, alt });
  }, [level, newStatus, missedEver, corrections, reviewQueue, alt]);

  // ✅ Fix: after refresh, if we have a level but no current question, generate one.
  useEffect(() => {
    if (level == null) return;
    if (gameOver || celebrateOpen || wrongModalOpen) return;
    if (question) return;

    const q = pickRandomRemainingNew(level, newStatus) || pickRandomAny(level);
    setQuestion(q);
    lastQuestionKeyRef.current = q ? keyFor(q.a, q.b) : null;
  }, [level, newStatus, question, gameOver, celebrateOpen, wrongModalOpen]);

  useEffect(() => {
    if (
      !wrongModalOpen &&
      !celebrateOpen &&
      !gameOver &&
      level != null &&
      inputRef.current &&
      !useKeypad
    ) {
      inputRef.current.focus();
    }
  }, [wrongModalOpen, celebrateOpen, gameOver, level, question, useKeypad]);

  // ---- Arm Enter for WRONG modal
  useEffect(() => {
    if (!wrongModalOpen) {
      setWrongEnterArmed(false);
      if (wrongArmTimerRef.current) clearTimeout(wrongArmTimerRef.current);
      wrongArmTimerRef.current = null;
      return;
    }
    setWrongEnterArmed(false);
    if (wrongArmTimerRef.current) clearTimeout(wrongArmTimerRef.current);
    wrongArmTimerRef.current = setTimeout(() => setWrongEnterArmed(true), 350);

    return () => {
      if (wrongArmTimerRef.current) clearTimeout(wrongArmTimerRef.current);
      wrongArmTimerRef.current = null;
    };
  }, [wrongModalOpen]);

  useEffect(() => {
    if (!wrongModalOpen) return;
    const handler = (e) => {
      if (e.key === "Enter") {
        if (!wrongEnterArmed) return;
        e.preventDefault();
        wrongModalGotIt();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wrongModalOpen, wrongEnterArmed, wrongModalFact]);

  // ---- Arm Enter for CELEBRATE modal
  useEffect(() => {
    if (!celebrateOpen) {
      setCelebrateEnterArmed(false);
      if (celebrateArmTimerRef.current)
        clearTimeout(celebrateArmTimerRef.current);
      celebrateArmTimerRef.current = null;
      return;
    }
    setCelebrateEnterArmed(false);
    if (celebrateArmTimerRef.current)
      clearTimeout(celebrateArmTimerRef.current);
    celebrateArmTimerRef.current = setTimeout(
      () => setCelebrateEnterArmed(true),
      1000,
    );

    return () => {
      if (celebrateArmTimerRef.current)
        clearTimeout(celebrateArmTimerRef.current);
      celebrateArmTimerRef.current = null;
    };
  }, [celebrateOpen]);

  useEffect(() => {
    if (!celebrateOpen) return;
    const handler = (e) => {
      if (e.key === "Enter") {
        if (!celebrateEnterArmed) return;
        e.preventDefault();
        closeCelebrate();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebrateOpen, celebrateEnterArmed, celebrateNextLevel]);

  // ---- Arm Enter for GAME OVER reset
  useEffect(() => {
    if (!gameOver) {
      setGameOverEnterArmed(false);
      if (gameOverArmTimerRef.current)
        clearTimeout(gameOverArmTimerRef.current);
      gameOverArmTimerRef.current = null;
      return;
    }
    setGameOverEnterArmed(false);
    if (gameOverArmTimerRef.current) clearTimeout(gameOverArmTimerRef.current);
    gameOverArmTimerRef.current = setTimeout(
      () => setGameOverEnterArmed(true),
      1000,
    );

    return () => {
      if (gameOverArmTimerRef.current)
        clearTimeout(gameOverArmTimerRef.current);
      gameOverArmTimerRef.current = null;
    };
  }, [gameOver]);

  useEffect(() => {
    if (!gameOver) return;
    const handler = (e) => {
      if (e.key === "Enter") {
        if (!gameOverEnterArmed) return;
        e.preventDefault();
        resetAll(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameOver, gameOverEnterArmed]);

  function resetAll(playSound = false) {
    if (playSound) playAction(getAudio());
    clearState();
    setLevel(null);
    setNewStatus({});
    setMissedEver([]);
    setCorrections([]);
    setReviewQueue([]);
    setAlt(0);
    setQuestion(null);
    setInput("");
    setFeedback("");
    setWrongModalOpen(false);
    setWrongModalFact(null);
    setCelebrateOpen(false);
    setCelebrateNextLevel(null);
    setGameOver(false);
    setJustCorrect(false);
    lastQuestionKeyRef.current = null;
    forceNextIsNewRef.current = false;
  }

  function startAtLevel(lvl) {
    playAction(getAudio());
    const clamped = Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, lvl));
    const ns = buildNewStatus(clamped);
    setLevel(clamped);
    setNewStatus(ns);
    setMissedEver([]);
    setCorrections([]);
    setReviewQueue([]);
    setAlt(0);

    const q = pickRandomRemainingNew(clamped, ns) || pickRandomAny(clamped);
    setQuestion(q);
    lastQuestionKeyRef.current = q ? keyFor(q.a, q.b) : null;

    setInput("");
    setFeedback("");
    setWrongModalOpen(false);
    setWrongModalFact(null);
    setCelebrateOpen(false);
    setCelebrateNextLevel(null);
    setGameOver(false);
    setJustCorrect(false);
    forceNextIsNewRef.current = false;

    saveState({
      level: clamped,
      newStatus: ns,
      missedEver: [],
      corrections: [],
      reviewQueue: [],
      alt: 0,
    });
  }

  function updateMissedEverOnWrong(f) {
    const k = keyFor(f.a, f.b);
    const idx = missedEver.findIndex((m) => m.key === k);
    const updated = [...missedEver];
    if (idx === -1)
      updated.push({ key: k, a: f.a, b: f.b, wrongCount: 1, rightCount: 0 });
    else
      updated[idx] = {
        ...updated[idx],
        wrongCount: (updated[idx].wrongCount || 0) + 1,
      };
    setMissedEver(updated);
  }

  function updateMissedEverOnRight(f) {
    const k = keyFor(f.a, f.b);
    const idx = missedEver.findIndex((m) => m.key === k);
    if (idx === -1) return;
    const updated = [...missedEver];
    updated[idx] = {
      ...updated[idx],
      rightCount: (updated[idx].rightCount || 0) + 1,
    };
    setMissedEver(updated);
  }

  function scheduleCurrentLevelRepeats(f) {
    const k = keyFor(f.a, f.b);
    let q = reviewQueue.filter(
      (x) =>
        !(x.key === k && x.activateAtLevel === level && x.hidden !== true),
    );
    for (let i = 1; i <= CURRENT_REVIEW_REPEATS; i++) {
      q.push({
        key: k,
        a: f.a,
        b: f.b,
        answer: f.answer,
        activateAtLevel: level,
        dueReviewTurns: i,
        hidden: false,
      });
    }
    setReviewQueue(q);
  }

  function scheduleNextLevelHiddenRepeats(f) {
    const k = keyFor(f.a, f.b);
    const activateAt = Math.min(MAX_LEVEL, level + 1);
    let q = reviewQueue.filter(
      (x) =>
        !(x.key === k && x.activateAtLevel === activateAt && x.hidden === true),
    );
    for (let i = 1; i <= NEXT_LEVEL_HIDDEN_REPEATS; i++) {
      q.push({
        key: k,
        a: f.a,
        b: f.b,
        answer: f.answer,
        activateAtLevel: activateAt,
        dueReviewTurns: i,
        hidden: true,
      });
    }
    setReviewQueue(q);
  }

  function popDueReviewItem() {
    const q0 = [...reviewQueue];
    const q1 = q0.map((x) =>
      x.activateAtLevel <= level
        ? { ...x, dueReviewTurns: x.dueReviewTurns - 1 }
        : x,
    );

    const findIdx = (wantHidden) =>
      q1.findIndex(
        (x) =>
          x.activateAtLevel <= level &&
          x.dueReviewTurns <= 0 &&
          !!x.hidden === wantHidden,
      );

    let idx = findIdx(false);
    if (idx === -1) idx = findIdx(true);

    if (idx === -1) {
      setReviewQueue(q1);
      return null;
    }

    const due = q1[idx];
    q1.splice(idx, 1);
    setReviewQueue(q1);

    return { fact: makeFact(due.a, due.b), hidden: !!due.hidden };
  }

  function pickNewLevelQuestion(nextLevel) {
    return (
      pickRandomRemainingNew(nextLevel, newStatus) || pickRandomAny(nextLevel)
    );
  }

  function pickReviewQuestion(nextLevel) {
    const due = popDueReviewItem();
    if (due?.fact) return { ...due.fact, __fromQueue: true, __hidden: due.hidden };

    if (corrections.length > 0) {
      const pick = corrections[randomInt(0, corrections.length - 1)];
      return makeFact(pick.a, pick.b);
    }

    if (missedEver.length > 0 && Math.random() < 0.2) {
      const pick = missedEver[randomInt(0, missedEver.length - 1)];
      return makeFact(pick.a, pick.b);
    }

    return pickRandomAny(nextLevel);
  }

  // HARD GUARANTEE: do not allow the next normal question to equal the previous question.
  // The ONLY exception is the intentional immediate re-ask after a miss.
  function chooseNonBackToBack(getCandidateFn, nextLevel) {
    const lastKey = lastQuestionKeyRef.current;

    for (let tries = 0; tries < 12; tries++) {
      const c = getCandidateFn(nextLevel);
      if (!c) return c;
      const ck = keyFor(c.a, c.b);
      if (!lastKey || ck !== lastKey) return c;
    }

    const last = lastKey;
    if (!last) return getCandidateFn(nextLevel);

    const remainingNew = Object.keys(newStatus || {}).filter(
      (k) => newStatus[k] === false,
    );
    const anyNew = remainingNew.find((k) => k !== last);
    if (anyNew) {
      const [aStr, bStr] = anyNew.split("x");
      return makeFact(Number(aStr), Number(bStr));
    }

    for (let tries = 0; tries < 24; tries++) {
      const r = pickRandomAny(nextLevel);
      if (keyFor(r.a, r.b) !== last) return r;
    }

    return getCandidateFn(nextLevel);
  }

  function nextQuestion(nextLevel = level) {
    if (nextLevel == null) return;

    let isNew = alt % 2 === 0;

    if (forceNextIsNewRef.current) {
      isNew = true;
      forceNextIsNewRef.current = false;
    }

    const q = isNew
      ? chooseNonBackToBack(pickNewLevelQuestion, nextLevel)
      : chooseNonBackToBack(pickReviewQuestion, nextLevel);

    setAlt((x) => x + 1);
    setInput("");
    setFeedback("");
    setQuestion(q);
    if (q) lastQuestionKeyRef.current = keyFor(q.a, q.b);
  }

  function tryGraduate(statusObj, correctionsList) {
    if (!allDone(statusObj)) return;
    if ((correctionsList || []).length > 0) {
      setFeedback("✅ Checklist done — finish Current Corrections to graduate.");
      return;
    }

    if (level === MAX_LEVEL) {
      playCelebrate(getAudio());
      setGameOver(true);
      return;
    }

    const nextLvl = Math.min(MAX_LEVEL, level + 1);
    playCelebrate(getAudio());
    setCelebrateNextLevel(nextLvl);
    setCelebrateOpen(true);
  }

  function completeAdvanceLevel() {
    const nextLvl = Math.min(MAX_LEVEL, level + 1);
    setLevel(nextLvl);
    const ns = buildNewStatus(nextLvl);
    setNewStatus(ns);
    setAlt(0);

    const q =
      chooseNonBackToBack(
        () => pickRandomRemainingNew(nextLvl, ns) || pickRandomAny(nextLvl),
        nextLvl,
      ) || (pickRandomRemainingNew(nextLvl, ns) || pickRandomAny(nextLvl));

    setQuestion(q);
    if (q) lastQuestionKeyRef.current = keyFor(q.a, q.b);

    setInput("");
    setFeedback("");
    setJustCorrect(false);
    forceNextIsNewRef.current = false;
  }

  function markChecklistCorrectIfApplicable(f, correctionsAfterThisSubmit) {
    const k = keyFor(f.a, f.b);
    if (!(k in (newStatus || {}))) return;

    if (newStatus[k] === true) {
      tryGraduate(newStatus, correctionsAfterThisSubmit);
      return;
    }
    const updated = { ...newStatus, [k]: true };
    setNewStatus(updated);
    tryGraduate(updated, correctionsAfterThisSubmit);
  }

  function triggerCorrectFlash() {
    setJustCorrect(true);
    window.setTimeout(() => setJustCorrect(false), 260);
  }

  function submit() {
    if (!question || level == null) return;
    const trimmed = input.trim();
    if (trimmed === "") return;

    const user = Number(trimmed);
    if (!Number.isFinite(user)) {
      setFeedback("Please enter a number.");
      return;
    }

    const ctx = getAudio();

    if (user === question.answer) {
      playSuccess(ctx);
      updateMissedEverOnRight(question);

      const k = keyFor(question.a, question.b);
      const wasInCorrections = corrections.some((c) => c.key === k);

      const nextCorrections = creditCorrectionEntryAndCleanup(corrections, question, wasInCorrections);
      setCorrections(nextCorrections);

      triggerCorrectFlash();
      markChecklistCorrectIfApplicable(question, nextCorrections);

      setFeedback("✅ Correct!");
      lastQuestionKeyRef.current = k;

      nextQuestion(level);
    } else {
      playFail(ctx);
      updateMissedEverOnWrong(question);

      let nextCorrections = ensureCorrectionEntryPure(corrections, question);
      nextCorrections = resetCorrectionProgressPure(nextCorrections, question);
      setCorrections(nextCorrections);

      scheduleCurrentLevelRepeats(question);
      scheduleNextLevelHiddenRepeats(question);

      setWrongModalFact(question);
      setWrongModalOpen(true);
      setFeedback("");
      setJustCorrect(false);
    }
  }

  // helper: credit correction and remove leftover current-level repeats when completed
  function creditCorrectionEntryAndCleanup(correctionsList, fact, wasInCorrections) {
    const k = keyFor(fact.a, fact.b);
    const nextCorrections = creditCorrectionPure(correctionsList, fact);

    const stillInCorrections = nextCorrections.some((c) => c.key === k);
    if (wasInCorrections && !stillInCorrections) {
      setReviewQueue((prev) =>
        prev.filter(
          (x) =>
            !(
              x.key === k &&
              x.activateAtLevel === level &&
              x.hidden === false
            ),
        ),
      );
    }
    return nextCorrections;
  }

  function onKeyDown(e) {
    if (e.key === "Enter") submit();
  }

  function wrongModalGotIt() {
    playAction(getAudio());
    setWrongModalOpen(false);
    setInput("");

    forceNextIsNewRef.current = true;

    setQuestion(wrongModalFact); // immediate re-ask (ONLY after miss)
    if (wrongModalFact)
      lastQuestionKeyRef.current = keyFor(wrongModalFact.a, wrongModalFact.b);

    setWrongModalFact(null);

    if (!useKeypad) setTimeout(() => inputRef.current?.focus(), 0);
  }

  function closeCelebrate() {
    playAction(getAudio());
    setCelebrateOpen(false);
    setCelebrateNextLevel(null);
    completeAdvanceLevel();
  }

  // ---- UI ----
  if (level == null) {
    return (
      <div className="wrap">
        <div className="centerTop">
          <img className="logoTop" src={logo} alt="Kokoro Tutoring" />
          <div className="gameTitle">Multiplication Memory</div>
        </div>

        <div className="card homeCard centerCard">
          <p className="sub centerText">
            Pick your starting level (highest number used).
          </p>
          <div className="levels centerRow">
            {Array.from(
              { length: MAX_LEVEL - MIN_LEVEL + 1 },
              (_, i) => i + MIN_LEVEL,
            ).map((n) => (
              <button
                key={n}
                className="btn levelBtn"
                onClick={() => startAtLevel(n)}
              >
                {n}
              </button>
            ))}
          </div>
          <p className="hint centerText">
            No login. Progress resets after 24 hours.
          </p>
        </div>
      </div>
    );
  }

  if (gameOver) {
    return (
      <div className="wrap">
        <div className="centerTop">
          <img className="logoTop" src={logo} alt="Kokoro Tutoring" />
          <div className="gameTitle">Multiplication Memory</div>
        </div>

        <div className="card centerCard mainCard gameOver">
          <div className="celebrateBig">🎉 GAME OVER! 🎉</div>
          <div className="celebrateText">
            You mastered levels 0–{MAX_LEVEL}. Incredible work!
          </div>
          <button
            className="btn primary modalBtn"
            onClick={() => resetAll(true)}
            disabled={!gameOverEnterArmed}
          >
            Reset
            <div className="tinyNote">[Enter]</div>
          </button>
          {!gameOverEnterArmed && <div className="tinyNote">One moment…</div>}
        </div>
      </div>
    );
  }

  const newKeys = Object.keys(newStatus || {});
  const checklistItems = newKeys
    .map((k) => {
      const [aStr, bStr] = k.split("x");
      const a = Number(aStr);
      const b = Number(bStr);
      const other = a === level ? b : a;
      return { k, other, done: newStatus[k] === true };
    })
    .sort((x, y) => x.other - y.other);

  const correctionClass = (c) => {
    const got = c.got || 0;
    if (got === 0) return "corr0";
    if (got === 1) return "corr1";
    if (got === 2) return "corr2";
    return "corr3";
  };

  return (
    <div className="wrap">
      <div className="centerTop">
        <img className="logoTop" src={logo} alt="Kokoro Tutoring" />
        <div className="gameTitle">Multiplication Memory</div>
      </div>

      <div className="card centerCard mainCard">
        <div className="metaRow centerRow">
          <div className="pill">Level: {level}</div>
          <button className="btn" onClick={() => resetAll(true)}>
            Reset
          </button>
        </div>

        <div className="question centerText">
          {question?.a} × {question?.b} = ?
        </div>

        <div
          className={`correctToast ${justCorrect ? "show" : ""}`}
          aria-live="polite"
        >
          ✅ Correct!
        </div>

        <div className="answerRow centerRow">
          <input
            ref={inputRef}
            className="input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            inputMode={useKeypad ? "none" : "numeric"}
            readOnly={useKeypad}
            onFocus={() => {
              if (useKeypad) inputRef.current?.blur();
            }}
            placeholder="Type answer"
            aria-label="Answer"
            disabled={wrongModalOpen || celebrateOpen}
          />
          <button
            className="btn primary checkBtn"
            onClick={submit}
            disabled={wrongModalOpen || celebrateOpen}
          >
            <div className="checkBtnText">Check</div>
            <div className="tinyNote">[Enter]</div>
          </button>
        </div>

        {useKeypad && (
          <Keypad
            onDigit={kpDigit}
            onBackspace={kpBackspace}
            onClear={kpClear}
            onSubmit={kpSubmit}
            disabled={wrongModalOpen || celebrateOpen}
          />
        )}

        <div className="feedback centerText">{feedback}</div>
      </div>

      <div className="belowGrid">
        <div className="card">
          <div className="sideTitle">Level Checklist</div>
          <div className="sideSub">Complete all facts with {level}.</div>

          <div className="checkCol">
            {checklistItems.map((item) => (
              <div
                key={item.k}
                className={`checkItem ${item.done ? "done" : ""}`}
              >
                <span className="checkMark">{item.done ? "✓" : "○"}</span>
                <span className="checkText">
                  {item.other}×{level}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="sideTitle negTitle">Current Corrections</div>
          {corrections.length === 0 ? (
            <div className="empty">None 🎉</div>
          ) : (
            <div className="list">
              {corrections
                .slice()
                .sort((a, b) => (b.got || 0) - (a.got || 0))
                .map((c) => (
                  <div
                    key={c.key}
                    className={`row negRow ${correctionClass(c)}`}
                  >
                    <div className="rowLeft">
                      {c.a}×{c.b}
                    </div>
                    <div className={`badge negBadge ${correctionClass(c)}`}>
                      {c.got || 0}/{c.required || CORRECTIONS_REQUIRED}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      <div className="card centerCard missedCard">
        <div className="sideTitle">All Missed Questions</div>
        {missedEver.length === 0 ? (
          <div className="empty">None 🎉</div>
        ) : (
          <div className="list">
            {missedEver
              .slice()
              .sort((a, b) => (b.wrongCount || 0) - (a.wrongCount || 0))
              .slice(0, 18)
              .map((m) => (
                <div key={m.key} className="row">
                  <div className="rowLeft">
                    {m.a}×{m.b}
                  </div>
                  <div className="badge">{m.wrongCount || 0} wrong</div>
                </div>
              ))}
          </div>
        )}
      </div>

      {wrongModalOpen && wrongModalFact && (
        <div className="modalOverlay" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modalTitle">Sorry, that’s incorrect!</div>
            <div className="modalText">
              Take a moment to memorize this fact, because we’ll show it to you
              again shortly:
            </div>
            <div className="modalFact">
              {wrongModalFact.a} × {wrongModalFact.b} = {wrongModalFact.answer}
            </div>
            <button
              className="btn primary modalBtn"
              onClick={wrongModalGotIt}
              disabled={!wrongEnterArmed}
            >
              Got it!
              <div className="tinyNote">[Enter]</div>
            </button>
            {!wrongEnterArmed && <div className="tinyNote">One moment…</div>}
          </div>
        </div>
      )}

      {celebrateOpen && (
        <div className="modalOverlay" role="dialog" aria-modal="true">
          <div className="modal celebrate">
            <div className="celebrateBig">🎉 LEVEL UP! 🎉</div>
            <div className="celebrateText">
              You completed level {level}. Welcome to level{" "}
              <b>{celebrateNextLevel}</b>!
            </div>
            <button
              className="btn primary modalBtn"
              onClick={closeCelebrate}
              disabled={!celebrateEnterArmed}
            >
              Let’s go!
              <div className="tinyNote">[Enter]</div>
            </button>
            {!celebrateEnterArmed && (
              <div className="tinyNote">One moment…</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
