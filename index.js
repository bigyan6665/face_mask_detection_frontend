
// ***************************** States ***********************************
let selectedFile = null;
let webcamStream = null;
let capturedCanvas = null;

const API = () => document.getElementById('server-url').value.replace(/\/$/, '');

// *********************** DOM references ******************************
const uploadZone = document.getElementById('upload-zone');
const fileInput = document.getElementById('file-input');
const previewCont = document.getElementById('preview-container');
const previewImg = document.getElementById('preview-img');
const clearBtn = document.getElementById('clear-btn');
const webcamSection = document.getElementById('webcam-section');
const webcamEl = document.getElementById('webcam');
const webcamBtn = document.getElementById('webcam-btn');
const captureBtn = document.getElementById('capture-btn');
const stopWebcamBtn = document.getElementById('stop-webcam-btn');
const detectBtn = document.getElementById('detect-btn');
const btnSpinner = document.getElementById('btn-spinner');
const btnText = document.getElementById('btn-text');
const loadingOverlay = document.getElementById('loading-overlay');
const faceList = document.getElementById('face-list');
const emptyState = document.getElementById('empty-state');
const statsRow = document.getElementById('stats-row');
const resultImageCont = document.getElementById('result-image-container');
const resultImage = document.getElementById('result-image');
const statusDot = document.getElementById('status-dot');
const toast = document.getElementById('toast');

// ******************************** Health check ******************************
async function checkHealth() {
    try {
        const res = await fetch(`${API()}/health`, { signal: AbortSignal.timeout(3000) });
        const ok = res.ok;
        statusDot.className = 'status-dot ' + (ok ? 'online' : 'offline');
        showToast(ok ? '✅ Server online' : '❌ Server error', ok ? 'green' : null);
    } catch {
        statusDot.className = 'status-dot offline';
        showToast('❌ Cannot reach server');
    }
}
checkHealth();

// **************************** Upload zone ***********************************
uploadZone.addEventListener('click', () => { if (!selectedFile) fileInput.click(); });
fileInput.addEventListener('change', e => setFile(e.target.files[0]));

uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
    e.preventDefault();
    uploadZone.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('image/')) setFile(f);
});

function setFile(file) {
    if (!file) return;
    selectedFile = file;
    capturedCanvas = null;
    const url = URL.createObjectURL(file);
    previewImg.src = url;
    previewCont.style.display = 'block';
    uploadZone.style.display = 'none';
    detectBtn.disabled = false;
    stopWebcam();
}

clearBtn.addEventListener('click', clearSelection);
function clearSelection() {
    selectedFile = null;
    capturedCanvas = null;
    fileInput.value = '';
    previewCont.style.display = 'none';
    uploadZone.style.display = 'block';
    detectBtn.disabled = true;
    resetResults();
}



// **************** Webcam ********************
webcamBtn.addEventListener('click', async () => {
    clearSelection();
    try {
        webcamStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
        webcamEl.srcObject = webcamStream;
        webcamSection.style.display = 'block';
        webcamBtn.style.display = 'none';
    } catch {
        showToast('❌ Cannot access webcam');
    }
});

captureBtn.addEventListener('click', () => {
    const canvas = document.createElement('canvas');
    canvas.width = webcamEl.videoWidth;
    canvas.height = webcamEl.videoHeight;
    canvas.getContext('2d').drawImage(webcamEl, 0, 0);
    capturedCanvas = canvas;

    // Show as preview
    previewImg.src = canvas.toDataURL('image/png');
    previewCont.style.display = 'block';
    detectBtn.disabled = false;
    stopWebcam();
});

stopWebcamBtn.addEventListener('click', stopWebcam);

function stopWebcam() {
    if (webcamStream) {
        webcamStream.getTracks().forEach(t => t.stop());
        webcamStream = null;
    }
    webcamSection.style.display = 'none';
    webcamBtn.style.display = 'block';
}

// ********************** Detection ************************
detectBtn.addEventListener('click', detect);

// async function detect() {
//     let blob;

//     if (capturedCanvas) {
//         blob = await new Promise(res => capturedCanvas.toBlob(res, 'image/png'));
//     } else if (selectedFile) {
//         blob = selectedFile;
//     } else {
//         showToast('No image selected');
//         return;
//     }

