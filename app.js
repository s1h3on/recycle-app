const MODEL_URL = "./my_model/";
const CONFIDENCE_MIN = 0.6; // 이보다 낮으면 "확실하지 않음"

// 모델 라벨별 분리배출 안내
const INFO = {
  paper: {
    name: "종이", emoji: "📦", color: "#2f80ed",
    guide: [
      "테이프·스테이플·비닐 코팅 등 이물질을 제거하세요.",
      "상자는 펼쳐서 납작하게 접어 배출하세요.",
      "물에 젖거나 음식물이 묻은 종이, 영수증은 일반쓰레기 입니다.",
    ],
  },
  can: {
    name: "캔", emoji: "🥫", color: "#e0a100",
    guide: [
      "내용물을 비우고 물로 헹궈주세요.",
    ],
  },
  plastic: {
    name: "플라스틱", emoji: "🧴", color: "#1f9d55",
    guide: [
      "내용물을 비우고 깨끗이 헹궈주세요."
      
    ],
  },
  general: {
    name: "일반쓰레기", emoji: "🗑️", color: "#7a7a7a",
    guide: [
      "재활용이 어려운 쓰레기예요.",
      "종량제 봉투에 담아 배출하세요.",
    ],
  },
  nothing: {
    name: "없음", emoji: "🔍", color: "#9aa5a0",
    guide: ["버릴 물건을 카메라 가운데에 잘 보이도록 비춰주세요."],
  },
};

const $ = (id) => document.getElementById(id);
let model, webcam, rafId, facing = "environment";

async function init() {
  try {
    model = await tmImage.load(MODEL_URL + "model.json", MODEL_URL + "metadata.json");
    $("status").textContent = "준비 완료! 카메라를 시작하거나 사진을 올려주세요.";
    renderBars(model.getClassLabels().map((c) => ({ className: c, probability: 0 })));
  } catch (e) {
    console.error(e);
    $("status").textContent =
      "모델을 불러오지 못했어요. 파일을 직접 열지 말고 로컬 서버(start.bat)로 실행해 주세요.";
    renderBars(Object.keys(INFO).map((c) => ({ className: c, probability: 0 })));
  }
}

// ---------- 결과 표시 ----------
function render(preds) {
  preds = [...preds].sort((a, b) => b.probability - a.probability);
  const top = preds[0];
  const info = INFO[top.className] || { name: top.className, emoji: "❓", color: "#888", guide: [] };
  const sure = top.probability >= CONFIDENCE_MIN;

  $("status").hidden = true;
  $("verdict").hidden = false;
  $("badge").textContent = sure ? info.emoji : "🤔";
  $("badge").style.background = (sure ? info.color : "#9aa5a0") + "33";
  $("v-title").textContent = sure ? info.name : "잘 모르겠어요";
  $("v-conf").textContent = sure
    ? `확신도 ${(top.probability * 100).toFixed(0)}%`
    : `가장 가까운 후보: ${info.name} (${(top.probability * 100).toFixed(0)}%) · 각도나 조명을 바꿔보세요`;
  $("guide").innerHTML = sure ? info.guide.map((g) => `<li>${g}</li>`).join("") : "";

  renderBars(preds);
}

// 항목별 확률 막대 (모델 라벨 5개 전부 표시)
function renderBars(preds) {
  $("bars").innerHTML = preds
    .map((p) => {
      const i = INFO[p.className] || { name: p.className, color: "#888" };
      const pct = (p.probability * 100).toFixed(0);
      return `<div class="bar"><span>${i.name}<small>${p.className}</small></span>
        <div class="track"><div class="fill" style="width:${pct}%;background:${i.color}"></div></div>
        <span class="pct">${pct}%</span></div>`;
    })
    .join("");
}

// ---------- 카메라 ----------
async function startCam() {
  if (!model) return;
  stopCam();
  $("btn-start").disabled = true;
  try {
    webcam = new tmImage.Webcam(224, 224, facing === "user"); // 전면 카메라만 좌우 반전
    await webcam.setup({ facingMode: facing });
    await webcam.play();
    const box = $("webcam-container");
    box.innerHTML = "";
    box.appendChild(webcam.canvas);
    $("btn-start").hidden = true;
    $("btn-flip").hidden = false;
    $("btn-stop").hidden = false;
    loop();
  } catch (e) {
    console.error(e);
    $("status").hidden = false;
    $("status").textContent = "카메라를 사용할 수 없어요. 권한을 허용했는지 확인해 주세요.";
  } finally {
    $("btn-start").disabled = false;
  }
}

async function loop() {
  webcam.update();
  render(await model.predict(webcam.canvas));
  rafId = requestAnimationFrame(loop);
}

function stopCam() {
  cancelAnimationFrame(rafId);
  if (webcam) webcam.stop();
  webcam = null;
  $("webcam-container").innerHTML = '<div class="placeholder">카메라를 시작해 주세요</div>';
  $("btn-start").hidden = false;
  $("btn-flip").hidden = true;
  $("btn-stop").hidden = true;
}

$("btn-start").onclick = startCam;
$("btn-stop").onclick = stopCam;
$("btn-flip").onclick = () => {
  facing = facing === "environment" ? "user" : "environment";
  startCam();
};

// ---------- 사진 업로드 ----------
// 모델 입력과 같게 가운데를 정사각형으로 잘라 224x224로 맞춤
function toSquareCanvas(img, size = 224) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const s = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - s) / 2;
  const sy = (img.naturalHeight - s) / 2;
  c.getContext("2d").drawImage(img, sx, sy, s, s, 0, 0, size, size);
  return c;
}

function handleFile(file) {
  if (!file || !file.type.startsWith("image/") || !model) return;
  const img = $("preview");
  img.onload = async () => {
    img.hidden = false;
    $("drop-text").hidden = true;
    render(await model.predict(toSquareCanvas(img)));
  };
  img.src = URL.createObjectURL(file);
}

$("file").onchange = (e) => handleFile(e.target.files[0]);
const drop = $("drop");
drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); };
drop.ondragleave = () => drop.classList.remove("over");
drop.ondrop = (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  handleFile(e.dataTransfer.files[0]);
};

// ---------- 탭 ----------
function showTab(name) {
  const cam = name === "cam";
  $("tab-cam").classList.toggle("active", cam);
  $("tab-upload").classList.toggle("active", !cam);
  $("panel-cam").hidden = !cam;
  $("panel-upload").hidden = cam;
  if (!cam) stopCam();
}
$("tab-cam").onclick = () => showTab("cam");
$("tab-upload").onclick = () => showTab("upload");

init();