//     setLoading(true);

//     try {
//         const form = new FormData();
//         form.append('file', blob, 'image.png');

//         const res = await fetch(`${API()}/detect`, { method: 'POST', body: form });
//         if (!res.ok) {
//             const err = await res.json();
//             throw new Error(err.error || `HTTP ${res.status}`);
//         }

//         const data = await res.json();
//         renderResults(data);
//     } catch (e) {
//         showToast('❌ ' + e.message);
//     } finally {
//         setLoading(false);
//     }
// }
async function detect() {
    let blob;

    if (capturedCanvas) {
        blob = await new Promise(res => capturedCanvas.toBlob(res, 'image/png'));
    } else if (selectedFile) {
        blob = selectedFile;

        // ✅ Validate file type
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];

        if (!allowedTypes.includes(blob.type)) {
            showToast('❌ Only JPG, PNG, and WEBP images are allowed');
            return;
        }
    } else {
        showToast('No image selected');
        return;
    }

    setLoading(true);

    try {
        const form = new FormData();
        form.append('file', blob, 'image.png');

        const res = await fetch(`${API()}/detect`, { method: 'POST', body: form });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || `HTTP ${res.status}`);
        }

        const data = await res.json();
        renderResults(data);

    } catch (e) {
        showToast('❌ ' + e.message);
    } finally {
        setLoading(false);
    }
}

// ********************** Rendering results *******************************
const COLOR_MAP = {
    without_mask: { hex: '#ef4444', label: 'No Mask', bar: '#ef4444' },
    with_mask: { hex: '#22c55e', label: 'Mask On', bar: '#22c55e' },
    // mask_weared_incorrect: { hex: '#f97316', label: 'Mask Incorrect', bar: '#f97316' },
};

function renderResults(data) {
    // Annotated image
    resultImage.src = 'data:image/png;base64,' + data.annotated_image;
    resultImageCont.style.display = 'block';

    // Summary stats
    const s = data.summary;
    document.getElementById('stat-total').textContent = s.total_faces;
    // document.getElementById('stat-masked').textContent = s.with_mask + s.incorrect_mask;
    document.getElementById('stat-masked').textContent = s.with_mask;
    document.getElementById('stat-unmasked').textContent = s.no_mask;
    statsRow.style.display = 'grid';

    // Face cards
    faceList.innerHTML = '';

    if (data.faces.length === 0) {
        faceList.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <p>No faces were detected in this image.</p>
        </div>`;
        return;
    }

    data.faces.forEach((face, i) => {
        const meta = COLOR_MAP[face.label] || { hex: '#6b6b8a', label: face.label };
        const probs = face.probabilities;

        const item = document.createElement('div');
        item.className = 'face-item';
        item.innerHTML = `
        <div class="face-header">
          <div class="face-dot" style="background:${meta.hex}"></div>
          <div class="face-label">${meta.label}</div>
          <div class="face-conf">det. ${(face.mask_confidence * 100).toFixed(1)}%</div>
        </div>
        ${Object.entries(probs).map(([k, v]) => {
            const m = COLOR_MAP[k] || { hex: '#6b6b8a', label: k };
            return `
          <div class="prob-bar-row">
            <div class="prob-label">
              <span>${m.label}</span>
              <span>${(v * 100).toFixed(1)}%</span>
            </div>
            <div class="prob-track">
              <div class="prob-fill" style="width:${v * 100}%; background:${m.bar}"></div>
            </div>
          </div>`;
        }).join('')}
      `;
        faceList.appendChild(item);
    });
}

function resetResults() {
    faceList.innerHTML = '';
    faceList.appendChild(emptyState);
    statsRow.style.display = 'none';
    resultImageCont.style.display = 'none';
}

// ************************ Helpers ***********************
function setLoading(on) {
    loadingOverlay.classList.toggle('active', on);
    detectBtn.disabled = on;
    btnSpinner.style.display = on ? 'block' : 'none';
    btnText.textContent = on ? 'Analyzing…' : '🔍 Detect Masks';
}

let toastTimer;
function showToast(msg, type) {
    toast.textContent = msg;
    toast.style.background = type === 'green' ? 'var(--green)' : 'var(--red)';
    toast.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.style.display = 'none'; }, 3200);
}